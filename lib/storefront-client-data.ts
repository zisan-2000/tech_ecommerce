export type StorefrontClientCategory = {
  id: number | string;
  name: string;
  slug: string;
};

export type StorefrontClientReview = {
  id?: number | string;
  productId: number | string;
  rating: number | string;
  comment?: string | null;
  createdAt?: string;
};

export type StorefrontClientProduct = {
  id: number | string;
  name: string;
  slug: string;
  image: string | null;
  shortDesc: string | null;
  specifications: Array<{ label: string; value: string }>;
  categoryId: string;
  basePrice: number;
  originalPrice: number | null;
  currency: string;
  featured: boolean;
  createdAt: string;
  ratingAvg: number;
  ratingCount: number;
  totalSold: number | null;
  rank: number | null;
  variants: any[];
  type?: string;
  bundleStockLimit: number | string | null;
  bundleItems?: Array<{
    product: { id: number; name: string; image?: string };
    quantity: number;
  }>;
  bundleItemCount?: number;
  bundleSavings?: string;
  stock: number;
};

function toNumber(value: unknown, fallback = 0) {
  const number =
    typeof value === "string"
      ? Number(value.replace(/,/g, ""))
      : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeStorefrontCategories(data: unknown) {
  const list: any[] = Array.isArray(data) ? data : ((data as any)?.data ?? []);
  return list.map<StorefrontClientCategory>((category) => ({
    id: category.id,
    name: String(category.name ?? ""),
    slug: String(category.slug ?? ""),
  }));
}

export function normalizeStorefrontReviews(data: unknown) {
  const list: any[] = Array.isArray(data)
    ? data
    : Array.isArray((data as any)?.reviews)
      ? (data as any).reviews
      : ((data as any)?.data ?? []);
  return list.map<StorefrontClientReview>((review) => ({
    id: review.id,
    productId: review.productId,
    rating: review.rating,
    comment: review.comment ?? null,
    createdAt: review.createdAt,
  }));
}

export function normalizeStorefrontProducts(
  data: unknown,
  options: { requireSold?: boolean } = {},
) {
  const list: any[] = Array.isArray(data) ? data : ((data as any)?.data ?? []);
  return list
    .filter(
      (product) =>
        product?.available !== false &&
        product?.deleted !== true &&
        (!options.requireSold ||
          toNumber(product?.totalSold ?? product?.soldCount, 0) > 0),
    )
    .map<StorefrontClientProduct>((product) => {
      const variants = Array.isArray(product?.variants) ? product.variants : [];
      const type = product?.type ? String(product.type) : undefined;
      const bundleStockLimit =
        product?.bundleStockLimit !== null &&
        product?.bundleStockLimit !== undefined
          ? product.bundleStockLimit
          : null;
      const stock =
        type === "BUNDLE"
          ? toNumber(bundleStockLimit, 0)
          : variants.reduce(
              (sum: number, variant: any) => sum + toNumber(variant?.stock, 0),
              0,
            );

      return {
        id: product.id,
        name: String(product.name ?? ""),
        slug: String(product.slug ?? ""),
        image: product.image ?? null,
        shortDesc:
          typeof product.shortDesc === "string" ? product.shortDesc : null,
        specifications: Array.isArray(product.specifications)
          ? product.specifications
              .map((item: any) => ({
                label: String(item?.label ?? "").trim(),
                value: String(item?.value ?? "").trim(),
              }))
              .filter((item: { label: string; value: string }) =>
                Boolean(item.label && item.value),
              )
              .slice(0, 4)
          : Array.isArray(product.attributes)
            ? product.attributes
                .map((item: any) => ({
                  label: String(item?.attribute?.name ?? "").trim(),
                  value: String(item?.value ?? "").trim(),
                }))
                .filter((item: { label: string; value: string }) =>
                  Boolean(item.label && item.value),
                )
                .slice(0, 4)
            : [],
        categoryId: String(product?.categoryId ?? ""),
        basePrice: toNumber(product?.basePrice, 0),
        originalPrice:
          product?.originalPrice !== null && product?.originalPrice !== undefined
            ? toNumber(product.originalPrice, 0)
            : null,
        currency: String(product.currency ?? "BDT"),
        featured: Boolean(product.featured),
        createdAt: product.createdAt ? String(product.createdAt) : "",
        ratingAvg: toNumber(product.ratingAvg, 0),
        ratingCount: toNumber(product.ratingCount, 0),
        totalSold:
          product.totalSold ?? product.soldCount ?? null,
        rank: product.rank ?? null,
        variants,
        type,
        bundleStockLimit,
        bundleItems: product.bundleItems,
        bundleItemCount:
          product.bundleItemCount ?? product.bundleItems?.length,
        bundleSavings: product.bundleSavings,
        stock,
      };
    });
}
