import type { PcBuilderProduct, PcBuilderSlotKey } from "./pc-builder";

export const PC_BUILDER_CATALOG_PAGE_SIZE = 12;
export const PC_BUILDER_CATALOG_MAX_PAGE_SIZE = 24;
export const PC_BUILDER_CATALOG_QUERY_MAX_LENGTH = 80;
export const PC_BUILDER_CATALOG_CURSOR_MAX_LENGTH = 80;

const PC_BUILDER_CATALOG_CURSOR_VERSION = "pc1";

export type PcBuilderCatalogCursor = {
  featured: boolean;
  soldCount: number;
  id: number;
};

export type PcBuilderCatalogPageResponse = {
  items: PcBuilderProduct[];
  nextCursor: string | null;
  query: string;
  slot: PcBuilderSlotKey;
};

export function normalizePcBuilderCatalogQuery(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function parsePcBuilderCatalogPageSize(
  value: unknown,
  fallback = PC_BUILDER_CATALOG_PAGE_SIZE,
) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, PC_BUILDER_CATALOG_MAX_PAGE_SIZE);
}

export function serializePcBuilderCatalogCursor(cursor: PcBuilderCatalogCursor) {
  const soldCount = Number(cursor.soldCount);
  const id = Number(cursor.id);
  if (
    !Number.isSafeInteger(soldCount) ||
    !Number.isSafeInteger(id) ||
    id < 1
  ) {
    throw new Error("Invalid PC Builder catalog cursor values");
  }
  return `${PC_BUILDER_CATALOG_CURSOR_VERSION}.${cursor.featured ? 1 : 0}.${soldCount}.${id}`;
}

export function parsePcBuilderCatalogCursor(
  value: unknown,
): PcBuilderCatalogCursor | null {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > PC_BUILDER_CATALOG_CURSOR_MAX_LENGTH) return null;

  const match = raw.match(/^pc1\.([01])\.(-?\d+)\.([1-9]\d*)$/);
  if (!match) return null;

  const soldCount = Number(match[2]);
  const id = Number(match[3]);
  if (!Number.isSafeInteger(soldCount) || !Number.isSafeInteger(id)) return null;

  return {
    featured: match[1] === "1",
    soldCount,
    id,
  };
}
