import { PC_BUILDER_SLOTS, type PcBuilderSlotKey } from "./pc-builder-core";

export const PC_BUILD_ID_PREFIX = "pcb_";

const PC_BUILD_ID_PATTERN =
  /^pcb_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLOT_KEYS = new Set<string>(PC_BUILDER_SLOTS.map((slot) => slot.key));

export function createPcBuildId(
  randomUUID: () => string = () => globalThis.crypto.randomUUID(),
) {
  const id = `${PC_BUILD_ID_PREFIX}${randomUUID()}`;
  if (!isPcBuildId(id)) throw new Error("PC build ID generation failed.");
  return id;
}

export function isPcBuildId(value: unknown): value is string {
  return typeof value === "string" && PC_BUILD_ID_PATTERN.test(value.trim());
}

export function normalizePcBuildId(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return isPcBuildId(normalized) ? normalized : null;
}

export function normalizePcBuildSlot(value: unknown): PcBuilderSlotKey | null {
  const slot = typeof value === "string" ? value.trim() : "";
  return SLOT_KEYS.has(slot) ? (slot as PcBuilderSlotKey) : null;
}

export function pcBuildSelectionId(input: {
  productId: string | number;
  variantId?: string | number | null;
}) {
  const productId = Number(input.productId);
  const variantId = Number(input.variantId);
  if (
    !Number.isInteger(productId) ||
    productId < 1 ||
    !Number.isInteger(variantId) ||
    variantId < 1
  ) {
    return null;
  }
  return `${productId}-${variantId}`;
}
