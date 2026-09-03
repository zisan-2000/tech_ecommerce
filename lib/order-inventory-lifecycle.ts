import { OrderStatus, Prisma } from "@/generated/prisma";
import { restoreOrderInventory } from "@/lib/inventory";

type TransactionClient = Prisma.TransactionClient;

export type AllowedOrderStatusTransitions = Partial<
  Record<OrderStatus, readonly OrderStatus[]>
>;

const INVENTORY_RELEASE_STATUSES = new Set<OrderStatus>([
  OrderStatus.CANCELLED,
  OrderStatus.FAILED,
  OrderStatus.RETURNED,
]);

const EMPTY_INVENTORY_RESULT = {
  releasedReservationCount: 0,
  releasedReservationQuantity: 0,
  restoredAllocationCount: 0,
  restoredQuantity: 0,
};

export class OrderStatusTransitionError extends Error {
  constructor(
    readonly previousStatus: OrderStatus,
    readonly nextStatus: OrderStatus,
  ) {
    super(`Invalid status transition: ${previousStatus} -> ${nextStatus}`);
    this.name = "OrderStatusTransitionError";
  }
}

async function adjustOrderSoldCount(
  tx: TransactionClient,
  orderId: number,
  direction: 1 | -1,
) {
  const quantities = await tx.orderItem.groupBy({
    by: ["productId"],
    where: { orderId },
    _sum: { quantity: true },
    orderBy: { productId: "asc" },
  });

  for (const row of quantities) {
    const quantity = Math.max(0, Number(row._sum.quantity ?? 0));
    if (quantity === 0) continue;

    await tx.$executeRaw(
      Prisma.sql`
        UPDATE "Product"
        SET
          "soldCount" = GREATEST("soldCount" + ${direction * quantity}, 0),
          "updatedAt" = NOW()
        WHERE "id" = ${row.productId}
      `,
    );
  }
}

/**
 * Applies an order status and all inventory/sales side effects atomically.
 * Locking the order row serializes competing admin, shipment and payment
 * callbacks. Inventory restoration itself uses net movements, so safe retries
 * repair an older affected order without ever adding the same stock twice.
 */
export async function transitionOrderStatusWithInventory(params: {
  tx: TransactionClient;
  orderId: number;
  nextStatus: OrderStatus;
  reason: string;
  allowedTransitions?: AllowedOrderStatusTransitions;
  restoreInventory?: boolean;
}) {
  const { tx, orderId, nextStatus, reason, allowedTransitions } = params;

  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`,
  );

  const before = await tx.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  if (!before) {
    throw new Error(`Order #${orderId} was not found during status transition`);
  }

  const changed = before.status !== nextStatus;
  if (
    changed &&
    allowedTransitions &&
    !(allowedTransitions[before.status] ?? []).includes(nextStatus)
  ) {
    throw new OrderStatusTransitionError(before.status, nextStatus);
  }

  const shouldRestoreInventory =
    params.restoreInventory ?? INVENTORY_RELEASE_STATUSES.has(nextStatus);
  const inventory = shouldRestoreInventory
    ? await restoreOrderInventory({ tx, orderId, reason })
    : EMPTY_INVENTORY_RESULT;

  if (changed && nextStatus === OrderStatus.DELIVERED) {
    await adjustOrderSoldCount(tx, orderId, 1);
  } else if (
    changed &&
    nextStatus === OrderStatus.RETURNED &&
    before.status === OrderStatus.DELIVERED
  ) {
    await adjustOrderSoldCount(tx, orderId, -1);
  }

  const order = changed
    ? await tx.order.update({
        where: { id: orderId },
        data: { status: nextStatus },
      })
    : await tx.order.findUniqueOrThrow({ where: { id: orderId } });

  return {
    order,
    previousStatus: before.status,
    changed,
    inventory,
  };
}
