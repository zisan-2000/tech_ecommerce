import { NextResponse } from "next/server";
import {
  PC_BUILDER_SLOTS,
  parsePcBuilderSelectionId,
  type PcBuilderSlotKey,
} from "@/lib/pc-builder";
import { rateLimitRequest } from "@/lib/request-security";
import { validatePcBuilderSelectionLive } from "@/lib/storefront-pc-builder";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export async function POST(request: Request) {
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
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("PC Builder live validation failed", error);
    return NextResponse.json(
      { error: "The build could not be validated safely" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
