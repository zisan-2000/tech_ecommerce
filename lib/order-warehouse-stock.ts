import type { Prisma } from "@/generated/prisma";

type OrderWarehouseStockClient = Pick<
  Prisma.TransactionClient,
  | "orderItem"
  | "warehouse"
  | "stockLevel"
  | "inventoryReservation"
  | "inventoryLog"
>;

type WarehouseDemand = {
  requiredUnits: number;
  hasUntrackedUnits: boolean;
  byVariant: Map<number, number>;
};

type WarehouseStockInput = {
  warehouseId: number;
  variantId: number;
  quantity: number;
  reserved: number;
};

type OrderReservationInput = {
  warehouseId: number;
  variantId: number;
  quantity: number;
};

type OrderMovementInput = {
  warehouseId: number | null;
  variantId: number | null;
  change: number;
};

export type WarehouseStockAvailability = {
  warehouseId: number;
  requiredUnits: number;
  availableUnits: number;
  canFulfill: boolean;
};

export type OrderWarehouseStockAvailability = {
  requiresStock: boolean;
  requiredUnits: number;
  warehouses: WarehouseStockAvailability[];
};

function allocationKey(warehouseId: number, variantId: number) {
  return `${warehouseId}:${variantId}`;
}

export function buildOrderWarehouseStockAvailability(params: {
  warehouseIds: number[];
  demand: WarehouseDemand;
  stockLevels: WarehouseStockInput[];
  reservations: OrderReservationInput[];
  movements: OrderMovementInput[];
}): OrderWarehouseStockAvailability {
  const { warehouseIds, demand, stockLevels, reservations, movements } = params;

  if (demand.requiredUnits === 0) {
    return {
      requiresStock: false,
      requiredUnits: 0,
      warehouses: warehouseIds.map((warehouseId) => ({
        warehouseId,
        requiredUnits: 0,
        availableUnits: 0,
        canFulfill: true,
      })),
    };
  }

  const levelsByAllocation = new Map<string, WarehouseStockInput>();
  for (const level of stockLevels) {
    levelsByAllocation.set(
      allocationKey(level.warehouseId, level.variantId),
      level,
    );
  }

  const ownReservations = new Map<string, number>();
  for (const reservation of reservations) {
    const key = allocationKey(reservation.warehouseId, reservation.variantId);
    ownReservations.set(key, (ownReservations.get(key) ?? 0) + reservation.quantity);
  }

  const netMovements = new Map<string, number>();
  for (const movement of movements) {
    if (movement.warehouseId === null || movement.variantId === null) continue;
    const key = allocationKey(movement.warehouseId, movement.variantId);
    netMovements.set(key, (netMovements.get(key) ?? 0) + movement.change);
  }

  return {
    requiresStock: true,
    requiredUnits: demand.requiredUnits,
    warehouses: warehouseIds.map((warehouseId) => {
      let availableUnits = 0;
      let canFulfill = !demand.hasUntrackedUnits;

      for (const [variantId, requiredUnits] of demand.byVariant) {
        const key = allocationKey(warehouseId, variantId);
        const level = levelsByAllocation.get(key);
        const quantity = Math.max(0, Number(level?.quantity ?? 0));
        const reserved = Math.max(0, Number(level?.reserved ?? 0));
        const ownReserved = Math.min(
          reserved,
          Math.max(0, Number(ownReservations.get(key) ?? 0)),
        );

        // The order may already own inventory through either a live reservation
        // or a committed checkout deduction. Include only that order's allocation
        // so assigning a shipment does not demand the same stock a second time.
        const availableIncludingOwnReservation = Math.max(
          0,
          quantity - Math.max(0, reserved - ownReserved),
        );
        const committedAllocation = Math.max(
          0,
          -(netMovements.get(key) ?? 0),
        );
        const availableForOrder =
          availableIncludingOwnReservation + committedAllocation;

        availableUnits += availableForOrder;
        if (availableForOrder < requiredUnits) canFulfill = false;
      }

      return {
        warehouseId,
        requiredUnits: demand.requiredUnits,
        availableUnits,
        canFulfill,
      };
    }),
  };
}

export async function getOrderWarehouseStockAvailability(
  client: OrderWarehouseStockClient,
  orderId: number,
): Promise<OrderWarehouseStockAvailability> {
  const [items, warehouses] = await Promise.all([
    client.orderItem.findMany({
      where: {
        orderId,
        product: { type: "PHYSICAL" },
      },
      select: { variantId: true, quantity: true },
    }),
    client.warehouse.findMany({
      select: { id: true },
      orderBy: [{ isDefault: "desc" }, { id: "asc" }],
    }),
  ]);

  const demand: WarehouseDemand = {
    requiredUnits: 0,
    hasUntrackedUnits: false,
    byVariant: new Map(),
  };

  for (const item of items) {
    const quantity = Math.max(0, Number(item.quantity));
    demand.requiredUnits += quantity;
    if (item.variantId === null) {
      demand.hasUntrackedUnits ||= quantity > 0;
      continue;
    }
    demand.byVariant.set(
      item.variantId,
      (demand.byVariant.get(item.variantId) ?? 0) + quantity,
    );
  }

  const warehouseIds = warehouses.map((warehouse) => warehouse.id);
  const variantIds = [...demand.byVariant.keys()];
  if (variantIds.length === 0) {
    return buildOrderWarehouseStockAvailability({
      warehouseIds,
      demand,
      stockLevels: [],
      reservations: [],
      movements: [],
    });
  }

  const now = new Date();
  const [levels, reservations, movements] = await Promise.all([
    client.stockLevel.findMany({
      where: { productVariantId: { in: variantIds } },
      select: {
        warehouseId: true,
        productVariantId: true,
        quantity: true,
        reserved: true,
      },
    }),
    client.inventoryReservation.findMany({
      where: {
        orderId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        stockLevel: { productVariantId: { in: variantIds } },
      },
      select: {
        quantity: true,
        stockLevel: {
          select: { warehouseId: true, productVariantId: true },
        },
      },
    }),
    client.inventoryLog.findMany({
      where: {
        orderId,
        variantId: { in: variantIds },
        warehouseId: { not: null },
      },
      select: { warehouseId: true, variantId: true, change: true },
    }),
  ]);

  return buildOrderWarehouseStockAvailability({
    warehouseIds,
    demand,
    stockLevels: levels.map((level) => ({
      warehouseId: level.warehouseId,
      variantId: level.productVariantId,
      quantity: level.quantity,
      reserved: level.reserved,
    })),
    reservations: reservations.map((reservation) => ({
      warehouseId: reservation.stockLevel.warehouseId,
      variantId: reservation.stockLevel.productVariantId,
      quantity: reservation.quantity,
    })),
    movements,
  });
}

export async function canWarehouseFulfillOrder(
  client: OrderWarehouseStockClient,
  orderId: number,
  warehouseId: number,
) {
  const availability = await getOrderWarehouseStockAvailability(client, orderId);
  if (!availability.requiresStock) return true;

  return (
    availability.warehouses.find(
      (warehouse) => warehouse.warehouseId === warehouseId,
    )?.canFulfill ?? false
  );
}

type OrderStockItem = {
  id: number;
  quantity: number;
  productId: number;
  variantId: number | null;
  product: {
    name: string;
    type: string;
  };
  variant: {
    id: number;
    sku: string | null;
  } | null;
};

export type OrderWarehouseStockAvailability = {
  warehouseId: number;
  warehouseName: string;
  warehouseCode: string;
  isDefault: boolean;
  requiredUnits: number;
  availableUnits: number;
  canFulfill: boolean;
};

export async function getOrderWarehouseStockAvailability(
  db: any,
  orderId: number,
) {
  const orderItems = (await db.orderItem.findMany({
    where: { orderId },
    select: {
      id: true,
      quantity: true,
      productId: true,
      variantId: true,
      product: {
        select: {
          name: true,
          type: true,
        },
      },
      variant: {
        select: {
          id: true,
          sku: true,
        },
      },
    },
  })) as OrderStockItem[];

  const physicalItems = orderItems.filter(
    (item) => item.product.type === "PHYSICAL",
  );
  const untrackedItems = physicalItems.filter((item) => !item.variantId);
  const requiredByVariant = new Map<number, number>();

  for (const item of physicalItems) {
    if (!item.variantId) continue;
    requiredByVariant.set(
      item.variantId,
      (requiredByVariant.get(item.variantId) ?? 0) + Number(item.quantity || 0),
    );
  }

  const requiredVariantIds = Array.from(requiredByVariant.keys());
  const requiredUnits = Array.from(requiredByVariant.values()).reduce(
    (sum, quantity) => sum + quantity,
    0,
  );

  if (requiredVariantIds.length === 0) {
    return {
      requiresStock: untrackedItems.length > 0,
      requiredUnits,
      untrackedItems,
      warehouses: [] as OrderWarehouseStockAvailability[],
    };
  }

  const stockLevels = await db.stockLevel.findMany({
    where: {
      productVariantId: { in: requiredVariantIds },
    },
    select: {
      warehouseId: true,
      productVariantId: true,
      quantity: true,
      reserved: true,
      warehouse: {
        select: {
          id: true,
          name: true,
          code: true,
          isDefault: true,
        },
      },
    },
  });

  const byWarehouse = new Map<
    number,
    {
      warehouseId: number;
      warehouseName: string;
      warehouseCode: string;
      isDefault: boolean;
      availableByVariant: Map<number, number>;
    }
  >();

  for (const level of stockLevels) {
    const current = byWarehouse.get(level.warehouseId) ?? {
      warehouseId: level.warehouse.id,
      warehouseName: level.warehouse.name,
      warehouseCode: level.warehouse.code,
      isDefault: Boolean(level.warehouse.isDefault),
      availableByVariant: new Map<number, number>(),
    };
    current.availableByVariant.set(
      level.productVariantId,
      Math.max(0, Number(level.quantity || 0) - Number(level.reserved || 0)),
    );
    byWarehouse.set(level.warehouseId, current);
  }

  const warehouses = Array.from(byWarehouse.values()).map((warehouse) => {
    let availableUnits = 0;
    let canFulfill = untrackedItems.length === 0;

    for (const [variantId, requiredQuantity] of requiredByVariant.entries()) {
      const availableQuantity = warehouse.availableByVariant.get(variantId) ?? 0;
      availableUnits += availableQuantity;
      if (availableQuantity < requiredQuantity) {
        canFulfill = false;
      }
    }

    return {
      warehouseId: warehouse.warehouseId,
      warehouseName: warehouse.warehouseName,
      warehouseCode: warehouse.warehouseCode,
      isDefault: warehouse.isDefault,
      requiredUnits,
      availableUnits,
      canFulfill,
    };
  });

  return {
    requiresStock: physicalItems.length > 0,
    requiredUnits,
    untrackedItems,
    warehouses,
  };
}

export async function canWarehouseFulfillOrder(
  db: any,
  orderId: number,
  warehouseId: number,
) {
  const availability = await getOrderWarehouseStockAvailability(db, orderId);
  if (!availability.requiresStock) return true;
  return Boolean(
    availability.warehouses.find(
      (warehouse) =>
        warehouse.warehouseId === warehouseId && warehouse.canFulfill,
    ),
  );
}
