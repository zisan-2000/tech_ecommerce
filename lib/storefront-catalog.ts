import { unstable_cache } from "next/cache";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

const CATALOG_PAGE_SIZES = [12, 24, 36] as const;
const PRODUCT_TYPES = ["PHYSICAL", "DIGITAL", "SERVICE", "BUNDLE"] as const;
const SORT_OPTIONS = [
  "newest",
  "popular",
  "price-asc",
  "price-desc",
  "name-asc",
] as const;

export type CatalogSearchParams = Record<
  string,
  string | string[] | undefined
>;
export type CatalogProductType = (typeof PRODUCT_TYPES)[number];
export type CatalogSort = (typeof SORT_OPTIONS)[number];

export type CatalogFilters = {
  q: string;
  category: string;
  brands: string[];
  type: CatalogProductType | "";
  minPrice: number | null;
  maxPrice: number | null;
  inStock: boolean;
  featured: boolean;
  sort: CatalogSort;
  page: number;
  perPage: (typeof CATALOG_PAGE_SIZES)[number];
};

const catalogProductSelect = {
  id: true,
  name: true,
  type: true,
  basePrice: true,
  originalPrice: true,
  image: true,
  soldCount: true,
  ratingAvg: true,
  ratingCount: true,
  bundleStockLimit: true,
  variants: {
    where: { active: true },
    orderBy: { id: "asc" as const },
    select: {
      id: true,
      sku: true,
      price: true,
      stock: true,
      options: true,
      colorImage: true,
    },
  },
  bundleItems: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      quantity: true,
      product: {
        select: { id: true, name: true, image: true },
      },
    },
  },
} as const satisfies Prisma.ProductSelect;

type RawCatalogProduct = Prisma.ProductGetPayload<{
  select: typeof catalogProductSelect;
}>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function boundedInteger(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function optionalMoney(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

export function parseCatalogFilters(
  searchParams: CatalogSearchParams,
): CatalogFilters {
  const rawBrands = searchParams.brand;
  const brands = uniqueStrings(
    (Array.isArray(rawBrands) ? rawBrands : rawBrands ? [rawBrands] : [])
      .flatMap((value) => value.split(","))
      .slice(0, 12),
  );
  const rawType = firstValue(searchParams.type)?.toUpperCase() ?? "";
  const type = PRODUCT_TYPES.includes(rawType as CatalogProductType)
    ? (rawType as CatalogProductType)
    : "";
  const rawSort = firstValue(searchParams.sort) ?? "newest";
  const sort = SORT_OPTIONS.includes(rawSort as CatalogSort)
    ? (rawSort as CatalogSort)
    : "newest";
  const requestedPageSize = Number(firstValue(searchParams.perPage) ?? 24);
  const perPage = CATALOG_PAGE_SIZES.includes(
    requestedPageSize as (typeof CATALOG_PAGE_SIZES)[number],
  )
    ? (requestedPageSize as (typeof CATALOG_PAGE_SIZES)[number])
    : 24;
  const rawMinPrice = optionalMoney(firstValue(searchParams.minPrice));
  const rawMaxPrice = optionalMoney(firstValue(searchParams.maxPrice));
  const [minPrice, maxPrice] =
    rawMinPrice !== null &&
    rawMaxPrice !== null &&
    rawMinPrice > rawMaxPrice
      ? [rawMaxPrice, rawMinPrice]
      : [rawMinPrice, rawMaxPrice];

  return {
    q: (firstValue(searchParams.q) ?? "").trim().slice(0, 100),
    category: (firstValue(searchParams.category) ?? "").trim().slice(0, 100),
    brands,
    type,
    minPrice,
    maxPrice,
    inStock: firstValue(searchParams.inStock) === "1",
    featured: firstValue(searchParams.featured) === "1",
    sort,
    page: boundedInteger(firstValue(searchParams.page), 1, 10_000),
    perPage,
  };
}

function normalizeOptions(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  return Object.fromEntries(
    Object.entries(value).filter(([, optionValue]) =>
      ["string", "number"].includes(typeof optionValue) || optionValue === null,
    ),
  ) as Record<string, string | number | null>;
}

function productStock(product: RawCatalogProduct) {
  if (product.type === "BUNDLE") return product.bundleStockLimit ?? 0;
  if (product.type === "DIGITAL" || product.type === "SERVICE") return 1;
  return product.variants.reduce((total, variant) => total + variant.stock, 0);
}

function serializeCatalogProduct(product: RawCatalogProduct) {
  const price = Number(product.basePrice);
  const originalPrice =
    product.originalPrice === null ? null : Number(product.originalPrice);
  const discountPct =
    originalPrice && originalPrice > price
      ? Math.round(((originalPrice - price) / originalPrice) * 100)
      : 0;

  return {
    id: product.id,
    name: product.name,
    type: product.type,
    price,
    originalPrice,
    available: true,
    image: product.image,
    soldCount: product.soldCount,
    ratingAvg: product.ratingAvg,
    ratingCount: product.ratingCount,
    stock: productStock(product),
    discountPct,
    bundleStockLimit: product.bundleStockLimit,
    variants: product.variants.map((variant) => ({
      ...variant,
      price: Number(variant.price),
      options: normalizeOptions(variant.options),
    })),
    bundleItems: product.bundleItems.map((item) => ({
      quantity: item.quantity,
      product: {
        id: item.product.id,
        name: item.product.name,
        image: item.product.image,
      },
    })),
  };
}

const readCatalogFacets = unstable_cache(
  async () => {
    const [categories, brands, priceRange, siteSettings] = await Promise.all([
      prisma.category.findMany({
        where: { deleted: false },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          image: true,
          parentId: true,
          _count: {
            select: {
              products: { where: { deleted: false, available: true } },
            },
          },
        },
      }),
      prisma.brand.findMany({
        where: { deleted: false },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          logo: true,
          _count: {
            select: {
              products: { where: { deleted: false, available: true } },
            },
          },
        },
      }),
      prisma.product.aggregate({
        where: { deleted: false, available: true },
        _min: { basePrice: true },
        _max: { basePrice: true },
      }),
      prisma.sitesettings.findFirst({
        orderBy: { id: "asc" },
        select: {
          id: true,
          logo: true,
          siteTitle: true,
          footerDescription: true,
          contactNumber: true,
          contactEmail: true,
          address: true,
          facebookLink: true,
          instagramLink: true,
          twitterLink: true,
          tiktokLink: true,
          youtubeLink: true,
        },
      }),
    ]);

    const childrenByParent = new Map<number, number[]>();
    const directCounts = new Map(
      categories.map((category) => [category.id, category._count.products]),
    );
    for (const category of categories) {
      if (category.parentId === null) continue;
      const children = childrenByParent.get(category.parentId) ?? [];
      children.push(category.id);
      childrenByParent.set(category.parentId, children);
    }
    const totalCountCache = new Map<number, number>();
    const totalProducts = (id: number, trail = new Set<number>()): number => {
      const cached = totalCountCache.get(id);
      if (cached !== undefined) return cached;
      if (trail.has(id)) return directCounts.get(id) ?? 0;
      const nextTrail = new Set(trail).add(id);
      const total =
        (directCounts.get(id) ?? 0) +
        (childrenByParent.get(id) ?? []).reduce(
          (sum, childId) => sum + totalProducts(childId, nextTrail),
          0,
        );
      totalCountCache.set(id, total);
      return total;
    };

    return {
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        image: category.image,
        parentId: category.parentId,
        productCount: totalProducts(category.id),
      })),
      brands: brands.map((brand) => ({
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
        logo: brand.logo,
        productCount: brand._count.products,
      })),
      priceRange: {
        min: priceRange._min.basePrice
          ? Math.floor(Number(priceRange._min.basePrice))
          : 0,
        max: priceRange._max.basePrice
          ? Math.ceil(Number(priceRange._max.basePrice))
          : 0,
      },
      productTypes: [...PRODUCT_TYPES],
      siteSettings: siteSettings ?? {
        id: 0,
        logo: null,
        siteTitle: null,
        footerDescription: null,
        contactNumber: null,
        contactEmail: null,
        address: null,
        facebookLink: null,
        instagramLink: null,
        twitterLink: null,
        tiktokLink: null,
        youtubeLink: null,
      },
    };
  },
  ["storefront-catalog-facets-v1"],
  {
    revalidate: 300,
    tags: ["storefront-catalog", "products", "categories", "site-settings"],
  },
);

function descendantCategoryIds(
  categories: Awaited<ReturnType<typeof readCatalogFacets>>["categories"],
  slug: string,
) {
  const selected = categories.find(
    (category) => category.slug === slug || String(category.id) === slug,
  );
  if (!selected) return [];
  const childrenByParent = new Map<number, number[]>();
  for (const category of categories) {
    if (category.parentId === null) continue;
    const children = childrenByParent.get(category.parentId) ?? [];
    children.push(category.id);
    childrenByParent.set(category.parentId, children);
  }
  const ids: number[] = [];
  const pending = [selected.id];
  const visited = new Set<number>();
  while (pending.length) {
    const id = pending.pop();
    if (id === undefined || visited.has(id)) continue;
    visited.add(id);
    ids.push(id);
    pending.push(...(childrenByParent.get(id) ?? []));
  }
  return ids;
}

function catalogOrderBy(
  sort: CatalogSort,
): Prisma.ProductOrderByWithRelationInput[] {
  if (sort === "popular") return [{ soldCount: "desc" }, { id: "desc" }];
  if (sort === "price-asc") return [{ basePrice: "asc" }, { id: "desc" }];
  if (sort === "price-desc") return [{ basePrice: "desc" }, { id: "desc" }];
  if (sort === "name-asc") return [{ name: "asc" }, { id: "desc" }];
  return [{ createdAt: "desc" }, { id: "desc" }];
}

const readCatalog = unstable_cache(
  async (serializedFilters: string) => {
    const filters = JSON.parse(serializedFilters) as CatalogFilters;
    const facets = await readCatalogFacets();
    const categoryIds = filters.category
      ? descendantCategoryIds(facets.categories, filters.category)
      : [];
    const andFilters: Prisma.ProductWhereInput[] = [];
    if (filters.q) {
      andFilters.push({
        OR: [
          { name: { contains: filters.q, mode: "insensitive" } },
          { sku: { contains: filters.q, mode: "insensitive" } },
          { shortDesc: { contains: filters.q, mode: "insensitive" } },
          { brand: { name: { contains: filters.q, mode: "insensitive" } } },
        ],
      });
    }
    if (filters.inStock) {
      andFilters.push({
        OR: [
          { type: { in: ["DIGITAL", "SERVICE"] } },
          { type: "BUNDLE", bundleStockLimit: { gt: 0 } },
          {
            type: "PHYSICAL",
            variants: { some: { active: true, stock: { gt: 0 } } },
          },
        ],
      });
    }
    const where: Prisma.ProductWhereInput = {
      deleted: false,
      available: true,
      ...(andFilters.length ? { AND: andFilters } : {}),
      ...(filters.category
        ? { categoryId: { in: categoryIds.length ? categoryIds : [-1] } }
        : {}),
      ...(filters.brands.length
        ? { brand: { slug: { in: filters.brands } } }
        : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.featured ? { featured: true } : {}),
      ...(filters.minPrice !== null || filters.maxPrice !== null
        ? {
            basePrice: {
              ...(filters.minPrice !== null ? { gte: filters.minPrice } : {}),
              ...(filters.maxPrice !== null ? { lte: filters.maxPrice } : {}),
            },
          }
        : {}),
    };
    const skip = (filters.page - 1) * filters.perPage;
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: catalogOrderBy(filters.sort),
        skip,
        take: filters.perPage,
        select: catalogProductSelect,
      }),
      prisma.product.count({ where }),
    ]);

    return {
      filters,
      facets,
      products: products.map(serializeCatalogProduct),
      pagination: {
        page: filters.page,
        perPage: filters.perPage,
        total,
        totalPages: Math.max(1, Math.ceil(total / filters.perPage)),
      },
    };
  },
  ["storefront-catalog-results-v1"],
  { revalidate: 120, tags: ["storefront-catalog", "products", "categories"] },
);

export type StorefrontCatalogData = Awaited<ReturnType<typeof readCatalog>>;
export type StorefrontCatalogProduct = StorefrontCatalogData["products"][number];
export type StorefrontCatalogFacets = Awaited<
  ReturnType<typeof readCatalogFacets>
>;

export async function getStorefrontCatalog(filters: CatalogFilters) {
  return readCatalog(JSON.stringify(filters));
}

export async function getStorefrontCatalogFacets() {
  return readCatalogFacets();
}

export function catalogUrl(
  filters: CatalogFilters,
  overrides: Partial<CatalogFilters> = {},
) {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (next.q) params.set("q", String(next.q));
  if (next.category) params.set("category", String(next.category));
  for (const brand of next.brands) params.append("brand", brand);
  if (next.type) params.set("type", String(next.type));
  if (next.minPrice !== null) params.set("minPrice", String(next.minPrice));
  if (next.maxPrice !== null) params.set("maxPrice", String(next.maxPrice));
  if (next.inStock) params.set("inStock", "1");
  if (next.featured) params.set("featured", "1");
  if (next.sort !== "newest") params.set("sort", String(next.sort));
  if (Number(next.page) > 1) params.set("page", String(next.page));
  if (Number(next.perPage) !== 24) params.set("perPage", String(next.perPage));
  const query = params.toString();
  return `/ecommerce/products${query ? `?${query}` : ""}`;
}
