import "server-only";

import type { Prisma } from "@/generated/prisma";
import { resolveFlashSalePricing } from "@/lib/flash-sale";
import {
  PC_BUILDER_SLOTS,
  evaluatePcBuild,
  parsePcBuilderSelectionId,
  type PcBuildEvaluation,
  type PcBuilderCatalog,
  type PcBuilderProduct,
  type PcBuilderSelection,
  type PcBuilderSlotKey,
} from "@/lib/pc-builder";
import {
  PC_BUILDER_CATALOG_PAGE_SIZE,
  normalizePcBuilderCatalogQuery,
  serializePcBuilderCatalogCursor,
  type PcBuilderCatalogCursor,
  type PcBuilderCatalogPageResponse,
} from "@/lib/pc-builder-catalog";
import { prisma } from "@/lib/prisma";
import { computeVariantAvailableStock } from "@/lib/warehouse-stock";

export type PcBuilderCatalogResult = {
  catalog: PcBuilderCatalog;
  loadFailed: boolean;
};

export type PcBuilderLiveValidation = {
  selection: PcBuilderSelection;
  evaluation: PcBuildEvaluation;
  missingSlots: PcBuilderSlotKey[];
};

const pcBuilderProductSelect = {
  id: true,
  name: true,
  slug: true,
  sku: true,
  image: true,
  basePrice: true,
  originalPrice: true,
  currency: true,
  featured: true,
  soldCount: true,
  flashSaleEnabled: true,
  flashSalePrice: true,
  flashSaleStartsAt: true,
  flashSaleEndsAt: true,
  category: { select: { slug: true } },
  brand: { select: { name: true } },
  attributes: {
    orderBy: { id: "asc" },
    select: {
      id: true,
      value: true,
      attribute: { select: { name: true } },
    },
  },
  variants: {
    where: { active: true },
    orderBy: [{ isDefault: "desc" }, { stock: "desc" }, { id: "asc" }],
    select: {
      id: true,
      sku: true,
      price: true,
      stock: true,
      options: true,
      isDefault: true,
      stockLevels: {
        select: { quantity: true, reserved: true },
      },
    },
  },
} satisfies Prisma.ProductSelect;

type PcBuilderProductRow = Prisma.ProductGetPayload<{
  select: typeof pcBuilderProductSelect;
}>;
type PcBuilderVariantRow = PcBuilderProductRow["variants"][number];

function emptyCatalog(): PcBuilderCatalog {
  return PC_BUILDER_SLOTS.reduce((catalog, slot) => {
    catalog[slot.key] = [];
    return catalog;
  }, {} as PcBuilderCatalog);
}

function variantLabel(options: unknown, sku: string) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    return sku || null;
  }
  const values = Object.entries(options as Record<string, unknown>)
    .filter(([, value]) => typeof value === "string" && value.trim())
    .map(([name, value]) => `${name}: ${String(value)}`);
  return values.length ? values.join(", ") : sku || null;
}

function projectProduct(
  row: PcBuilderProductRow,
  variant: PcBuilderVariantRow,
): PcBuilderProduct | null {
  const sale = resolveFlashSalePricing(row, variant.price);
  if (!Number.isFinite(sale.salePrice) || sale.salePrice <= 0) return null;
  return {
    selectionId: `${row.id}-${variant.id}`,
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    image: row.image,
    price: sale.salePrice,
    originalPrice: sale.active
      ? sale.regularPrice
      : row.originalPrice === null
        ? null
        : Number(row.originalPrice),
    currency: /^[A-Z]{3}$/.test(row.currency) ? row.currency : "BDT",
    brand: row.brand?.name ?? null,
    categorySlug: row.category.slug,
    attributes: Object.fromEntries(
      row.attributes.map((item) => [item.attribute.name, item.value]),
    ),
    variantId: variant.id,
    variantSku: variant.sku,
    variantLabel: variantLabel(variant.options, variant.sku),
    stock: computeVariantAvailableStock(variant),
  };
}

function searchWhere(slot: PcBuilderSlotKey, query: string): Prisma.ProductWhereInput {
  const slotDefinition = PC_BUILDER_SLOTS.find((item) => item.key === slot);
  if (!slotDefinition) return { id: -1 };

  const normalizedQuery = normalizePcBuilderCatalogQuery(query);
  return {
    deleted: false,
    available: true,
    type: "PHYSICAL",
    category: { slug: slotDefinition.categorySlug, deleted: false },
    variants: { some: { active: true } },
    ...(normalizedQuery
      ? {
          OR: [
            { name: { contains: normalizedQuery, mode: "insensitive" } },
            { sku: { contains: normalizedQuery, mode: "insensitive" } },
            {
              brand: {
                is: { name: { contains: normalizedQuery, mode: "insensitive" } },
              },
            },
            {
              variants: {
                some: {
                  active: true,
                  sku: { contains: normalizedQuery, mode: "insensitive" },
                },
              },
            },
            {
              attributes: {
                some: {
                  OR: [
                    { value: { contains: normalizedQuery, mode: "insensitive" } },
                    {
                      attribute: {
                        name: { contains: normalizedQuery, mode: "insensitive" },
                      },
                    },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  };
}

function cursorWhere(cursor: PcBuilderCatalogCursor): Prisma.ProductWhereInput {
  const withinFeatured = {
    featured: cursor.featured,
    OR: [
      { soldCount: { lt: cursor.soldCount } },
      { soldCount: cursor.soldCount, id: { lt: cursor.id } },
    ],
  } satisfies Prisma.ProductWhereInput;

  if (!cursor.featured) return withinFeatured;
  return {
    OR: [withinFeatured, { featured: false }],
  };
}

export async function searchPcBuilderCatalogPage({
  slot,
  query = "",
  cursor = null,
  pageSize = PC_BUILDER_CATALOG_PAGE_SIZE,
}: {
  slot: PcBuilderSlotKey;
  query?: string;
  cursor?: PcBuilderCatalogCursor | null;
  pageSize?: number;
}): Promise<PcBuilderCatalogPageResponse> {
  const normalizedQuery = normalizePcBuilderCatalogQuery(query);
  const baseWhere = searchWhere(slot, normalizedQuery);
  const rows = await prisma.product.findMany({
    where: cursor ? { AND: [baseWhere, cursorWhere(cursor)] } : baseWhere,
    orderBy: [
      { featured: "desc" },
      { soldCount: "desc" },
      { id: "desc" },
    ],
    take: pageSize + 1,
    select: pcBuilderProductSelect,
  });

  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  const items = pageRows.flatMap((row) =>
    row.variants.flatMap((variant) => {
      const product = projectProduct(row, variant);
      return product ? [product] : [];
    }),
  );
  const lastRow = hasMore ? pageRows.at(-1) : null;

  return {
    items,
    nextCursor: lastRow
      ? serializePcBuilderCatalogCursor({
          featured: lastRow.featured,
          soldCount: lastRow.soldCount,
          id: lastRow.id,
        })
      : null,
    query: normalizedQuery,
    slot,
  };
}

async function readPcBuilderCatalog(): Promise<PcBuilderCatalog> {
  const firstPages = await Promise.all(
    PC_BUILDER_SLOTS.map((slot) =>
      searchPcBuilderCatalogPage({
        slot: slot.key,
        pageSize: PC_BUILDER_CATALOG_PAGE_SIZE,
      }),
    ),
  );

  const catalog = emptyCatalog();
  for (const page of firstPages) catalog[page.slot] = page.items;
  return catalog;
}

export async function validatePcBuilderSelectionLive(
  ids: Partial<Record<PcBuilderSlotKey, string>>,
): Promise<PcBuilderLiveValidation> {
  const requested = PC_BUILDER_SLOTS.flatMap((slot) => {
    const parsed = parsePcBuilderSelectionId(ids[slot.key]);
    return parsed ? [{ slot: slot.key, ...parsed }] : [];
  });
  const productIds = [...new Set(requested.map((item) => item.productId))];
  const rows = productIds.length
    ? await prisma.product.findMany({
        where: {
          id: { in: productIds },
          deleted: false,
          available: true,
          type: "PHYSICAL",
          category: { deleted: false },
        },
        select: pcBuilderProductSelect,
      })
    : [];

  const selection: PcBuilderSelection = {};
  const missingSlots: PcBuilderSlotKey[] = [];
  for (const requestedItem of requested) {
    const slotDefinition = PC_BUILDER_SLOTS.find(
      (slot) => slot.key === requestedItem.slot,
    );
    const row = rows.find(
      (item) =>
        item.id === requestedItem.productId &&
        item.category.slug === slotDefinition?.categorySlug,
    );
    const variant = row?.variants.find(
      (item) => item.id === requestedItem.variantId,
    );
    const product = row && variant ? projectProduct(row, variant) : null;
    if (!product) {
      missingSlots.push(requestedItem.slot);
      continue;
    }
    selection[requestedItem.slot] = product;
  }

  return {
    selection,
    evaluation: evaluatePcBuild(selection),
    missingSlots,
  };
}

export type PcBuilderExtraItemsResolution = {
  items: Partial<Record<PcBuilderSlotKey, PcBuilderProduct[]>>;
  missingCount: number;
};

// Multi-add "extra" line items are additive to cart/total and are not subject
// to the single-slot compatibility engine, so this only checks that each
// requested product still exists, is published and has an active variant —
// it never runs evaluatePcBuild.
export async function resolvePcBuilderExtraItems(
  ids: Partial<Record<PcBuilderSlotKey, string[]>>,
): Promise<PcBuilderExtraItemsResolution> {
  const requested = PC_BUILDER_SLOTS.flatMap((slot) =>
    (ids[slot.key] ?? []).flatMap((rawId) => {
      const parsed = parsePcBuilderSelectionId(rawId);
      return parsed ? [{ slot: slot.key, ...parsed }] : [];
    }),
  );
  const productIds = [...new Set(requested.map((item) => item.productId))];
  const rows = productIds.length
    ? await prisma.product.findMany({
        where: {
          id: { in: productIds },
          deleted: false,
          available: true,
          type: "PHYSICAL",
          category: { deleted: false },
        },
        select: pcBuilderProductSelect,
      })
    : [];

  const items: Partial<Record<PcBuilderSlotKey, PcBuilderProduct[]>> = {};
  let missingCount = 0;
  for (const requestedItem of requested) {
    const slotDefinition = PC_BUILDER_SLOTS.find(
      (slot) => slot.key === requestedItem.slot,
    );
    const row = rows.find(
      (item) =>
        item.id === requestedItem.productId &&
        item.category.slug === slotDefinition?.categorySlug,
    );
    const variant = row?.variants.find(
      (item) => item.id === requestedItem.variantId,
    );
    const product = row && variant ? projectProduct(row, variant) : null;
    if (!product) {
      missingCount += 1;
      continue;
    }
    items[requestedItem.slot] = [...(items[requestedItem.slot] ?? []), product];
  }

  return { items, missingCount };
}

export async function getPcBuilderCatalog(): Promise<PcBuilderCatalogResult> {
  try {
    return { catalog: await readPcBuilderCatalog(), loadFailed: false };
  } catch (error) {
    console.error("PC Builder catalog loading failed", error);
    return { catalog: emptyCatalog(), loadFailed: true };
  }
}

export type PcBuilderStoreBranding = {
  name: string;
  logo: string | null;
  phone: string | null;
  email: string | null;
  website: string;
};

const FALLBACK_BRANDING: PcBuilderStoreBranding = {
  name: "PC Builder",
  logo: null,
  phone: null,
  email: null,
  website: "",
};

export async function getPcBuilderStoreBranding(): Promise<PcBuilderStoreBranding> {
  try {
    const settings = await prisma.sitesettings.findFirst({
      orderBy: { id: "asc" },
      select: {
        logo: true,
        siteTitle: true,
        contactNumber: true,
        contactEmail: true,
      },
    });
    if (!settings) return FALLBACK_BRANDING;
    return {
      name: settings.siteTitle?.trim() || FALLBACK_BRANDING.name,
      logo: settings.logo?.trim() || null,
      phone: settings.contactNumber?.trim() || null,
      email: settings.contactEmail?.trim() || null,
      website: FALLBACK_BRANDING.website,
    };
  } catch (error) {
    console.error("PC Builder store branding loading failed", error);
    return FALLBACK_BRANDING;
  }
}
