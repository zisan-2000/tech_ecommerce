export type ProductPurchaseVariant = {
  id: number;
  sku: string | null;
  price: number;
  stock: number;
  options: unknown;
  colorImage: string | null;
  isDefault: boolean;
  active: boolean;
};

export type ProductPurchaseData = {
  id: number;
  name: string;
  type: string;
  sku: string | null;
  image: string | null;
  gallery: string[];
  basePrice: number;
  originalPrice: number | null;
  currency: string;
  ratingAvg: number;
  ratingCount: number;
  bundleStockLimit: number | null;
  variants: ProductPurchaseVariant[];
};

export function parseStorefrontProductId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function getDefaultPurchaseVariant(variants: ProductPurchaseVariant[]) {
  return (
    variants.find((variant) => variant.isDefault && variant.active && variant.stock > 0) ??
    variants.find((variant) => variant.active && variant.stock > 0) ??
    variants.find((variant) => variant.isDefault && variant.active) ??
    variants.find((variant) => variant.active) ??
    null
  );
}

export function getProductAvailableStock(
  product: Pick<ProductPurchaseData, "type" | "bundleStockLimit" | "variants">,
) {
  if (product.type === "BUNDLE") return product.bundleStockLimit ?? 0;
  if (product.type === "DIGITAL" || product.type === "SERVICE") return 99;
  return product.variants
    .filter((variant) => variant.active)
    .reduce((total, variant) => total + Math.max(0, variant.stock), 0);
}

export function toProductPurchaseData(product: ProductPurchaseData): ProductPurchaseData {
  return {
    id: product.id,
    name: product.name,
    type: product.type,
    sku: product.sku,
    image: product.image,
    gallery: product.gallery,
    basePrice: product.basePrice,
    originalPrice: product.originalPrice,
    currency: product.currency,
    ratingAvg: product.ratingAvg,
    ratingCount: product.ratingCount,
    bundleStockLimit: product.bundleStockLimit,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      price: variant.price,
      stock: variant.stock,
      options: variant.options,
      colorImage: variant.colorImage,
      isDefault: variant.isDefault,
      active: variant.active,
    })),
  };
}
