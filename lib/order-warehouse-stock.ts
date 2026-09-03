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
