import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  PC_BUILDER_CHECKOUT_COOKIE,
  findPcBuilderBuildMatches,
  parsePcBuilderCheckoutCookie,
  type PcBuilderCheckoutBuild,
} from "@/lib/pc-builder-checkout";
import { pcBuilderCartLineKey } from "@/lib/pc-builder-cart-line";
import { pcBuildSelectionId } from "@/lib/pc-builder-grouping";
import { validatePcBuilderSelectionLive } from "@/lib/storefront-pc-builder";
import {
  DELETE as coreDELETE,
  GET as coreGET,
  POST as corePOST,
} from "./route-core";

export { coreDELETE as DELETE };

type CartBuildMapRow = {
  cartItemId: number;
  buildId: string;
  slot: string;
};

type BuildMatch = {
  build: PcBuilderCheckoutBuild;
  slot: string;
};

type CartItemRow = {
  id: number;
  quantity: number;
  productId: number;
  variantId: number | null;
};

async function getCartBuildMapping(cartItemId: number) {
  const rows = await prisma.$queryRawUnsafe<CartBuildMapRow[]>(
    'SELECT "cartItemId", "buildId", "slot" FROM "PcBuildCartItem" WHERE "cartItemId" = $1 LIMIT 1',
    cartItemId,
  );
  return rows[0] ?? null;
}

async function buildSlotAlreadyMapped(
  userId: string,
  buildId: string,
  slot: string,
) {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    'SELECT EXISTS (SELECT 1 FROM "PcBuildCartItem" m INNER JOIN "CartItem" c ON c."id" = m."cartItemId" WHERE c."userId" = $1 AND m."buildId" = $2 AND m."slot" = $3) AS "exists"',
    userId,
    buildId,
    slot,
  );
  return Boolean(rows[0]?.exists);
}

async function chooseBuildMatch(
  userId: string,
  matches: BuildMatch[],
  requestedBuildId: string | null,
) {
  if (requestedBuildId) {
    const exact = matches.find((match) => match.build.buildId === requestedBuildId);
    if (exact) return exact;
  }

  for (const match of matches) {
    if (!(await buildSlotAlreadyMapped(userId, match.build.buildId, match.slot))) {
      return match;
    }
  }

  return matches.at(-1) ?? null;
}

async function findBuildCartRow(
  userId: string,
  productId: number,
  variantId: number,
  lineKey: string,
) {
  const rows = await prisma.$queryRawUnsafe<CartItemRow[]>(
    'SELECT "id", "quantity", "productId", "variantId" FROM "CartItem" WHERE "userId" = $1 AND "productId" = $2 AND "variantId" = $3 AND "lineKey" = $4 LIMIT 1',
    userId,
    productId,
    variantId,
    lineKey,
  );
  return rows[0] ?? null;
}

export async function GET() {
  const response = await coreGET();
  if (!response.ok) return response;

  const payload = (await response.clone().json().catch(() => null)) as
    | { items?: Array<Record<string, unknown>> }
    | null;
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const ids = items
    .map((item) => Number(item.id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return response;

  const rows = await prisma.$queryRawUnsafe<CartBuildMapRow[]>(
    `SELECT "cartItemId", "buildId", "slot" FROM "PcBuildCartItem" WHERE "cartItemId" IN (${ids.join(",")})`,
  );
  const byId = new Map(rows.map((row) => [row.cartItemId, row]));

  return NextResponse.json({
    ...payload,
    items: items.map((item) => {
      const mapping = byId.get(Number(item.id));
      return mapping
        ? { ...item, pcBuildId: mapping.buildId, pcBuildSlot: mapping.slot }
        : { ...item, pcBuildId: null, pcBuildSlot: null };
    }),
  });
}

export async function POST(request: NextRequest) {
  const requestForCore = request.clone();
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return corePOST(requestForCore);

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
  } catch {
    return corePOST(requestForCore);
  }

  const selectionId = pcBuildSelectionId({
    productId: body.productId as string | number,
    variantId: body.variantId as string | number | null | undefined,
  });
  if (!selectionId) return corePOST(requestForCore);

  const state = parsePcBuilderCheckoutCookie(
    request.cookies.get(PC_BUILDER_CHECKOUT_COOKIE)?.value,
  );
  if (!state) return corePOST(requestForCore);

  const matches = findPcBuilderBuildMatches(state, selectionId);
  if (matches.length === 0) return corePOST(requestForCore);

  const requestedBuildId =
    typeof body.pcBuildId === "string" ? body.pcBuildId.trim() : null;
  const match = await chooseBuildMatch(
    userId,
    matches as BuildMatch[],
    requestedBuildId,
  );
  if (!match) {
    return NextResponse.json(
      {
        error: "No available PC Builder cart line could be resolved safely.",
        code: "PC_BUILDER_CART_LINE_UNAVAILABLE",
      },
      { status: 409 },
    );
  }

  const liveBuild = await validatePcBuilderSelectionLive(match.build.selections);
  if (liveBuild.missingSlots.length > 0 || !liveBuild.evaluation.canAddToCart) {
    return NextResponse.json(
      {
        error:
          "This PC build is no longer cart-ready. Review current warehouse stock and compatibility before adding it again.",
        code: "PC_BUILDER_CART_REVALIDATION_FAILED",
        buildId: match.build.buildId,
        missingSlots: liveBuild.missingSlots,
        issues: liveBuild.evaluation.issues,
      },
      { status: 409 },
    );
  }

  const productId = Number(body.productId);
  const variantId = Number(body.variantId);
  if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(variantId) || variantId < 1) {
    return NextResponse.json(
      { error: "PC Builder requires an exact product variant." },
      { status: 400 },
    );
  }

  const lineKey = pcBuilderCartLineKey(match.build.buildId);
  if (!lineKey) {
    return NextResponse.json(
      {
        error: "PC Builder cart identity is invalid.",
        code: "PC_BUILDER_CART_LINE_UNAVAILABLE",
      },
      { status: 409 },
    );
  }

  const existing = await findBuildCartRow(userId, productId, variantId, lineKey);
  if (existing) {
    const mapping = await getCartBuildMapping(existing.id);
    if (
      mapping?.buildId === match.build.buildId &&
      mapping.slot === match.slot &&
      existing.quantity === 1
    ) {
      return NextResponse.json(
        {
          ...existing,
          pcBuildId: mapping.buildId,
          pcBuildSlot: mapping.slot,
        },
        { status: 201 },
      );
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<CartItemRow[]>(
      'INSERT INTO "CartItem" ("userId", "productId", "variantId", "quantity", "lineKey") VALUES ($1, $2, $3, 1, $4) ON CONFLICT ("userId", "productId", "variantId", "lineKey") DO UPDATE SET "quantity" = 1 RETURNING "id", "quantity", "productId", "variantId"',
      userId,
      productId,
      variantId,
      lineKey,
    );
    const row = rows[0];
    if (!row) {
      throw new Error("PC_BUILDER_CART_LINE_INSERT_FAILED");
    }

    await tx.$executeRawUnsafe(
      'INSERT INTO "PcBuildCartItem" ("cartItemId", "buildId", "slot") VALUES ($1, $2, $3) ON CONFLICT ("cartItemId") DO UPDATE SET "buildId" = EXCLUDED."buildId", "slot" = EXCLUDED."slot"',
      row.id,
      match.build.buildId,
      match.slot,
    );
    return row;
  });

  return NextResponse.json(
    {
      ...created,
      pcBuildId: match.build.buildId,
      pcBuildSlot: match.slot,
    },
    { status: 201 },
  );
}
