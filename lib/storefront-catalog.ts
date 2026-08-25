import { unstable_cache } from "next/cache.js";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { resolveFlashSalePricing } from "@/lib/flash-sale";
import { getRankedSearchProductIds } from "@/lib/search/server";
import { parseSearchIntent } from "@/lib/search/core";

const CATALOG_PAGE_SIZES = [12, 24, 36] as const;
export const CATALOG_MAX_PRICE = 99_999_999.99;
export const CATALOG_MAX_PAGE = 500;
const CATALOG_MAX_BRANDS = 12;
const CATALOG_MAX_SEARCH_TERMS = 8;
// Attribute facets are dynamic, so they need their own hard caps to keep a
// crafted query string from turning into an unbounded pile of joins.
const CATALOG_MAX_ATTRIBUTE_GROUPS = 12;
const CATALOG_MAX_ATTRIBUTE_VALUES = 24;
const CATALOG_MAX_FACET_VALUES_PER_GROUP = 40;
const CATALOG_ATTRIBUTE_PREFIX = "attr_";
const PRODUCT_TYPES = ["PHYSICAL", "DIGITAL", "SERVICE", "BUNDLE"] as const;
const SORT_OPTIONS = [
  "relevance",
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
  // Dynamic spec filters keyed by attribute id: { "68": ["Core i5-1334U"] }.
  // Values within one attribute are OR-ed, separate attributes are AND-ed.
  attributes: Record<string, string[]>;
};

const catalogProductSelect = {
  id: true,
  name: true,
  type: true,
  basePrice: true,
  originalPrice: true,
  flashSaleEnabled: true,
  flashSalePrice: true,
  flashSaleStartsAt: true,
  flashSaleEndsAt: true,
  image: true,
  shortDesc: true,
  soldCount: true,
  ratingAvg: true,
  ratingCount: true,
  bundleStockLimit: true,
  attributes: {
    orderBy: { id: "asc" as const },
    take: 4,
    select: {
      value: true,
      attribute: { select: { name: true } },
    },
  },
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

function normalizeAttributeValue(value: unknown) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * Reads `attr_<attributeId>=<value>` pairs out of the query string. Attribute
 * ids come from the DB rather than a hardcoded list, which is what lets a
 * laptop show RAM/SSD while another category shows its own specs.
 */
function parseAttributeFilters(searchParams: CatalogSearchParams) {
  const parsed: Record<string, string[]> = {};

  for (const key of Object.keys(searchParams)) {
    if (!key.startsWith(CATALOG_ATTRIBUTE_PREFIX)) continue;
    const rawId = key.slice(CATALOG_ATTRIBUTE_PREFIX.length);
    if (!/^\d{1,9}$/.test(rawId)) continue;
    const attributeId = String(Number(rawId));

    const raw = searchParams[key];
    const values = Array.from(
      new Set(
        (Array.isArray(raw) ? raw : raw ? [raw] : [])
          .map((value) => normalizeAttributeValue(value))
          .filter(Boolean),
      ),
    ).slice(0, CATALOG_MAX_ATTRIBUTE_VALUES);

    if (values.length) parsed[attributeId] = values;
  }

  return Object.fromEntries(
    Object.entries(parsed)
      .sort(([a], [b]) => Number(a) - Number(b))
      .slice(0, CATALOG_MAX_ATTRIBUTE_GROUPS),
  );
}

export function parseCatalogFilters(
  searchParams: CatalogSearchParams,
): CatalogFilters {
  const intent = parseSearchIntent(firstValue(searchParams.q));
  const normalizedQuery = normalizeSearch(intent.searchText);
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
  const rawSort = firstValue(searchParams.sort) ?? (normalizedQuery ? "relevance" : "newest");
  const sort = SORT_OPTIONS.includes(rawSort as CatalogSort)
    ? (rawSort as CatalogSort)
    : normalizedQuery
      ? "relevance"
      : "newest";
  const requestedPageSize = Number(firstValue(searchParams.perPage) ?? 24);
  const perPage = CATALOG_PAGE_SIZES.includes(
    requestedPageSize as (typeof CATALOG_PAGE_SIZES)[number],
  )
    ? (requestedPageSize as (typeof CATALOG_PAGE_SIZES)[number])
    : 24;
  const explicitMinPrice = optionalMoney(firstValue(searchParams.minPrice));
  const explicitMaxPrice = optionalMoney(firstValue(searchParams.maxPrice));
  const rawMinPrice = explicitMinPrice ?? intent.minPrice;
  const rawMaxPrice = explicitMaxPrice ?? intent.maxPrice;
  const [minPrice, maxPrice] =
    rawMinPrice !== null &&
    rawMaxPrice !== null &&
    rawMinPrice > rawMaxPrice
      ? [rawMaxPrice, rawMinPrice]
      : [rawMinPrice, rawMaxPrice];

  return {
    q: normalizedQuery,
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
    attributes: parseAttributeFilters(searchParams),
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
  const flashSale = resolveFlashSalePricing(product);
  const price = flashSale.salePrice;
  const originalPrice = flashSale.active
    ? flashSale.regularPrice
    : product.originalPrice === null
      ? null
      : Number(product.originalPrice);
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
    shortDesc: product.shortDesc,
    specifications: product.attributes.map((item) => ({
      label: item.attribute.name,
      value: item.value,
    })),
    soldCount: product.soldCount,
    ratingAvg: product.ratingAvg,
    ratingCount: product.ratingCount,
    stock: catalogProductStock(product),
    discountPct,
    flashSale,
    bundleStockLimit: product.bundleStockLimit,
    variants: product.variants.map((variant) => ({
      ...variant,
      price: resolveFlashSalePricing(product, variant.price).salePrice,
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
  ["storefront-catalog-facets-v4"],
  {
    revalidate: 300,
    tags: ["storefront-catalog", "products", "categories", "site-settings"],
  },
);

/**
 * Attribute facets are scoped to the categories in view, so a Laptops page
 * offers RAM/SSD/Processor while another category offers its own specs. Values
 * are counted over products that are actually visible in the catalog.
 */
const readCatalogAttributeFacets = unstable_cache(
  async (serializedCategoryIds: string) => {
    const categoryIds = JSON.parse(serializedCategoryIds) as number[];
    const rows = await prisma.productAttribute.findMany({
      where: {
        product: {
          deleted: false,
          available: true,
          ...(categoryIds.length ? { categoryId: { in: categoryIds } } : {}),
        },
      },
      select: {
        value: true,
        attributeId: true,
        attribute: { select: { name: true } },
      },
    });

    const groups = new Map<
      number,
      { id: number; name: string; values: Map<string, number> }
    >();

    for (const row of rows) {
      const value = row.value.trim();
      if (!value) continue;
      const group = groups.get(row.attributeId) ?? {
        id: row.attributeId,
        name: row.attribute.name,
        values: new Map<string, number>(),
      };
      group.values.set(value, (group.values.get(value) ?? 0) + 1);
      groups.set(row.attributeId, group);
    }

    return Array.from(groups.values())
      .map((group) => ({
        id: group.id,
        name: group.name,
        values: Array.from(group.values.entries())
          .map(([value, productCount]) => ({ value, productCount }))
          .sort(
            (a, b) =>
              b.productCount - a.productCount ||
              a.value.localeCompare(b.value, undefined, { numeric: true }),
          )
          .slice(0, CATALOG_MAX_FACET_VALUES_PER_GROUP),
      }))
      // A single-value attribute cannot narrow anything, so it is only noise.
      .filter((group) => group.values.length > 1)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  ["storefront-catalog-attribute-facets-v1"],
  {
    revalidate: 300,
    tags: ["storefront-catalog", "products", "categories"],
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
  if (sort === "relevance") return [{ soldCount: "desc" }, { id: "desc" }];
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
    const scopedCategory = requestedFilters.category
      ? facets.categories.find(
          (category) =>
            category.slug === requestedFilters.category ||
            String(category.id) === requestedFilters.category,
        )
      : null;
    const categoryIds = scopedCategory
      ? descendantCategoryIds(facets.categories, scopedCategory.slug)
      : [];
    const attributeFacets = await readCatalogAttributeFacets(
      JSON.stringify(categoryIds),
    );
    const filters = resolveCatalogFilters(
      requestedFilters,
      facets,
      attributeFacets,
    );
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
    // Each selected attribute narrows the result set (AND), while the values
    // picked inside one attribute widen it (OR) - the usual spec-filter shape.
    for (const [attributeId, values] of Object.entries(filters.attributes)) {
      andFilters.push({
        attributes: {
          some: {
            attributeId: Number(attributeId),
            value: { in: values },
          },
        },
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
    let products: RawCatalogProduct[];
    let total: number;
    if (filters.q && filters.sort === "relevance") {
      const rankedIds = await getRankedSearchProductIds(filters.q);
      if (rankedIds.length === 0) {
        products = [];
        total = 0;
      } else {
        const eligibleRows = await prisma.product.findMany({
          where: { ...where, id: { in: rankedIds } },
          select: { id: true },
        });
        const eligible = new Set(eligibleRows.map((row) => row.id));
        const orderedIds = rankedIds.filter((id) => eligible.has(id));
        total = orderedIds.length;
        const pageIds = orderedIds.slice(skip, skip + filters.perPage);
        const pageRows = pageIds.length
          ? await prisma.product.findMany({
              where: { id: { in: pageIds } },
              select: catalogProductSelect,
            })
          : [];
        const pageById = new Map(pageRows.map((product) => [product.id, product]));
        products = pageIds.flatMap((id) => {
          const product = pageById.get(id);
          return product ? [product] : [];
        });
      }
    } else {
      [products, total] = await Promise.all([
        prisma.product.findMany({
          where,
          orderBy: catalogOrderBy(filters.sort),
          skip,
          take: filters.perPage,
          select: catalogProductSelect,
        }),
        prisma.product.count({ where }),
      ]);
    }

    return {
      filters,
      facets: { ...facets, attributes: attributeFacets },
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

export type CatalogAttributeFacet = Awaited<
  ReturnType<typeof readCatalogAttributeFacets>
>[number];
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
  attributeFacets: CatalogAttributeFacet[] = [],
): CatalogFilters {
  const selectedCategory = filters.category
    ? facets.categories.find(
        (category) =>
          category.slug === filters.category ||
          String(category.id) === filters.category,
      )
    : null;
  const knownBrands = new Set(facets.brands.map((brand) => brand.slug));
  // Attribute selections that no longer exist in the current category scope are
  // dropped, so switching category cannot leave a filter that matches nothing.
  const valuesByAttribute = new Map(
    attributeFacets.map((group) => [
      String(group.id),
      new Set(group.values.map((entry) => entry.value)),
    ]),
  );
  const attributes: Record<string, string[]> = {};
  for (const [attributeId, values] of Object.entries(filters.attributes)) {
    const known = valuesByAttribute.get(attributeId);
    if (!known) continue;
    const kept = values.filter((value) => known.has(value));
    if (kept.length) attributes[attributeId] = kept;
  }

  return {
    ...filters,
    category: selectedCategory?.slug ?? "",
    brands: filters.brands.filter((brand) => knownBrands.has(brand)),
    attributes,
  };
}

export function catalogCanonicalUrl(filters: CatalogFilters) {
  const keepBrand = !filters.category && filters.brands.length === 1;
  return catalogUrl(filters, {
    q: "",
    brands: keepBrand ? filters.brands : [],
    attributes: {},
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
    Object.keys(filters.attributes).length === 0 &&
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
  for (const [attributeId, values] of Object.entries(next.attributes ?? {})) {
    for (const value of values) {
      params.append(`${CATALOG_ATTRIBUTE_PREFIX}${attributeId}`, value);
    }
  }
  if (next.inStock) params.set("inStock", "1");
  if (next.featured) params.set("featured", "1");
  if (next.sort !== "newest") params.set("sort", String(next.sort));
  if (Number(next.page) > 1) params.set("page", String(next.page));
  if (Number(next.perPage) !== 24) params.set("perPage", String(next.perPage));
  const query = params.toString();
  return `/ecommerce/products${query ? `?${query}` : ""}`;
}
