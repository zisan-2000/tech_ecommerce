// app/api/orders/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { canAccessWarehouseWithPermission } from "@/lib/warehouse-scope";
import { logActivity } from "@/lib/activity-log";
import { revalidateStorefrontCatalog } from "@/lib/storefront-catalog-cache";
import { OrderStatus } from "@/generated/prisma";
import { syncCommissionEntriesForOrderStatus } from "@/lib/business-network/commission";
import {
  orderProductSelect,
  orderUserSelect,
  orderVariantSelect,
  redactCustomerOrder,
} from "@/lib/order-public";

// GET /api/orders/:id
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id as string;
    const access = await getAccessContext(
      session.user as { id?: string; role?: string } | undefined,
    );
    const canReadAll = access.has("orders.read_all");
    const canReadOwn = canReadAll || access.has("orders.read_own");
    if (!canReadOwn) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const orderId = Number(resolvedParams.id);
    if (Number.isNaN(orderId)) {
      return NextResponse.json(
        { error: "Invalid order id" },
        { status: 400 }
      );
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: {
          include: {
            product: { select: orderProductSelect },
            variant: { select: orderVariantSelect },
          },
        },
        refunds: {
          orderBy: {
            createdAt: "desc",
          },
          include: {
            orderItem: {
              select: {
                id: true,
                productId: true,
                quantity: true,
              },
            },
          },
        },
        user: { select: orderUserSelect },
        coupon: {
          select: {
            id: true,
            code: true,
            discountType: true,
            discountValue: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (!canReadAll && order.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (canReadAll && !access.hasGlobal("orders.read_all")) {
      const linkedWarehouseIds = await prisma.shipment.findMany({
        where: { orderId },
        select: { warehouseId: true },
      });
      const hasAllowedWarehouse = linkedWarehouseIds.some((shipment) =>
        canAccessWarehouseWithPermission(access, "orders.read_all", shipment.warehouseId),
      );
      if (!hasAllowedWarehouse) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    return NextResponse.json(canReadAll ? order : redactCustomerOrder(order));
  } catch (error) {
    console.error("Error fetching order:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/orders/:id
// Admin only: can update status, paymentStatus, transactionId
// Body: { status?: OrderStatus, paymentStatus?: PaymentStatus, transactionId?: string }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const actorUserId = access.userId;
    if (!access.has("orders.update")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const orderId = Number(resolvedParams.id);
    if (Number.isNaN(orderId)) {
      return NextResponse.json(
        { error: "Invalid order id" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { status, paymentStatus, transactionId } = body;

    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        transactionId: true,
        name: true,
        email: true,
      },
    });

    if (!existingOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (!access.hasGlobal("orders.update")) {
      const linkedWarehouseIds = await prisma.shipment.findMany({
        where: { orderId },
        select: { warehouseId: true },
      });
      const hasAllowedWarehouse = linkedWarehouseIds.some((shipment) =>
        canAccessWarehouseWithPermission(access, "orders.update", shipment.warehouseId),
      );
      if (!hasAllowedWarehouse) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const data: any = {};

    if (status) {
      const validOrderStatuses = [
        "PENDING",
        "CONFIRMED",
        "PROCESSING",
        "SHIPPED",
        "DELIVERED",
        "CANCELLED",
        "FAILED",
        "RETURNED",
      ] as const;

      if (!validOrderStatuses.includes(status)) {
        return NextResponse.json(
          { error: "Invalid order status" },
          { status: 400 }
        );
      }

      const allowedTransitions: Record<string, string[]> = {
        PENDING: ["CONFIRMED", "PROCESSING", "SHIPPED", "FAILED", "CANCELLED"],
        CONFIRMED: ["PROCESSING", "SHIPPED", "FAILED", "CANCELLED"],
        PROCESSING: ["SHIPPED", "DELIVERED", "FAILED", "CANCELLED"],
        SHIPPED: ["DELIVERED", "FAILED"],
        DELIVERED: ["RETURNED"],
        FAILED: [],
        RETURNED: [],
        CANCELLED: [],
      };

      if (
        status !== existingOrder.status &&
        !(allowedTransitions[existingOrder.status] || []).includes(status)
      ) {
        return NextResponse.json(
          {
            error: `Invalid status transition: ${existingOrder.status} -> ${status}`,
          },
          { status: 400 }
        );
      }
      data.status = status;
    }

    if (paymentStatus) {
      const validPaymentStatuses = ["UNPAID", "PAID", "REFUNDED"] as const;

      if (!validPaymentStatuses.includes(paymentStatus)) {
        return NextResponse.json(
          { error: "Invalid payment status" },
          { status: 400 }
        );
      }
      data.paymentStatus = paymentStatus;
    }

    if (transactionId !== undefined) {
      data.transactionId = transactionId;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const nextStatus = data.status as string | undefined;
      if (nextStatus === "DELIVERED" && existingOrder.status !== "DELIVERED") {
        const items = await tx.orderItem.findMany({
          where: { orderId },
          select: { productId: true, quantity: true },
        });

        const qtyByProduct = new Map<number, number>();
        for (const it of items) {
          qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) || 0) + it.quantity);
        }

        for (const [productId, qty] of qtyByProduct.entries()) {
          const product = await tx.product.findUnique({
            where: { id: productId },
            select: { soldCount: true },
          });

          await tx.product.update({
            where: { id: productId },
            data: {
              soldCount: Math.max((product?.soldCount ?? 0) + qty, 0),
            },
          });
        }
      } else if (nextStatus === "RETURNED" && existingOrder.status === "DELIVERED") {
        const items = await tx.orderItem.findMany({
          where: { orderId },
          select: { productId: true, quantity: true },
        });

        const qtyByProduct = new Map<number, number>();
        for (const it of items) {
          qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) || 0) + it.quantity);
        }

        for (const [productId, qty] of qtyByProduct.entries()) {
          const product = await tx.product.findUnique({
            where: { id: productId },
            select: { soldCount: true },
          });

          await tx.product.update({
            where: { id: productId },
            data: {
              soldCount: Math.max((product?.soldCount ?? 0) - qty, 0),
            },
          });
        }
      }

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data,
      });
      if (nextStatus && nextStatus !== existingOrder.status) {
        await syncCommissionEntriesForOrderStatus({
          tx,
          orderId,
          orderStatus: nextStatus as OrderStatus,
          actorUserId,
          request,
        });
      }
      return updatedOrder;
    });

    revalidateStorefrontCatalog();

    await logActivity({
      action: "update_order",
      entity: "order",
      entityId: updated.id,
      access,
      request,
      metadata: {
        message:
          status && status !== existingOrder.status
            ? `Order #${updated.id} status changed from ${existingOrder.status} to ${status}`
            : paymentStatus && paymentStatus !== existingOrder.paymentStatus
              ? `Order #${updated.id} payment status changed from ${existingOrder.paymentStatus} to ${paymentStatus}`
              : `Order #${updated.id} updated`,
      },
      before: {
        status: existingOrder.status,
        paymentStatus: existingOrder.paymentStatus,
        transactionId: existingOrder.transactionId,
      },
      after: {
        status: updated.status,
        paymentStatus: updated.paymentStatus,
        transactionId: updated.transactionId,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating order:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
