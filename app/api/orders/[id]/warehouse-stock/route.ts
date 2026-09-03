import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getOrderWarehouseStockAvailability } from "@/lib/order-warehouse-stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (
      !access.hasAny([
        "orders.read_all",
        "orders.update",
        "shipments.manage",
        "logistics.manage",
      ])
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const orderId = Number(id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const availability = await getOrderWarehouseStockAvailability(
      prisma,
      orderId,
    );
    return NextResponse.json(availability);
  } catch (error) {
    console.error("ORDER_WAREHOUSE_STOCK_ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load warehouse stock availability" },
      { status: 500 },
    );
  }
}
