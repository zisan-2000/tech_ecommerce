import {
  PC_BUILDER_SLOTS,
  parsePcBuilderSelectionId,
  type PcBuilderSlotKey,
} from "./pc-builder";

export const PC_BUILDER_CHECKOUT_COOKIE = "pc_builder_checkout_v1";
export const PC_BUILDER_CHECKOUT_COOKIE_MAX_AGE = 2 * 60 * 60;

export type PcBuilderCheckoutManifest = {
  version: 1;
  selections: Partial<Record<PcBuilderSlotKey, string>>;
};

export type PcBuilderCheckoutItemIdentity = {
  productId: string | number;
  variantId?: string | number | null;
  quantity?: number;
};

const VALID_SLOT_KEYS = new Set<PcBuilderSlotKey>(
  PC_BUILDER_SLOTS.map((slot) => slot.key),
);

function orderItemSelectionId(item: PcBuilderCheckoutItemIdentity) {
  const productId = Number(item.productId);
  const variantId = Number(item.variantId);
  const quantity = Number(item.quantity ?? 1);
  if (
    !Number.isInteger(productId) ||
    productId < 1 ||
    !Number.isInteger(variantId) ||
    variantId < 1 ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    return null;
  }
  return `${productId}-${variantId}`;
}

export function parsePcBuilderCheckoutManifest(
  input: unknown,
): PcBuilderCheckoutManifest | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  if (record.version !== 1) return null;

  const rawSelections = record.selections;
  if (
    !rawSelections ||
    typeof rawSelections !== "object" ||
    Array.isArray(rawSelections)
  ) {
    return null;
  }

  const entries = Object.entries(rawSelections as Record<string, unknown>);
  if (entries.length < 1 || entries.length > PC_BUILDER_SLOTS.length) return null;

  const selections: Partial<Record<PcBuilderSlotKey, string>> = {};
  for (const [rawSlot, rawSelectionId] of entries) {
    const slot = rawSlot as PcBuilderSlotKey;
    const selectionId = String(rawSelectionId ?? "").trim();
    if (!VALID_SLOT_KEYS.has(slot) || !parsePcBuilderSelectionId(selectionId)) {
      return null;
    }
    selections[slot] = selectionId;
  }

  return { version: 1, selections };
}

export function createPcBuilderCheckoutManifest(
  selections: Partial<Record<PcBuilderSlotKey, string>>,
) {
  const manifest = parsePcBuilderCheckoutManifest({ version: 1, selections });
  if (!manifest) {
    throw new Error("PC Builder checkout manifest could not be created safely.");
  }
  return manifest;
}

export function serializePcBuilderCheckoutManifest(
  manifest: PcBuilderCheckoutManifest,
) {
  return Buffer.from(JSON.stringify(manifest), "utf8").toString("base64url");
}

export function parsePcBuilderCheckoutCookie(
  value: string | null | undefined,
): PcBuilderCheckoutManifest | null {
  if (!value || value.length > 2048) return null;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    return parsePcBuilderCheckoutManifest(JSON.parse(decoded));
  } catch {
    return null;
  }
}

export function pcBuilderCheckoutManifestTouchesItems(
  manifest: PcBuilderCheckoutManifest,
  items: PcBuilderCheckoutItemIdentity[],
) {
  const cartSelectionIds = new Set(
    items.flatMap((item) => {
      const id = orderItemSelectionId(item);
      return id ? [id] : [];
    }),
  );
  return Object.values(manifest.selections).some((id) =>
    id ? cartSelectionIds.has(id) : false,
  );
}

export function validatePcBuilderCheckoutManifestItems(
  manifest: PcBuilderCheckoutManifest,
  items: PcBuilderCheckoutItemIdentity[],
) {
  const cartSelectionIds = new Set(
    items.flatMap((item) => {
      const id = orderItemSelectionId(item);
      return id ? [id] : [];
    }),
  );
  const missingSlots = PC_BUILDER_SLOTS.flatMap((slot) => {
    const selectionId = manifest.selections[slot.key];
    return selectionId && !cartSelectionIds.has(selectionId) ? [slot.key] : [];
  });

  return {
    ok: missingSlots.length === 0,
    missingSlots,
  };
}
