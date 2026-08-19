import "server-only";

import { unstable_cache } from "next/cache";
import { resolveFlashSalePricing } from "@/lib/flash-sale";
import {
  PC_BUILDER_SLOTS,
  type PcBuilderCatalog,
  type PcBuilderProduct,
  type PcBuilderSlotKey,
} from "@/lib/pc-builder";
import { prisma } from "@/lib/prisma";

export type PcBuilderCatalogResult = {
  catalog: PcBuilderCatalog;
  loadFailed: boolean;
};

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

const readPcBuilderCatalog = unstable_cache(
  async (): Promise<PcBuilderCatalog> => {
    const categorySlugs = PC_BUILDER_SLOTS.map((slot) => slot.categorySlug);
    const rows = await prisma.product.findMany({
      where: {
        deleted: false,
        available: true,
        type: "PHYSICAL",
        category: { slug: { in: categorySlugs }, deleted: false },
      },
      orderBy: [{ featured: "desc" }, { soldCount: "desc" }, { id: "desc" }],
      take: 240,
      select: {
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
      },
    });

    const catalog = emptyCatalog();
    const slotByCategory = new Map<string, PcBuilderSlotKey>(
      PC_BUILDER_SLOTS.map((slot) => [slot.categorySlug, slot.key]),
    );

    for (const row of rows) {
      const slot = slotByCategory.get(row.category.slug) as
        | PcBuilderSlotKey
        | undefined;
      if (!slot || row.variants.length === 0) continue;

      const attributes = Object.fromEntries(
        row.attributes.map((item) => [item.attribute.name, item.value]),
      );
      for (const variant of row.variants) {
        if (catalog[slot].length >= 40) break;
        const sale = resolveFlashSalePricing(row, variant.price);
        const product: PcBuilderProduct = {
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
          attributes,
          variantId: variant.id,
          variantSku: variant.sku,
          variantLabel: variantLabel(variant.options, variant.sku),
          stock: Math.max(0, variant.stock),
        };
        catalog[slot].push(product);
      }
    }

    return catalog;
  },
  ["storefront-pc-builder-v1"],
  { revalidate: 60, tags: ["products", "pc-builder"] },
);

export async function getPcBuilderCatalog(): Promise<PcBuilderCatalogResult> {
  try {
    return { catalog: await readPcBuilderCatalog(), loadFailed: false };
  } catch (error) {
    console.error("PC Builder catalog loading failed", error);
    return { catalog: emptyCatalog(), loadFailed: true };
  }
}
