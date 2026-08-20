import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  PC_BUILDER_CHECKOUT_COOKIE,
  findPcBuilderBuildMatches,
  parsePcBuilderCheckoutCookie,
} from "@/lib/pc-builder-checkout";
import { pcBuildSelectionId } from "@/lib/pc-builder-grouping";
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

async function getCartBuildMapping(cartItemId: number) {
  const rows = await prisma.$queryRawUnsafe<CartBuildMapRow[]>(
    'SELECT "cartItemId", "buildId", "slot" FROM "PcBuildCartItem" WHERE "cartItemId" = $1 LIMIT 1',
    cartItemId,
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
  if (matches.length > 1) {
    return NextResponse.json(
      {
        error:
          "This component belongs to more than one active validated PC build. Checkout or remove one build first.",
        code: "PC_BUILDER_CART_GROUPING_AMBIGUOUS",
      },
      { status: 409 },
    );
  }

  const match = matches[0];
  const productId = Number(body.productId);
  const variantId = Number(body.variantId);
  const existing = await prisma.cartItem.findFirst({
    where: { userId, productId, variantId },
    select: { id: true, quantity: true, productId: true, variantId: true },
  });

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

    return NextResponse.json(
      {
        error:
          "This component already exists in the cart outside this PC build. Remove the existing row before adding the validated build.",
        code: "PC_BUILDER_CART_GROUP_CONFLICT",
      },
      { status: 409 },
    );
  }

  const response = await corePOST(requestForCore);
  if (!response.ok) return response;
  const created = (await response.clone().json().catch(() => null)) as
    | { id?: number; quantity?: number }
    | null;
  const cartItemId = Number(created?.id);
  if (!Number.isInteger(cartItemId) || cartItemId < 1 || Number(created?.quantity) !== 1) {
    return NextResponse.json(
      {
        error: "PC build cart grouping could not be persisted safely.",
        code: "PC_BUILDER_CART_GROUPING_FAILED",
      },
      { status: 500 },
    );
  }

  await prisma.$executeRawUnsafe(
    'INSERT INTO "PcBuildCartItem" ("cartItemId", "buildId", "slot") VALUES ($1, $2, $3) ON CONFLICT ("cartItemId") DO UPDATE SET "buildId" = EXCLUDED."buildId", "slot" = EXCLUDED."slot"',
    cartItemId,
    match.build.buildId,
    match.slot,
  );

  return NextResponse.json(
    {
      ...created,
      pcBuildId: match.build.buildId,
      pcBuildSlot: match.slot,
    },
    { status: 201 },
  );
}
