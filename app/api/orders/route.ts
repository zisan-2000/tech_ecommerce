import { NextRequest, NextResponse } from "next/server";
import {
  PC_BUILDER_CHECKOUT_COOKIE,
  parsePcBuilderCheckoutCookie,
} from "@/lib/pc-builder-checkout";
import { matchPcBuilderBuildsToOrderItems } from "@/lib/pc-builder-order-match";
import { validatePcBuilderSelectionLive } from "@/lib/storefront-pc-builder";
import { GET, POST as corePOST } from "./route-core";

export { GET };

function clearPcBuilderCheckoutCookie(response: NextResponse) {
  response.cookies.set(PC_BUILDER_CHECKOUT_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

function coreRequest(request: NextRequest, rawBody: string) {
  return new NextRequest(request.url, {
    method: "POST",
    headers: request.headers,
    body: rawBody,
  });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    body =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
  } catch {
    return corePOST(coreRequest(request, rawBody));
  }

  const items = Array.isArray(body.items)
    ? (body.items as Array<Record<string, unknown>>)
    : [];
  if (!items.length) return corePOST(coreRequest(request, rawBody));

  const rawState = request.cookies.get(PC_BUILDER_CHECKOUT_COOKIE)?.value;
  if (!rawState) return corePOST(coreRequest(request, rawBody));

  const state = parsePcBuilderCheckoutCookie(rawState);
  if (!state) {
    return clearPcBuilderCheckoutCookie(
      NextResponse.json(
        {
          error:
            "PC Builder checkout state is invalid. Return to PC Builder and validate the build again.",
          code: "PC_BUILDER_CHECKOUT_MANIFEST_INVALID",
        },
        { status: 409 },
      ),
    );
  }

  const matched = matchPcBuilderBuildsToOrderItems(state.builds, items);
  if (matched.error) {
    const errorMessage =
      matched.error.code === "PC_BUILD_COMPONENT_QUANTITY_LOCKED"
        ? "PC build component quantity must remain 1 at checkout."
        : matched.error.code === "PC_BUILDER_CART_GROUPING_AMBIGUOUS"
          ? "PC Builder cart grouping is ambiguous. Restore the validated build rows before checkout."
          : "Your PC Builder cart changed after validation. Restore the missing build components or return to PC Builder.";

    return NextResponse.json(
      {
        error: errorMessage,
        code: matched.error.code,
        ...(matched.error.buildId ? { buildId: matched.error.buildId } : {}),
      },
      { status: 409 },
    );
  }

  for (const build of matched.builds) {
    const liveBuild = await validatePcBuilderSelectionLive(build.selections);
    if (liveBuild.missingSlots.length > 0 || !liveBuild.evaluation.canAddToCart) {
      return NextResponse.json(
        {
          error:
            "Your PC build is no longer checkout-ready. Review current stock and compatibility before placing the order.",
          code: "PC_BUILDER_CHECKOUT_REVALIDATION_FAILED",
          buildId: build.buildId,
          missingSlots: liveBuild.missingSlots,
          issues: liveBuild.evaluation.issues,
        },
        { status: 409 },
      );
    }
  }

  const response = await corePOST(coreRequest(request, rawBody), {
    pcBuilderBuilds: matched.builds,
  });
  if (!response.ok) return response;

  return clearPcBuilderCheckoutCookie(response);
}
