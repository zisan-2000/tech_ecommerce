import "server-only";

import { unstable_cache } from "next/cache";
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
import { prisma } from "@/lib/prisma";

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
    stock: Math.max(0, variant.stock),
  };
}

const readPcBuilderCatalog = unstable_cache(
  async (): Promise<PcBuilderCatalog> => {
    const slotRows = await Promise.all(
      PC_BUILDER_SLOTS.map((slot) =>
        prisma.product.findMany({
          where: {
            deleted: false,
            available: true,
            type: "PHYSICAL",
            category: { slug: slot.categorySlug, deleted: false },
          },
          orderBy: [
            { featured: "desc" },
            { soldCount: "desc" },
            { id: "desc" },
          ],
          take: 40,
          select: pcBuilderProductSelect,
        }),
      ),
    );

    const catalog = emptyCatalog();
    for (const [slotIndex, rows] of slotRows.entries()) {
      const slot = PC_BUILDER_SLOTS[slotIndex].key;
      for (const row of rows) {
        for (const variant of row.variants) {
          if (catalog[slot].length >= 40) break;
          const product = projectProduct(row, variant);
          if (product) catalog[slot].push(product);
        }
        if (catalog[slot].length >= 40) break;
      }
    }
    return catalog;
  },
  ["storefront-pc-builder-v3"],
  { revalidate: 60, tags: ["products", "pc-builder"] },
);

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

export async function getPcBuilderCatalog(): Promise<PcBuilderCatalogResult> {
  try {
    return { catalog: await readPcBuilderCatalog(), loadFailed: false };
  } catch (error) {
    console.error("PC Builder catalog loading failed", error);
    return { catalog: emptyCatalog(), loadFailed: true };
  }
}
