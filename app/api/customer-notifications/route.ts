import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ensureWishlistPriceDropAlertsForUser,
  evaluatePriceDropAlertsForUser,
} from "@/lib/price-drop-alerts";

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
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 10));
    const backfilledWishlistAlerts =
      await ensureWishlistPriceDropAlertsForUser(userId);
    const evaluation = await evaluatePriceDropAlertsForUser(userId);

    const [rows, unreadCount] = await Promise.all([
      prisma.customerNotification.findMany({
        where: {
          userId,
          ...(unreadOnly ? { status: "UNREAD" as const } : {}),
        },
        include: {
          product: {
            select: { id: true, name: true, image: true, slug: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.customerNotification.count({
        where: { userId, status: "UNREAD" },
      }),
    ]);

    return NextResponse.json({
      unreadCount,
      priceDropEvaluation: {
        ...evaluation,
        backfilledWishlistAlerts,
      },
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        status: row.status,
        title: row.title,
        message: row.message,
        targetUrl: row.targetUrl,
        productId: row.productId,
        variantId: row.variantId,
        metadata: row.metadata,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        product: row.product,
      })),
    });
  } catch (error) {
    console.error("Failed to load customer notifications:", error);
    return NextResponse.json(
      { error: "Failed to load notifications." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    const markAll = body.markAll === true;
    const now = new Date();

    if (markAll) {
      await prisma.customerNotification.updateMany({
        where: { userId, status: "UNREAD" },
        data: { status: "READ", readAt: now },
      });
      return NextResponse.json({ success: true });
    }

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { error: "Notification id or markAll is required." },
        { status: 400 },
      );
    }

    await prisma.customerNotification.updateMany({
      where: { id, userId },
      data: { status: "READ", readAt: now },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update customer notification:", error);
    return NextResponse.json(
      { error: "Failed to update notification." },
      { status: 500 },
    );
  }
}
