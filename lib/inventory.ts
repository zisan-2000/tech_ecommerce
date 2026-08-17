import type { Prisma } from "@/generated/prisma";
import { captureVariantInventoryDailySnapshots } from "@/lib/report-history";

type TransactionClient = Prisma.TransactionClient;
type InventoryClient = Pick<
  Prisma.TransactionClient,
  | "warehouse"
  | "stockLevel"
  | "productVariant"
  | "inventoryLog"
  | "inventoryDailySnapshot"
  | "inventoryWarehouseDailySnapshot"
>;

export function computeAvailableStock(
  levels: Array<{ quantity: number; reserved: number }>,
) {
  return Math.max(
    0,
    levels.reduce(
      (sum, level) => sum + Math.max(0, Number(level.quantity) - Number(level.reserved)),
      0,
    ),
  );
}

export async function getPrimaryWarehouseId(tx: InventoryClient) {
  const warehouse = await tx.warehouse.findFirst({
    orderBy: [{ isDefault: "desc" }, { id: "asc" }],
    select: { id: true },
  });

  return warehouse?.id ?? null;
}

export async function refreshVariantStock(
  tx: InventoryClient,
  productVariantId: number,
) {
  const levels = await tx.stockLevel.findMany({
    where: { productVariantId },
    select: { quantity: true, reserved: true },
  });

  const stock = computeAvailableStock(levels);
  await tx.productVariant.update({
    where: { id: productVariantId },
    data: { stock },
  });

  return stock;
}

export async function syncVariantWarehouseStock(params: {
  tx: TransactionClient;
  productId: number;
  productVariantId: number;
  quantity: number;
  reason: string;
  warehouseId?: number | null;
}) {
  const { tx, productId, productVariantId, quantity, reason } = params;

  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error("Stock quantity must be 0 or more");
  }

  const warehouseId =
    params.warehouseId ?? (await getPrimaryWarehouseId(tx));

  if (!warehouseId) {
    if (quantity === 0) {
      await tx.productVariant.update({
        where: { id: productVariantId },
        data: { stock: 0 },
      });
      return { warehouseId: null, stock: 0 };
    }

    throw new Error(
      "A warehouse is required before adding stock to a physical product",
    );
  }

  const existing = await tx.stockLevel.findUnique({
    where: {
      warehouseId_productVariantId: {
        warehouseId,
        productVariantId,
      },
    },
    select: { quantity: true },
  });

  await tx.stockLevel.upsert({
    where: {
      warehouseId_productVariantId: {
        warehouseId,
        productVariantId,
      },
    },
    create: {
      warehouseId,
      productVariantId,
      quantity,
      reserved: 0,
    },
    update: {
      quantity,
    },
  });

  const stock = await refreshVariantStock(tx, productVariantId);
  const change = quantity - Number(existing?.quantity ?? 0);

  if (change !== 0) {
    await tx.inventoryLog.create({
      data: {
        productId,
        variantId: productVariantId,
        warehouseId,
        change,
        reason,
      },
    });
  }

  await captureVariantInventoryDailySnapshots(tx, productVariantId);

  return { warehouseId, stock };
}

export async function deductVariantInventory(params: {
  tx: TransactionClient;
  productId: number;
  productVariantId: number;
  quantity: number;
  reason: string;
}) {
  const { tx, productId, productVariantId, quantity, reason } = params;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Deduction quantity must be greater than 0");
  }

  const levels = await tx.stockLevel.findMany({
    where: { productVariantId },
    include: {
      warehouse: {
        select: { id: true, code: true, isDefault: true },
      },
    },
    orderBy: [{ warehouse: { isDefault: "desc" } }, { warehouseId: "asc" }],
  });

  const totalAvailable = computeAvailableStock(levels);
  if (totalAvailable < quantity) {
    throw new Error("Insufficient stock for the selected variant");
  }

  let remaining = quantity;

  for (const level of levels) {
    if (remaining <= 0) break;

    const available = Math.max(0, Number(level.quantity) - Number(level.reserved));
    if (available <= 0) continue;

    const take = Math.min(available, remaining);
    const updated = await tx.stockLevel.updateMany({
      where: {
        id: level.id,
        quantity: {
          gte: Number(level.reserved) + take,
        },
      },
      data: {
        quantity: {
          decrement: take,
        },
      },
    });

    if (updated.count !== 1) {
      throw new Error("Stock changed during checkout. Please try again.");
    }

    await tx.inventoryLog.create({
      data: {
        productId,
        variantId: productVariantId,
        warehouseId: level.warehouseId,
        change: -take,
        reason: `${reason} (${level.warehouse.code})`,
      },
    });

    remaining -= take;
  }

  if (remaining > 0) {
    throw new Error("Unable to allocate inventory across warehouses");
  }

  const stock = await refreshVariantStock(tx, productVariantId);
  await captureVariantInventoryDailySnapshots(tx, productVariantId);
  return { stock };
}

export async function reserveVariantInventory(params: {
  tx: TransactionClient;
  productId: number;
  productVariantId: number;
  orderId: number;
  userId?: string | null;
  quantity: number;
  reason: string;
  expiresAt?: Date | null;
}) {
  const {
    tx,
    productVariantId,
    orderId,
    userId,
    quantity,
    reason,
    expiresAt,
  } = params;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Reservation quantity must be greater than 0");
  }

  const levels = await tx.stockLevel.findMany({
    where: { productVariantId },
    include: {
      warehouse: { select: { id: true, code: true, isDefault: true } },
    },
    orderBy: [{ warehouse: { isDefault: "desc" } }, { warehouseId: "asc" }],
  });

  if (computeAvailableStock(levels) < quantity) {
    throw new Error("Insufficient stock for the selected variant");
  }

  let remaining = quantity;
  for (const level of levels) {
    if (remaining <= 0) break;
    const available = Math.max(0, Number(level.quantity) - Number(level.reserved));
    if (available <= 0) continue;

    const take = Math.min(available, remaining);
    const updated = await tx.stockLevel.updateMany({
      where: {
        id: level.id,
        reserved: level.reserved,
        quantity: { gte: Number(level.reserved) + take },
      },
      data: { reserved: { increment: take } },
    });
    if (updated.count !== 1) {
      throw new Error("Stock changed during checkout. Please try again.");
    }

    await tx.inventoryReservation.create({
      data: {
        stockLevelId: level.id,
        orderId,
        userId: userId ?? null,
        quantity: take,
        reason: `${reason} (${level.warehouse.code})`,
        expiresAt: expiresAt ?? null,
      },
    });
    remaining -= take;
  }

  if (remaining > 0) {
    throw new Error("Unable to reserve inventory across warehouses");
  }

  const stock = await refreshVariantStock(tx, productVariantId);
  await captureVariantInventoryDailySnapshots(tx, productVariantId);
  return { stock };
}

export async function commitOrderInventoryReservations(params: {
  tx: TransactionClient;
  orderId: number;
  reason: string;
}) {
  const { tx, orderId, reason } = params;
  const reservations = await tx.inventoryReservation.findMany({
    where: { orderId },
    include: {
      stockLevel: {
        select: {
          id: true,
          warehouseId: true,
          productVariantId: true,
          variant: { select: { productId: true } },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  const touchedVariants = new Set<number>();
  let committedQuantity = 0;
  for (const reservation of reservations) {
    const updated = await tx.stockLevel.updateMany({
      where: {
        id: reservation.stockLevelId,
        reserved: { gte: reservation.quantity },
        quantity: { gte: reservation.quantity },
      },
      data: {
        reserved: { decrement: reservation.quantity },
        quantity: { decrement: reservation.quantity },
      },
    });
    if (updated.count !== 1) {
      throw new Error("Reserved inventory could not be committed");
    }

    await tx.inventoryLog.create({
      data: {
        productId: reservation.stockLevel.variant.productId,
        variantId: reservation.stockLevel.productVariantId,
        warehouseId: reservation.stockLevel.warehouseId,
        change: -reservation.quantity,
        reason,
      },
    });
    await tx.inventoryReservation.delete({ where: { id: reservation.id } });
    touchedVariants.add(reservation.stockLevel.productVariantId);
    committedQuantity += reservation.quantity;
  }

  for (const variantId of touchedVariants) {
    await refreshVariantStock(tx, variantId);
    await captureVariantInventoryDailySnapshots(tx, variantId);
  }
  return { reservationCount: reservations.length, committedQuantity };
}

export async function releaseOrderInventoryReservations(params: {
  tx: TransactionClient;
  orderId: number;
}) {
  const { tx, orderId } = params;
  const reservations = await tx.inventoryReservation.findMany({
    where: { orderId },
    select: {
      id: true,
      stockLevelId: true,
      quantity: true,
      stockLevel: { select: { productVariantId: true } },
    },
    orderBy: { id: "asc" },
  });

  const touchedVariants = new Set<number>();
  let releasedQuantity = 0;
  for (const reservation of reservations) {
    const updated = await tx.stockLevel.updateMany({
      where: {
        id: reservation.stockLevelId,
        reserved: { gte: reservation.quantity },
      },
      data: { reserved: { decrement: reservation.quantity } },
    });
    if (updated.count !== 1) {
      throw new Error("Reserved inventory could not be released");
    }
    await tx.inventoryReservation.delete({ where: { id: reservation.id } });
    touchedVariants.add(reservation.stockLevel.productVariantId);
    releasedQuantity += reservation.quantity;
  }

  for (const variantId of touchedVariants) {
    await refreshVariantStock(tx, variantId);
    await captureVariantInventoryDailySnapshots(tx, variantId);
  }
  return { reservationCount: reservations.length, releasedQuantity };
}

export async function cleanupExpiredInventoryReservations(params: {
  tx: TransactionClient;
  now?: Date;
  batchSize?: number;
}) {
  const { tx } = params;
  const now = params.now ?? new Date();
  const batchSize = Math.min(250, Math.max(1, params.batchSize ?? 100));
  const expired = await tx.inventoryReservation.findMany({
    where: {
      orderId: { not: null },
      expiresAt: { not: null, lte: now },
    },
    select: { orderId: true },
    distinct: ["orderId"],
    take: batchSize,
    orderBy: { id: "asc" },
  });

  let releasedOrders = 0;
  let releasedQuantity = 0;
  for (const row of expired) {
    if (!row.orderId) continue;
    const order = await tx.order.findUnique({
      where: { id: row.orderId },
      select: {
        paymentStatus: true,
        couponId: true,
        discount_total: true,
        payments: { select: { status: true } },
      },
    });
    if (
      !order ||
      order.paymentStatus === "PAID" ||
      order.payments.some((payment) => payment.status === "CAPTURED")
    ) {
      continue;
    }

    const released = await releaseOrderInventoryReservations({
      tx,
      orderId: row.orderId,
    });
    if (released.reservationCount === 0) continue;

    await tx.payment.updateMany({
      where: {
        orderId: row.orderId,
        status: { in: ["INITIATED", "AUTHORIZED"] },
      },
      data: { status: "FAILED" },
    });
    await tx.order.updateMany({
      where: { id: row.orderId, paymentStatus: "UNPAID" },
      data: { status: "FAILED" },
    });
    if (order.couponId && Number(order.discount_total || 0) > 0) {
      await tx.coupon.updateMany({
        where: { id: order.couponId, usedCount: { gt: 0 } },
        data: { usedCount: { decrement: 1 } },
      });
    }
    releasedOrders += 1;
    releasedQuantity += released.releasedQuantity;
  }

  return { scannedOrders: expired.length, releasedOrders, releasedQuantity };
}

export async function receiveVariantInventory(params: {
  tx: TransactionClient;
  productId: number;
  productVariantId: number;
  warehouseId: number;
  quantity: number;
  reason: string;
}) {
  const { tx, productId, productVariantId, warehouseId, quantity, reason } = params;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Receipt quantity must be greater than 0");
  }

  await tx.stockLevel.upsert({
    where: {
      warehouseId_productVariantId: {
        warehouseId,
        productVariantId,
      },
    },
    create: {
      warehouseId,
      productVariantId,
      quantity,
      reserved: 0,
    },
    update: {
      quantity: {
        increment: quantity,
      },
    },
  });

  await tx.inventoryLog.create({
    data: {
      productId,
      variantId: productVariantId,
      warehouseId,
      change: quantity,
      reason,
    },
  });

  const stock = await refreshVariantStock(tx, productVariantId);
  await captureVariantInventoryDailySnapshots(tx, productVariantId);
  return { stock };
}

export async function dispatchVariantInventory(params: {
  tx: TransactionClient;
  productId: number;
  productVariantId: number;
  warehouseId: number;
  quantity: number;
  reason: string;
}) {
  const {
    tx,
    productId,
    productVariantId,
    warehouseId,
    quantity,
    reason,
  } = params;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Dispatch quantity must be greater than 0");
  }

  const sourceLevel = await tx.stockLevel.findUnique({
    where: {
      warehouseId_productVariantId: {
        warehouseId,
        productVariantId,
      },
    },
    select: {
      quantity: true,
      reserved: true,
    },
  });

  const sourceAvailable = Math.max(
    0,
    Number(sourceLevel?.quantity ?? 0) - Number(sourceLevel?.reserved ?? 0),
  );
  if (sourceAvailable < quantity) {
    throw new Error("Insufficient source warehouse stock for transfer");
  }

  const updated = await tx.stockLevel.updateMany({
    where: {
      warehouseId,
      productVariantId,
      quantity: {
        gte: Number(sourceLevel?.reserved ?? 0) + quantity,
      },
    },
    data: {
      quantity: {
        decrement: quantity,
      },
    },
  });

  if (updated.count !== 1) {
    throw new Error("Warehouse stock changed during dispatch. Please try again.");
  }

  await tx.inventoryLog.create({
    data: {
      productId,
      variantId: productVariantId,
      warehouseId,
      change: -quantity,
      reason,
    },
  });

  const stock = await refreshVariantStock(tx, productVariantId);
  await captureVariantInventoryDailySnapshots(tx, productVariantId);
  return { stock };
}
