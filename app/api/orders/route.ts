import { NextRequest, NextResponse } from "next/server";
import {
  PC_BUILDER_CHECKOUT_COOKIE,
  parsePcBuilderCheckoutCookie,
  type PcBuilderCheckoutBuild,
} from "@/lib/pc-builder-checkout";
import { pcBuildSelectionId } from "@/lib/pc-builder-grouping";
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

function selectedItemMap(items: Array<Record<string, unknown>>) {
  const result = new Map<string, Record<string, unknown>>();
  for (const item of items) {
    const selectionId = pcBuildSelectionId({
      productId: item.productId as string | number,
      variantId: item.variantId as string | number | null | undefined,
    });
    if (selectionId) result.set(selectionId, item);
  }
  return result;
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

  const bySelection = selectedItemMap(items);
  const matchedBuilds: PcBuilderCheckoutBuild[] = [];
  const claimedSelectionIds = new Set<string>();

  for (const build of state.builds) {
    const expected = Object.values(build.selections).filter(
      (value): value is string => Boolean(value),
    );
    const touched = expected.filter((selectionId) => bySelection.has(selectionId));
    if (!touched.length) continue;

    if (touched.length !== expected.length) {
      return NextResponse.json(
        {
          error:
            "Your PC Builder cart changed after validation. Restore the missing build components or return to PC Builder.",
          code: "PC_BUILDER_CART_CHANGED",
          buildId: build.buildId,
        },
        { status: 409 },
      );
    }

    for (const selectionId of expected) {
      const item = bySelection.get(selectionId);
      if (Number(item?.quantity ?? 0) !== 1) {
        return NextResponse.json(
          {
            error: "PC build component quantity must remain 1 at checkout.",
            code: "PC_BUILD_COMPONENT_QUANTITY_LOCKED",
            buildId: build.buildId,
          },
          { status: 409 },
        );
      }
      if (claimedSelectionIds.has(selectionId)) {
        return NextResponse.json(
          {
            error:
              "Two active PC builds share the same cart component, so grouping is ambiguous. Checkout or remove one build first.",
            code: "PC_BUILDER_CART_GROUPING_AMBIGUOUS",
          },
          { status: 409 },
        );
      }
      claimedSelectionIds.add(selectionId);
    }

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

    matchedBuilds.push(build);
  }

  const response = await corePOST(coreRequest(request, rawBody), {
    pcBuilderBuilds: matchedBuilds,
  });
  if (!response.ok) return response;

  return clearPcBuilderCheckoutCookie(response);
}
