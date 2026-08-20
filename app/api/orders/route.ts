import { NextRequest, NextResponse } from "next/server";
import {
  PC_BUILDER_CHECKOUT_COOKIE,
  parsePcBuilderCheckoutCookie,
  pcBuilderCheckoutManifestTouchesItems,
  validatePcBuilderCheckoutManifestItems,
} from "@/lib/pc-builder-checkout";
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

export async function POST(request: NextRequest) {
  const requestForCore = request.clone();
  const rawManifest = request.cookies.get(PC_BUILDER_CHECKOUT_COOKIE)?.value;
  if (!rawManifest) {
    return corePOST(requestForCore);
  }

  const manifest = parsePcBuilderCheckoutCookie(rawManifest);
  if (!manifest) {
    return clearPcBuilderCheckoutCookie(
      NextResponse.json(
        {
          error:
            "PC Builder checkout state is invalid. Please retry checkout after refreshing your cart.",
          code: "PC_BUILDER_CHECKOUT_MANIFEST_INVALID",
        },
        { status: 409 },
      ),
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return corePOST(requestForCore);
  }

  const items =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).items
      : null;
  if (!Array.isArray(items)) {
    return corePOST(requestForCore);
  }

  if (!pcBuilderCheckoutManifestTouchesItems(manifest, items)) {
    const response = await corePOST(requestForCore);
    return clearPcBuilderCheckoutCookie(response);
  }

  const membership = validatePcBuilderCheckoutManifestItems(manifest, items);
  if (!membership.ok) {
    return NextResponse.json(
      {
        error:
          "Your PC Builder cart changed after validation. Restore the missing build components or return to PC Builder.",
        code: "PC_BUILDER_CART_CHANGED",
        missingSlots: membership.missingSlots,
      },
      { status: 409 },
    );
  }

  const liveBuild = await validatePcBuilderSelectionLive(manifest.selections);
  if (
    liveBuild.missingSlots.length > 0 ||
    !liveBuild.evaluation.canAddToCart
  ) {
    return NextResponse.json(
      {
        error:
          "Your PC build is no longer checkout-ready. Review current stock and compatibility before placing the order.",
        code: "PC_BUILDER_CHECKOUT_REVALIDATION_FAILED",
        missingSlots: liveBuild.missingSlots,
        issues: liveBuild.evaluation.issues,
      },
      { status: 409 },
    );
  }

  const response = await corePOST(requestForCore);
  return response.ok ? clearPcBuilderCheckoutCookie(response) : response;
}
