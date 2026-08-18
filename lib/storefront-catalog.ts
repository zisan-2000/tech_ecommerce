import { unstable_cache } from "next/cache.js";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

const CATALOG_PAGE_SIZES = [12, 24, 36] as const;
export const CATALOG_MAX_PRICE = 99_999_999.99;
export const CATALOG_MAX_PAGE = 500;
const CATALOG_MAX_BRANDS = 12;
const CATALOG_MAX_SEARCH_TERMS = 8;
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
      isDefault: true,
    },
  },
  bundleItems: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      quantity: true,
      product: {
        select: {
          id: true,
          name: true,
          image: true,
          available: true,
          deleted: true,
          variants: {
            where: { active: true },
            orderBy: [{ isDefault: "desc" as const }, { id: "asc" as const }],
            select: { stock: true, isDefault: true },
          },
        },
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
  const normalized = String(value).trim();
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= CATALOG_MAX_PRICE
    ? parsed
    : null;
}

function normalizeSlug(value: unknown, allowNumeric = false) {
  const normalized = String(value ?? "").trim().toLowerCase().slice(0, 80);
  const pattern = allowNumeric
    ? /^(?:\d+|[a-z0-9]+(?:-[a-z0-9]+)*)$/
    : /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return pattern.test(normalized) ? normalized : "";
}

function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function escapePostgresLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function catalogSearchTerms(query: string) {
  return normalizeSearch(query)
    .split(" ")
    .filter(Boolean)
    .slice(0, CATALOG_MAX_SEARCH_TERMS)
    .map(escapePostgresLike);
}

export function parseCatalogFilters(
  searchParams: CatalogSearchParams,
): CatalogFilters {
  const rawBrands = searchParams.brand;
  const brands = Array.from(
    new Set(
      (Array.isArray(rawBrands) ? rawBrands : rawBrands ? [rawBrands] : [])
        .flatMap((value) => value.split(","))
        .map((value) => normalizeSlug(value))
        .filter(Boolean),
    ),
  ).slice(0, CATALOG_MAX_BRANDS);
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
    q: normalizeSearch(firstValue(searchParams.q)),
    category: normalizeSlug(firstValue(searchParams.category), true),
    brands,
    type,
    minPrice,
    maxPrice,
    inStock: firstValue(searchParams.inStock) === "1",
    featured: firstValue(searchParams.featured) === "1",
    sort,
    page: boundedInteger(firstValue(searchParams.page), 1, CATALOG_MAX_PAGE),
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

export function catalogProductStock(product: RawCatalogProduct) {
  if (product.type === "BUNDLE") {
    if (product.bundleItems.length === 0) return 0;
    const derivedStock = product.bundleItems.reduce((available, item) => {
      if (item.product.deleted || !item.product.available || item.quantity < 1) {
        return 0;
      }
      const variant = item.product.variants[0];
      const itemStock = variant
        ? Math.floor(Math.max(0, variant.stock) / item.quantity)
        : 0;
      return Math.min(available, itemStock);
    }, Number.POSITIVE_INFINITY);
    return Math.max(
      0,
      Math.min(derivedStock, product.bundleStockLimit ?? derivedStock),
    );
  }
  if (product.type === "DIGITAL" || product.type === "SERVICE") return 1;
  return product.variants.reduce(
    (total, variant) => total + Math.max(0, variant.stock),
    0,
  );
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
    stock: catalogProductStock(product),
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

    const categoryById = new Map(
      categories.map((category) => [category.id, category]),
    );
    const orderedCategories: Array<
      (typeof categories)[number] & { depth: number }
    > = [];
    const visited = new Set<number>();
    const appendCategory = (id: number, depth: number) => {
      if (visited.has(id)) return;
      const category = categoryById.get(id);
      if (!category) return;
      visited.add(id);
      orderedCategories.push({ ...category, depth });
      for (const childId of childrenByParent.get(id) ?? []) {
        appendCategory(childId, depth + 1);
      }
    };
    for (const category of categories) {
      if (category.parentId === null || !categoryById.has(category.parentId)) {
        appendCategory(category.id, 0);
      }
    }
    for (const category of categories) appendCategory(category.id, 0);

    return {
      categories: orderedCategories.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        image: category.image,
        parentId: category.parentId,
        depth: category.depth,
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
  ["storefront-catalog-facets-v3"],
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
    const requestedFilters = JSON.parse(serializedFilters) as CatalogFilters;
    const facets = await readCatalogFacets();
    const filters = resolveCatalogFilters(requestedFilters, facets);
    const categoryIds = filters.category
      ? descendantCategoryIds(facets.categories, filters.category)
      : [];
    const andFilters: Prisma.ProductWhereInput[] = [];
    for (const term of catalogSearchTerms(filters.q)) {
      andFilters.push({
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { slug: { contains: term, mode: "insensitive" } },
          { sku: { contains: term, mode: "insensitive" } },
          { shortDesc: { contains: term, mode: "insensitive" } },
          { brand: { name: { contains: term, mode: "insensitive" } } },
        ],
      });
    }
    if (filters.inStock) {
      andFilters.push({
        OR: [
          { type: { in: ["DIGITAL", "SERVICE"] } },
          {
            type: "BUNDLE",
            bundleStockLimit: { gt: 0 },
            bundleItems: {
              some: {},
              every: {
                quantity: { gt: 0 },
                product: {
                  deleted: false,
                  available: true,
                  variants: {
                    some: { active: true, stock: { gt: 0 } },
                  },
                },
              },
            },
          },
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
  ["storefront-catalog-results-v3"],
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

export function resolveCatalogFilters(
  filters: CatalogFilters,
  facets: StorefrontCatalogFacets,
): CatalogFilters {
  const selectedCategory = filters.category
    ? facets.categories.find(
        (category) =>
          category.slug === filters.category ||
          String(category.id) === filters.category,
      )
    : null;
  const knownBrands = new Set(facets.brands.map((brand) => brand.slug));
  return {
    ...filters,
    category: selectedCategory?.slug ?? "",
    brands: filters.brands.filter((brand) => knownBrands.has(brand)),
  };
}

export function catalogCanonicalUrl(filters: CatalogFilters) {
  const keepBrand = !filters.category && filters.brands.length === 1;
  return catalogUrl(filters, {
    q: "",
    brands: keepBrand ? filters.brands : [],
    type: "",
    minPrice: null,
    maxPrice: null,
    inStock: false,
    featured: false,
    sort: "newest",
    page: 1,
    perPage: 24,
  });
}

export function isIndexableCatalogView(filters: CatalogFilters) {
  return (
    !filters.q &&
    filters.brands.length <= 1 &&
    !(filters.category && filters.brands.length > 0) &&
    !filters.type &&
    filters.minPrice === null &&
    filters.maxPrice === null &&
    !filters.inStock &&
    !filters.featured &&
    filters.sort === "newest" &&
    filters.page === 1 &&
    filters.perPage === 24
  );
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
