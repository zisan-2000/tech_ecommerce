import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import {
  PC_BUILDER_CHECKOUT_COOKIE,
  PC_BUILDER_CHECKOUT_COOKIE_MAX_AGE,
  parsePcBuilderCheckoutCookie,
  removePcBuilderCheckoutBuild,
  serializePcBuilderCheckoutState,
} from "@/lib/pc-builder-checkout";
import { prisma } from "@/lib/prisma";
import { replayNextRequest } from "@/lib/replay-next-request";
import { DELETE as coreDELETE, PATCH as corePATCH } from "./route-core";

type CartBuildMapRow = {
  cartItemId: number;
  buildId: string;
  slot: string;
};

async function getMapping(cartItemId: number, userId: string) {
  const rows = await prisma.$queryRawUnsafe<CartBuildMapRow[]>(
    'SELECT m."cartItemId", m."buildId", m."slot" FROM "PcBuildCartItem" m INNER JOIN "CartItem" c ON c."id" = m."cartItemId" WHERE m."cartItemId" = $1 AND c."userId" = $2 LIMIT 1',
    cartItemId,
    userId,
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

function syncCheckoutCookieAfterBuildRemoval(
  request: NextRequest,
  response: NextResponse,
  buildId: string,
) {
  const currentState = parsePcBuilderCheckoutCookie(
    request.cookies.get(PC_BUILDER_CHECKOUT_COOKIE)?.value,
  );
  if (!currentState) return response;

  const nextState = removePcBuilderCheckoutBuild(currentState, buildId);
  if (nextState.builds.length === 0) {
    response.cookies.set(PC_BUILDER_CHECKOUT_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  }

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
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return corePATCH(request, ctx);

  const { id } = await ctx.params;
  const cartItemId = Number(id);
  if (!Number.isInteger(cartItemId) || cartItemId < 1) {
    return corePATCH(request, { params: Promise.resolve({ id }) });
  }

  const mapping = await getMapping(cartItemId, userId);
  if (!mapping) {
    return corePATCH(request, { params: Promise.resolve({ id }) });
  }

  const rawBody = await request.text();
  const requestForCore = replayNextRequest(request, rawBody);
  let quantity = Number.NaN;
  try {
    const body = JSON.parse(rawBody);
    quantity = Number(body?.quantity);
  } catch {
    return corePATCH(requestForCore, { params: Promise.resolve({ id }) });
  }

  if (quantity <= 0) {
    const removedCount = await removeBuild(userId, mapping.buildId);
    return syncCheckoutCookieAfterBuildRemoval(
      request,
      NextResponse.json({
        message: "PC build removed",
        pcBuildId: mapping.buildId,
        removedCount,
      }),
      mapping.buildId,
    );
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

  const mapping = await getMapping(cartItemId, userId);
  if (!mapping) {
    return coreDELETE(request, { params: Promise.resolve({ id }) });
  }

  const removedCount = await removeBuild(userId, mapping.buildId);
  return syncCheckoutCookieAfterBuildRemoval(
    request,
    NextResponse.json({
      message: "PC build removed",
      pcBuildId: mapping.buildId,
      removedCount,
    }),
    mapping.buildId,
  );
}
