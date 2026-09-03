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
  type AllowedOrderStatusTransitions,
  OrderStatusTransitionError,
  transitionOrderStatusWithInventory,
} from "@/lib/order-inventory-lifecycle";
import {
  orderProductSelect,
  orderUserSelect,
  orderVariantSelect,
  redactCustomerOrder,
} from "@/lib/order-public";

const ORDER_STATUS_TRANSITIONS: AllowedOrderStatusTransitions = {
  [OrderStatus.PENDING]: [
    OrderStatus.CONFIRMED,
    OrderStatus.PROCESSING,
    OrderStatus.SHIPPED,
    OrderStatus.FAILED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.CONFIRMED]: [
    OrderStatus.PROCESSING,
    OrderStatus.SHIPPED,
    OrderStatus.FAILED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.PROCESSING]: [
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
    OrderStatus.FAILED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.FAILED],
  [OrderStatus.DELIVERED]: [OrderStatus.RETURNED],
  [OrderStatus.FAILED]: [],
  [OrderStatus.RETURNED]: [],
  [OrderStatus.CANCELLED]: [],
};

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
    let requestedStatus: OrderStatus | undefined;

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

      if (
        status !== existingOrder.status &&
        !(ORDER_STATUS_TRANSITIONS[existingOrder.status] || []).includes(status)
      ) {
        return NextResponse.json(
          {
            error: `Invalid status transition: ${existingOrder.status} -> ${status}`,
          },
          { status: 400 }
        );
      }
      requestedStatus = status as OrderStatus;
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

    if (!requestedStatus && Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      let previousStatus = existingOrder.status;
      let statusChanged = false;
      let updatedOrder;

      if (requestedStatus) {
        const transition = await transitionOrderStatusWithInventory({
          tx,
          orderId,
          nextStatus: requestedStatus,
          reason: `Order #${orderId} ${requestedStatus.toLowerCase()} inventory restoration`,
          allowedTransitions: ORDER_STATUS_TRANSITIONS,
        });
        previousStatus = transition.previousStatus;
        statusChanged = transition.changed;
        updatedOrder = transition.order;
      } else {
        updatedOrder = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      }

      if (Object.keys(data).length > 0) {
        updatedOrder = await tx.order.update({
          where: { id: orderId },
          data,
        });
      }

      if (requestedStatus && statusChanged) {
        await syncCommissionEntriesForOrderStatus({
          tx,
          orderId,
          orderStatus: requestedStatus,
          actorUserId,
          request,
        });
      }
      return { order: updatedOrder, previousStatus, statusChanged };
    });
    const updated = result.order;

    revalidateStorefrontCatalog();

    await logActivity({
      action: "update_order",
      entity: "order",
      entityId: updated.id,
      access,
      request,
      metadata: {
        message:
          requestedStatus && result.statusChanged
            ? `Order #${updated.id} status changed from ${result.previousStatus} to ${requestedStatus}`
            : paymentStatus && paymentStatus !== existingOrder.paymentStatus
              ? `Order #${updated.id} payment status changed from ${existingOrder.paymentStatus} to ${paymentStatus}`
              : `Order #${updated.id} updated`,
      },
      before: {
        status: result.previousStatus,
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
    if (error instanceof OrderStatusTransitionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error updating order:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
