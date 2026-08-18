/**
 * Public product projection.
 *
 * Keep this as an explicit allowlist: adding an internal Product or
 * ProductVariant column must never make it public by accident.
 */
export const storefrontProductSelect = {
  id: true,
  name: true,
  slug: true,
  type: true,
  sku: true,
  categoryId: true,
  brandId: true,
  writerId: true,
  publisherId: true,
  description: true,
  shortDesc: true,
  basePrice: true,
  originalPrice: true,
  flashSaleEnabled: true,
  flashSalePrice: true,
  flashSaleStartsAt: true,
  flashSaleEndsAt: true,
  flashSaleSortOrder: true,
  currency: true,
  weight: true,
  dimensions: true,
  serviceDurationMinutes: true,
  serviceLocation: true,
  available: true,
  featured: true,
  image: true,
  gallery: true,
  videoUrl: true,
  soldCount: true,
  ratingAvg: true,
  ratingCount: true,
  createdAt: true,
  updatedAt: true,
  bundleStockLimit: true,
  category: {
    select: { id: true, name: true, slug: true, image: true, parentId: true },
  },
  brand: {
    select: { id: true, name: true, slug: true, logo: true },
  },
  writer: {
    select: { id: true, name: true, image: true },
  },
  publisher: {
    select: { id: true, name: true, image: true },
  },
  variantOptions: {
    orderBy: { position: "asc" as const },
    select: {
      id: true,
      name: true,
      position: true,
      values: {
        orderBy: { position: "asc" as const },
        select: { id: true, optionId: true, value: true, position: true },
      },
    },
  },
  variants: {
    orderBy: { id: "asc" as const },
    select: {
      id: true,
      productId: true,
      sku: true,
      price: true,
      currency: true,
      stock: true,
      options: true,
      colorImage: true,
      isDefault: true,
      active: true,
    },
  },
  attributes: {
    select: {
      id: true,
      value: true,
      attribute: { select: { id: true, name: true } },
    },
  },
  bundleItems: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      id: true,
      productId: true,
      quantity: true,
      sortOrder: true,
      product: {
        select: { id: true, name: true, image: true, available: true },
      },
    },
  },
} as const;
