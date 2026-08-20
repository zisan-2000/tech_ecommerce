import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DELETE as coreDELETE, PATCH as corePATCH } from "./route-core";

type CartBuildMapRow = {
  cartItemId: number;
  buildId: string;
  slot: string;
};

async function getMapping(cartItemId: number) {
  const rows = await prisma.$queryRawUnsafe<CartBuildMapRow[]>(
    'SELECT "cartItemId", "buildId", "slot" FROM "PcBuildCartItem" WHERE "cartItemId" = $1 LIMIT 1',
    cartItemId,
  );
  return rows[0] ?? null;
}

async function removeBuild(userId: string, buildId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ cartItemId: number }>>(
    'SELECT m."cartItemId" FROM "PcBuildCartItem" m INNER JOIN "CartItem" c ON c."id" = m."cartItemId" WHERE c."userId" = $1 AND m."buildId" = $2',
    userId,
    buildId,
  );
  const ids = rows.map((row) => row.cartItemId);
  if (ids.length) {
    await prisma.cartItem.deleteMany({
      where: { userId, id: { in: ids } },
    });
  }
  return ids.length;
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const requestForCore = request.clone();
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return corePATCH(requestForCore, ctx);

  const { id } = await ctx.params;
  const cartItemId = Number(id);
  if (!Number.isInteger(cartItemId) || cartItemId < 1) {
    return corePATCH(requestForCore, { params: Promise.resolve({ id }) });
  }

  const mapping = await getMapping(cartItemId);
  if (!mapping) {
    return corePATCH(requestForCore, { params: Promise.resolve({ id }) });
  }

  let quantity = Number.NaN;
  try {
    const body = await request.json();
    quantity = Number(body?.quantity);
  } catch {
    return corePATCH(requestForCore, { params: Promise.resolve({ id }) });
  }

  if (quantity <= 0) {
    const removedCount = await removeBuild(userId, mapping.buildId);
    return NextResponse.json({
      message: "PC build removed",
      pcBuildId: mapping.buildId,
      removedCount,
    });
  }

  if (quantity !== 1) {
    return NextResponse.json(
      {
        error: "PC build component quantity is locked at 1. Add another validated build instead.",
        code: "PC_BUILD_COMPONENT_QUANTITY_LOCKED",
        pcBuildId: mapping.buildId,
      },
      { status: 409 },
    );
  }

  return corePATCH(requestForCore, { params: Promise.resolve({ id }) });
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const { id } = await ctx.params;
  const cartItemId = Number(id);
  if (!userId || !Number.isInteger(cartItemId) || cartItemId < 1) {
    return coreDELETE(request, { params: Promise.resolve({ id }) });
  }

  const mapping = await getMapping(cartItemId);
  if (!mapping) {
    return coreDELETE(request, { params: Promise.resolve({ id }) });
  }

  const removedCount = await removeBuild(userId, mapping.buildId);
  return NextResponse.json({
    message: "PC build removed",
    pcBuildId: mapping.buildId,
    removedCount,
  });
}
