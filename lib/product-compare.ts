export const PRODUCT_COMPARE_STORAGE_KEY = "storefrontCompareProductIds";
export const PRODUCT_COMPARE_LIMIT = 4;

export function normalizeCompareProductIds(values: unknown, limit = PRODUCT_COMPARE_LIMIT) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map(Number)
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  ).slice(0, limit);
}

export function toggleCompareProductId(ids: number[], productId: number) {
  const normalized = normalizeCompareProductIds(ids);
  if (!Number.isInteger(productId) || productId < 1) {
    return { ids: normalized, added: false, limitReached: false };
  }
  if (normalized.includes(productId)) {
    return {
      ids: normalized.filter((id) => id !== productId),
      added: false,
      limitReached: false,
    };
  }
  if (normalized.length >= PRODUCT_COMPARE_LIMIT) {
    return { ids: normalized, added: false, limitReached: true };
  }
  return { ids: [...normalized, productId], added: true, limitReached: false };
}

export function productCompareHref(ids: number[]) {
  const normalized = normalizeCompareProductIds(ids);
  return normalized.length
    ? `/ecommerce/compare?ids=${normalized.join(",")}`
    : "/ecommerce/compare";
}
