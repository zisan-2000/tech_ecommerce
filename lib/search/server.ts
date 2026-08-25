import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { resolveFlashSalePricing } from "@/lib/flash-sale";
import {
  compactModelToken,
  normalizeSearchQuery,
  parseSearchIntent,
  sanitizeSuggestionLimit,
  type SearchSuggestionProduct,
  type SearchSuggestionResponse,
} from "@/lib/search/core";
import { searchTypesenseProducts, typesenseSearchEnabled } from "@/lib/search/typesense";

type RankedProductRow = {
  id: number;
  score: number;
  matchedVariantSku: string | null;
};

type SearchRuleAction = {
  pinProductIds?: number[];
  boostProductIds?: number[];
  suggestedQueries?: string[];
};

function validProductIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ).slice(0, 24);
}

function parseRuleAction(value: Prisma.JsonValue): SearchRuleAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  return {
    pinProductIds: validProductIds(input.pinProductIds),
    boostProductIds: validProductIds(input.boostProductIds),
    suggestedQueries: Array.isArray(input.suggestedQueries)
      ? input.suggestedQueries
          .map(normalizeSearchQuery)
          .filter(Boolean)
          .slice(0, 8)
      : [],
  };
}

function ruleMatches(
  normalizedQuery: string,
  rule: { query: string; matchType: "EXACT" | "PREFIX" | "CONTAINS" },
) {
  const needle = normalizeSearchQuery(rule.query).toLocaleLowerCase("en-US");
  if (!needle) return false;
  if (rule.matchType === "EXACT") return normalizedQuery === needle;
  if (rule.matchType === "PREFIX") return normalizedQuery.startsWith(needle);
  return normalizedQuery.includes(needle);
}

async function loadSearchConfiguration(normalizedQuery: string) {
  try {
    const now = new Date();
    const [synonyms, rules] = await Promise.all([
      prisma.searchSynonym.findMany({
        where: { active: true },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 100,
        select: { terms: true },
      }),
      prisma.searchQueryRule.findMany({
        where: {
          active: true,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          ],
        },
        orderBy: [{ priority: "desc" }, { id: "asc" }],
        take: 100,
        select: { query: true, matchType: true, action: true },
      }),
    ]);

    const matchedActions = rules
      .filter((rule) => ruleMatches(normalizedQuery, rule))
      .map((rule) => parseRuleAction(rule.action));
    return {
      synonymGroups: synonyms
        .map((row) => row.terms.map(normalizeSearchQuery).filter(Boolean))
        .filter((terms) => terms.length > 1),
      pinProductIds: Array.from(
        new Set(matchedActions.flatMap((action) => action.pinProductIds ?? [])),
      ),
      boostProductIds: Array.from(
        new Set(matchedActions.flatMap((action) => action.boostProductIds ?? [])),
      ),
      suggestedQueries: Array.from(
        new Set(matchedActions.flatMap((action) => action.suggestedQueries ?? [])),
      ),
    };
  } catch (error) {
    // Search remains usable during a rolling deploy before the configuration
    // migration reaches every environment.
    console.warn("Search configuration is unavailable; using built-in relevance", error);
    return {
      synonymGroups: [] as string[][],
      pinProductIds: [] as number[],
      boostProductIds: [] as number[],
      suggestedQueries: [] as string[],
    };
  }
}

function searchableTermCondition(term: string) {
  const like = `%${term}%`;
  const compact = compactModelToken(term);
  return Prisma.sql`(
    lower(p."name") LIKE ${like}
    OR lower(p."slug") LIKE ${like}
    OR lower(coalesce(p."sku", '')) LIKE ${like}
    OR lower(coalesce(p."shortDesc", '')) LIKE ${like}
    OR lower(coalesce(b."name", '')) LIKE ${like}
    OR lower(c."name") LIKE ${like}
    OR EXISTS (
      SELECT 1 FROM "ProductVariant" pv
      WHERE pv."productId" = p."id" AND pv."active" = true
        AND (
          lower(pv."sku") LIKE ${like}
          OR regexp_replace(lower(pv."sku"), '[^a-z0-9]+', '', 'g') = ${compact}
        )
    )
    OR EXISTS (
      SELECT 1 FROM "ProductAttribute" pa
      JOIN "Attribute" a ON a."id" = pa."attributeId"
      WHERE pa."productId" = p."id"
        AND (lower(pa."value") LIKE ${like} OR lower(a."name") LIKE ${like})
    )
  )`;
}

async function rankedProductCandidates(
  query: string,
  expandedTerms: string[],
  boostProductIds: number[],
  limit: number,
) {
  const normalized = query.toLocaleLowerCase("en-US");
  const compact = compactModelToken(query);
  const prefix = `${normalized}%`;
  const contains = `%${normalized}%`;
  const termConditions = expandedTerms.map(searchableTermCondition);
  const boostIds = boostProductIds.length
    ? Prisma.sql`CASE WHEN p."id" IN (${Prisma.join(boostProductIds)}) THEN 180 ELSE 0 END`
    : Prisma.sql`0`;

  return prisma.$queryRaw<RankedProductRow[]>(Prisma.sql`
    SELECT
      p."id",
      (
        CASE WHEN lower(coalesce(p."sku", '')) = ${normalized} THEN 1200 ELSE 0 END
        + CASE WHEN regexp_replace(lower(coalesce(p."sku", '')), '[^a-z0-9]+', '', 'g') = ${compact} THEN 1100 ELSE 0 END
        + CASE WHEN EXISTS (
            SELECT 1 FROM "ProductVariant" pv
            WHERE pv."productId" = p."id" AND pv."active" = true
              AND lower(pv."sku") = ${normalized}
          ) THEN 1150 ELSE 0 END
        + CASE WHEN lower(p."name") = ${normalized} THEN 900 ELSE 0 END
        + CASE WHEN lower(p."name") LIKE ${prefix} THEN 450 ELSE 0 END
        + CASE WHEN lower(p."name") LIKE ${contains} THEN 240 ELSE 0 END
        + CASE WHEN lower(coalesce(b."name", '')) = ${normalized} THEN 180 ELSE 0 END
        + CASE WHEN lower(c."name") = ${normalized} THEN 160 ELSE 0 END
        + similarity(lower(p."name"), ${normalized}) * 220
        + ts_rank_cd(p."searchVector", websearch_to_tsquery('simple', ${query})) * 180
        + LEAST(p."soldCount", 1000) * 0.025
        + p."ratingAvg" * 2
        + ${boostIds}
      )::double precision AS "score",
      (
        SELECT pv."sku" FROM "ProductVariant" pv
        WHERE pv."productId" = p."id" AND pv."active" = true
          AND (
            lower(pv."sku") LIKE ${contains}
            OR regexp_replace(lower(pv."sku"), '[^a-z0-9]+', '', 'g') = ${compact}
          )
        ORDER BY
          CASE WHEN lower(pv."sku") = ${normalized} THEN 0 ELSE 1 END,
          pv."id" ASC
        LIMIT 1
      ) AS "matchedVariantSku"
    FROM "Product" p
    JOIN "Category" c ON c."id" = p."categoryId" AND c."deleted" = false
    LEFT JOIN "Brand" b ON b."id" = p."brandId" AND b."deleted" = false
    WHERE p."deleted" = false
      AND p."available" = true
      AND (
        p."searchVector" @@ websearch_to_tsquery('simple', ${query})
        OR similarity(lower(p."name"), ${normalized}) >= 0.16
        OR ${Prisma.join(termConditions, " OR ")}
      )
    ORDER BY "score" DESC, p."soldCount" DESC, p."id" DESC
    LIMIT ${Math.max(limit * 8, 48)}
  `);
}

async function fallbackProductCandidates(query: string, limit: number) {
  const products = await prisma.product.findMany({
    where: {
      deleted: false,
      available: true,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { sku: { contains: query, mode: "insensitive" } },
        { slug: { contains: query, mode: "insensitive" } },
        { brand: { name: { contains: query, mode: "insensitive" } } },
        { category: { name: { contains: query, mode: "insensitive" } } },
        { variants: { some: { active: true, sku: { contains: query, mode: "insensitive" } } } },
        { attributes: { some: { value: { contains: query, mode: "insensitive" } } } },
      ],
    },
    select: { id: true },
    orderBy: [{ soldCount: "desc" }, { id: "desc" }],
    take: Math.max(limit * 8, 48),
  });
  return products.map((product, index) => ({
    id: product.id,
    score: products.length - index,
    matchedVariantSku: null,
  }));
}

async function searchProductCandidates(
  query: string,
  expandedTerms: string[],
  boostProductIds: number[],
  limit: number,
) {
  if (typesenseSearchEnabled()) {
    try {
      const external = await searchTypesenseProducts(query, Math.max(limit * 8, 48));
      if (external) return external;
    } catch (error) {
      console.error("Typesense search failed; using PostgreSQL relevance", error);
    }
  }
  try {
    return await rankedProductCandidates(query, expandedTerms, boostProductIds, limit);
  } catch (error) {
    console.error("PostgreSQL relevance search failed; using safe fallback", error);
    return fallbackProductCandidates(query, limit);
  }
}

export async function getRankedSearchProductIds(rawQuery: unknown, maxCandidates = 18_000) {
  const initialIntent = parseSearchIntent(rawQuery);
  if (initialIntent.searchText.length < 2) return [];
  const config = await loadSearchConfiguration(initialIntent.normalizedQuery);
  const intent = parseSearchIntent(rawQuery, config.synonymGroups);
  const boundedMax = Math.max(48, Math.min(18_000, Math.floor(maxCandidates)));
  const ranked = await searchProductCandidates(
    intent.searchText,
    intent.expandedTerms,
    config.boostProductIds,
    Math.ceil(boundedMax / 8),
  );
  const ids = ranked.slice(0, boundedMax).map((row) => row.id);
  const pinned = config.pinProductIds.filter((id) => ids.includes(id));
  return [...pinned, ...ids.filter((id) => !pinned.includes(id))];
}

function productStock(product: {
  type: string;
  bundleStockLimit: number | null;
  variants: Array<{ stock: number }>;
}) {
  if (product.type === "DIGITAL" || product.type === "SERVICE") return 1;
  if (product.type === "BUNDLE") return Math.max(0, product.bundleStockLimit ?? 0);
  return product.variants.reduce((sum, variant) => sum + Math.max(0, variant.stock), 0);
}

function pinAndLimit<T extends { id: number }>(rows: T[], pinnedIds: number[], limit: number) {
  const rank = new Map(pinnedIds.map((id, index) => [id, index]));
  return [...rows]
    .sort((left, right) => {
      const leftRank = rank.get(left.id);
      const rightRank = rank.get(right.id);
      if (leftRank !== undefined && rightRank !== undefined) return leftRank - rightRank;
      if (leftRank !== undefined) return -1;
      if (rightRank !== undefined) return 1;
      return 0;
    })
    .slice(0, limit);
}

async function popularQuerySuggestions(prefix: string) {
  try {
    const rows = await prisma.searchEvent.findMany({
      where: {
        event: "SEARCH_SUBMITTED",
        normalizedQuery: { startsWith: prefix, mode: "insensitive" },
        createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
      select: { query: true, normalizedQuery: true },
      distinct: ["normalizedQuery"],
      orderBy: { createdAt: "desc" },
      take: 6,
    });
    return rows.map((row) => row.query);
  } catch {
    return [];
  }
}

export async function getSearchSuggestions(
  rawQuery: unknown,
  rawLimit?: unknown,
): Promise<SearchSuggestionResponse> {
  const startedAt = performance.now();
  const initialIntent = parseSearchIntent(rawQuery);
  const limit = sanitizeSuggestionLimit(rawLimit);
  const queryId = randomUUID();
  if (initialIntent.searchText.length < 2) {
    return {
      queryId,
      query: initialIntent.originalQuery,
      normalizedQuery: initialIntent.normalizedQuery,
      products: [],
      brands: [],
      categories: [],
      suggestedQueries: [],
      total: 0,
      tookMs: Math.round(performance.now() - startedAt),
    };
  }

  const config = await loadSearchConfiguration(initialIntent.normalizedQuery);
  const intent = parseSearchIntent(rawQuery, config.synonymGroups);
  const ranked = await searchProductCandidates(
    intent.searchText,
    intent.expandedTerms,
    config.boostProductIds,
    limit,
  );

  const candidateIds = ranked.map((row) => row.id);
  const [products, brands, categories, popularQueries] = await Promise.all([
    candidateIds.length
      ? prisma.product.findMany({
          where: { id: { in: candidateIds }, deleted: false, available: true },
          select: {
            id: true,
            name: true,
            slug: true,
            image: true,
            type: true,
            basePrice: true,
            originalPrice: true,
            currency: true,
            flashSaleEnabled: true,
            flashSalePrice: true,
            flashSaleStartsAt: true,
            flashSaleEndsAt: true,
            bundleStockLimit: true,
            brand: { select: { name: true } },
            category: { select: { name: true } },
            variants: {
              where: { active: true },
              select: { stock: true },
            },
          },
        })
      : Promise.resolve([]),
    prisma.brand.findMany({
      where: {
        deleted: false,
        name: { contains: intent.searchText, mode: "insensitive" },
        products: { some: { deleted: false, available: true } },
      },
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
      take: 4,
    }),
    prisma.category.findMany({
      where: {
        deleted: false,
        name: { contains: intent.searchText, mode: "insensitive" },
        products: { some: { deleted: false, available: true } },
      },
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
      take: 4,
    }),
    popularQuerySuggestions(intent.normalizedQuery),
  ]);

  const productById = new Map(products.map((product) => [product.id, product]));
  const matchedSkuById = new Map(ranked.map((row) => [row.id, row.matchedVariantSku]));
  const orderedProducts: SearchSuggestionProduct[] = ranked.flatMap((candidate) => {
    const product = productById.get(candidate.id);
    if (!product) return [];
    const pricing = resolveFlashSalePricing(product);
    const result = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      image: product.image,
      price: pricing.salePrice,
      originalPrice: pricing.active
        ? pricing.regularPrice
        : product.originalPrice === null
          ? null
          : Number(product.originalPrice),
      currency: product.currency,
      stock: productStock(product),
      brand: product.brand?.name ?? null,
      category: product.category.name,
      matchedVariantSku: matchedSkuById.get(product.id) ?? null,
    };
    if (intent.minPrice !== null && result.price < intent.minPrice) return [];
    if (intent.maxPrice !== null && result.price > intent.maxPrice) return [];
    return [result];
  });
  const limitedProducts = pinAndLimit(orderedProducts, config.pinProductIds, limit);
  const suggestedQueries = Array.from(
    new Set([...config.suggestedQueries, ...popularQueries]),
  )
    .filter((value) => value.toLocaleLowerCase("en-US") !== intent.normalizedQuery)
    .slice(0, 5);

  return {
    queryId,
    query: intent.originalQuery,
    normalizedQuery: intent.normalizedQuery,
    products: limitedProducts,
    brands,
    categories,
    suggestedQueries,
    total: orderedProducts.length,
    tookMs: Math.round(performance.now() - startedAt),
  };
}
