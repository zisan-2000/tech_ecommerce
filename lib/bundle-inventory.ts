import type { Prisma } from "@/generated/prisma";
import { syncVariantWarehouseStock } from "@/lib/inventory";
import { ensureVariantCodes } from "@/lib/product-codes";

type BundleInventoryItemInput = {
  product?: { id?: number | string | null } | null;
  quantity?: number | string | null;
};

type BundleInventoryClient = Pick<
  Prisma.TransactionClient,
  "productVariant" | "stockLevel" | "warehouse" | "inventoryLog" | "inventoryDailySnapshot" | "inventoryWarehouseDailySnapshot" | "productCode"
>;

export function normalizeBundleSku(
  input: unknown,
  slug: string,
  fallback?: string | null,
) {
  if (typeof input === "string" && input.trim()) {
    return input.trim().slice(0, 64);
  }
  if (fallback?.trim()) {
    return fallback.trim().slice(0, 64);
  }
  return `${slug.substring(0, 20)}-BUNDLE`.toUpperCase().slice(0, 64);
}

export function normalizeBundleStockQuantity(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 0) return undefined;
  return quantity;
}

export async function calculateBundleBuildCapacity(params: {
  tx: BundleInventoryClient;
  items: BundleInventoryItemInput[];
  warehouseId: number;
}) {
  const requiredByProduct = new Map<number, number>();

  for (const item of params.items) {
    const productId = Number(item.product?.id);
    const quantity = Number(item.quantity ?? 1);
    if (!Number.isInteger(productId) || productId <= 0) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    requiredByProduct.set(
      productId,
      (requiredByProduct.get(productId) ?? 0) + quantity,
    );
  }

  if (requiredByProduct.size === 0) return 0;

  const variants = await params.tx.productVariant.findMany({
    where: {
      productId: { in: Array.from(requiredByProduct.keys()) },
      active: true,
    },
    include: {
      stockLevels: {
        where: { warehouseId: params.warehouseId },
        select: { quantity: true, reserved: true },
      },
    },
    orderBy: [{ productId: "asc" }, { isDefault: "desc" }, { id: "asc" }],
  });

  const defaultVariantByProduct = new Map<number, (typeof variants)[number]>();
  for (const variant of variants) {
    if (!defaultVariantByProduct.has(variant.productId)) {
      defaultVariantByProduct.set(variant.productId, variant);
    }
  }

  let capacity = Number.POSITIVE_INFINITY;
  for (const [productId, requiredQuantity] of requiredByProduct.entries()) {
    const variant = defaultVariantByProduct.get(productId);
    if (!variant) return 0;

    const stockLevel = variant.stockLevels[0];
    const available = stockLevel
      ? Math.max(0, Number(stockLevel.quantity) - Number(stockLevel.reserved))
      : 0;
    capacity = Math.min(capacity, Math.floor(available / requiredQuantity));
  }

  return Number.isFinite(capacity) ? capacity : 0;
}

export async function syncBundleDefaultVariant(params: {
  tx: Prisma.TransactionClient;
  productId: number;
  sku: string;
  price: number;
  currency: string;
  stockQuantity: number;
  warehouseId: number;
  reason: string;
}) {
  const existingDefaultVariant = await params.tx.productVariant.findFirst({
    where: { productId: params.productId, active: true },
    orderBy: [{ isDefault: "desc" }, { id: "asc" }],
  });

  const variant = existingDefaultVariant
    ? await params.tx.productVariant.update({
        where: { id: existingDefaultVariant.id },
        data: {
          sku: params.sku,
          price: params.price,
          currency: params.currency,
          stock: 0,
          isDefault: true,
          active: true,
          options: {},
        },
      })
    : await params.tx.productVariant.create({
        data: {
          productId: params.productId,
          sku: params.sku,
          price: params.price,
          currency: params.currency,
          stock: 0,
          lowStockThreshold: 10,
          isDefault: true,
          active: true,
          options: {},
        },
      });

  await params.tx.productVariant.updateMany({
    where: {
      productId: params.productId,
      NOT: { id: variant.id },
    },
    data: { isDefault: false },
  });

  await syncVariantWarehouseStock({
    tx: params.tx,
    productId: params.productId,
    productVariantId: variant.id,
    warehouseId: params.warehouseId,
    quantity: params.stockQuantity,
    reason: params.reason,
  });

  await ensureVariantCodes(params.tx, {
    productId: params.productId,
    variantId: variant.id,
  });

  return variant;
}
