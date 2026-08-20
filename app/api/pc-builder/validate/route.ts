import { NextRequest, NextResponse } from "next/server";
import {
  PC_BUILDER_SLOTS,
  parsePcBuilderSelectionId,
  type PcBuilderSlotKey,
} from "@/lib/pc-builder";
import {
  PC_BUILDER_CHECKOUT_COOKIE,
  PC_BUILDER_CHECKOUT_COOKIE_MAX_AGE,
  PC_BUILDER_CHECKOUT_MAX_BUILDS,
  appendPcBuilderCheckoutBuild,
  createPcBuilderCheckoutBuild,
  parsePcBuilderCheckoutCookie,
  serializePcBuilderCheckoutState,
} from "@/lib/pc-builder-checkout";
import { createPcBuildId } from "@/lib/pc-builder-grouping";
import { rateLimitRequest } from "@/lib/request-security";
import { validatePcBuilderSelectionLive } from "@/lib/storefront-pc-builder";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export async function POST(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 4096) {
      return NextResponse.json(
        { error: "Request is too large" },
        { status: 413, headers: NO_STORE_HEADERS },
      );
    }

    const rateLimit = await rateLimitRequest(request, {
      scope: "pc-builder-validation",
      limit: 60,
      windowMs: 5 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many validation requests. Please try again shortly." },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            "Retry-After": String(rateLimit.retryAfter),
          },
        },
      );
    }

    const body = await request.json();
    const source =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>).selections
        : null;
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return NextResponse.json(
        { error: "A valid component selection is required" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const selections: Partial<Record<PcBuilderSlotKey, string>> = {};
    for (const slot of PC_BUILDER_SLOTS) {
      const parsed = parsePcBuilderSelectionId(
        (source as Record<string, unknown>)[slot.key],
      );
      if (parsed) selections[slot.key] = parsed.selectionId;
    }
    if (Object.keys(selections).length === 0) {
      return NextResponse.json(
        { error: "No valid components were supplied" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const result = await validatePcBuilderSelectionLive(selections);
    if (result.missingSlots.length > 0 || !result.evaluation.canAddToCart) {
      return NextResponse.json(result, { headers: NO_STORE_HEADERS });
    }

    const buildId = createPcBuildId();
    const build = createPcBuilderCheckoutBuild(buildId, selections);
    const currentState = parsePcBuilderCheckoutCookie(
      request.cookies.get(PC_BUILDER_CHECKOUT_COOKIE)?.value,
    );
    const nextState = appendPcBuilderCheckoutBuild(currentState, build);
    if (!nextState) {
      return NextResponse.json(
        {
          error: `PC Builder can track up to ${PC_BUILDER_CHECKOUT_MAX_BUILDS} active builds. Checkout or remove an existing build first.`,
          code: "PC_BUILDER_ACTIVE_BUILD_LIMIT",
        },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }

    const response = NextResponse.json(
      { ...result, buildId },
      { headers: NO_STORE_HEADERS },
    );
    response.cookies.set(
      PC_BUILDER_CHECKOUT_COOKIE,
      serializePcBuilderCheckoutState(nextState),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: PC_BUILDER_CHECKOUT_COOKIE_MAX_AGE,
      },
    );
    return response;
  } catch (error) {
    console.error("PC Builder live validation failed", error);
    return NextResponse.json(
      { error: "The build could not be validated safely" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
