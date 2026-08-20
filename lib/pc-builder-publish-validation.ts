import {
  PC_BUILDER_SLOTS,
  validatePcBuilderProductReadiness,
  type PcBuildIssue,
  type PcBuilderProduct,
  type PcBuilderSlotKey,
} from "./pc-builder-core";

type ProductAttributeRow = {
  value: string;
  attribute: {
    name: string;
  };
};

export type PcBuilderPublishProduct = {
  id: number;
  name: string;
  category: {
    slug: string;
  } | null;
  attributes: readonly ProductAttributeRow[];
};

export type PcBuilderActivationValidation = {
  applies: boolean;
  ok: boolean;
  slot: PcBuilderSlotKey | null;
  issues: PcBuildIssue[];
};

const SLOT_BY_CATEGORY_SLUG = new Map<string, PcBuilderSlotKey>(
  PC_BUILDER_SLOTS.map((slot) => [slot.categorySlug, slot.key]),
);

export function getPcBuilderSlotForCategory(
  categorySlug: string | null | undefined,
): PcBuilderSlotKey | null {
  if (!categorySlug) return null;
  return SLOT_BY_CATEGORY_SLUG.get(categorySlug.trim().toLowerCase()) ?? null;
}

function toAttributeRecord(rows: readonly ProductAttributeRow[]) {
  return Object.fromEntries(
    rows.flatMap((row) => {
      const name = String(row.attribute?.name ?? "").trim();
      const value = String(row.value ?? "").trim();
      return name ? [[name, value] as const] : [];
    }),
  );
}

function toPcBuilderProduct(
  product: PcBuilderPublishProduct,
  slot: PcBuilderSlotKey,
): PcBuilderProduct {
  return {
    selectionId: `${product.id}-1`,
    id: product.id,
    name: product.name,
    slug: "",
    sku: null,
    image: null,
    price: 0,
    originalPrice: null,
    currency: "BDT",
    brand: null,
    categorySlug:
      PC_BUILDER_SLOTS.find((candidate) => candidate.key === slot)?.categorySlug ??
      product.category?.slug ??
      "",
    attributes: toAttributeRecord(product.attributes),
    variantId: 1,
    variantSku: "publish-validation",
    variantLabel: null,
    stock: 1,
  };
}

export function validatePcBuilderProductForActivation(
  product: PcBuilderPublishProduct,
): PcBuilderActivationValidation {
  const slot = getPcBuilderSlotForCategory(product.category?.slug);
  if (!slot) {
    return {
      applies: false,
      ok: true,
      slot: null,
      issues: [],
    };
  }

  const issues = validatePcBuilderProductReadiness(
    slot,
    toPcBuilderProduct(product, slot),
  );

  return {
    applies: true,
    ok: issues.length === 0,
    slot,
    issues,
  };
}
