export type WarehouseStockLevelInput = {
  quantity: number;
  reserved: number;
};

export function computeAvailableStock(levels: WarehouseStockLevelInput[]) {
  return Math.max(
    0,
    levels.reduce(
      (sum, level) =>
        sum + Math.max(0, Number(level.quantity) - Number(level.reserved)),
      0,
    ),
  );
}

export function computeVariantAvailableStock(variant: {
  stock: unknown;
  stockLevels?: WarehouseStockLevelInput[] | null;
}) {
  const levels = Array.isArray(variant.stockLevels) ? variant.stockLevels : [];
  if (levels.length > 0) return computeAvailableStock(levels);

  const legacyStock = Number(variant.stock);
  return Number.isFinite(legacyStock) ? Math.max(0, legacyStock) : 0;
}
