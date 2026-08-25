import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getCurrentPriceSnapshot,
  upsertPriceDropAlert,
} from "@/lib/price-drop-alerts";

function parseId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function getUserId() {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const productId = parseId(searchParams.get("productId"));
    const variantId = searchParams.has("variantId")
      ? parseId(searchParams.get("variantId"))
      : null;

    const alerts = await prisma.priceDropAlert.findMany({
      where: {
        userId,
        active: true,
        ...(productId ? { productId } : {}),
        ...(searchParams.has("variantId") ? { variantId } : {}),
      },
      include: {
        product: {
          select: { id: true, name: true, image: true, slug: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({
      items: alerts.map((alert) => ({
        id: alert.id,
        productId: alert.productId,
        variantId: alert.variantId,
        baselinePrice: Number(alert.baselinePrice),
        currency: alert.currency,
        lastNotifiedAt: alert.lastNotifiedAt?.toISOString() ?? null,
        updatedAt: alert.updatedAt.toISOString(),
        product: alert.product,
      })),
    });
  } catch (error) {
    console.error("Failed to load price drop alerts:", error);
    return NextResponse.json(
      { error: "Failed to load price drop alerts." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const productId = parseId(body.productId);
    const variantId = body.variantId ? parseId(body.variantId) : null;
    if (!productId || (body.variantId && !variantId)) {
      return NextResponse.json(
        { error: "A valid product id is required." },
        { status: 400 },
      );
    }

    const alert = await upsertPriceDropAlert({ userId, productId, variantId });
    if (!alert) {
      return NextResponse.json(
        { error: "Product is not available." },
        { status: 404 },
      );
    }

    const snapshot = await getCurrentPriceSnapshot({ productId, variantId });
    return NextResponse.json(
      {
        id: alert.id,
        productId: alert.productId,
        variantId: alert.variantId,
        baselinePrice: Number(alert.baselinePrice),
        currency: alert.currency,
        currentPrice: snapshot?.price ?? Number(alert.baselinePrice),
        active: alert.active,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to save price drop alert:", error);
    return NextResponse.json(
      { error: "Failed to save price drop alert." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const productId = parseId(searchParams.get("productId"));
    const variantId = searchParams.has("variantId")
      ? parseId(searchParams.get("variantId"))
      : null;
    if (!productId) {
      return NextResponse.json(
        { error: "A valid product id is required." },
        { status: 400 },
      );
    }

    await prisma.priceDropAlert.updateMany({
      where: {
        userId,
        productId,
        ...(searchParams.has("variantId") ? { variantId } : { variantId: null }),
      },
      data: { active: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to remove price drop alert:", error);
    return NextResponse.json(
      { error: "Failed to remove price drop alert." },
      { status: 500 },
    );
  }
}
