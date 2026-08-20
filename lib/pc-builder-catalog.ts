import type { PcBuilderProduct, PcBuilderSlotKey } from "./pc-builder";

export const PC_BUILDER_CATALOG_PAGE_SIZE = 12;
export const PC_BUILDER_CATALOG_MAX_PAGE_SIZE = 24;
export const PC_BUILDER_CATALOG_MAX_PAGE = 500;
export const PC_BUILDER_CATALOG_QUERY_MAX_LENGTH = 80;

export type PcBuilderCatalogPageResponse = {
  items: PcBuilderProduct[];
  page: number;
  nextPage: number | null;
  query: string;
  slot: PcBuilderSlotKey;
};

export function normalizePcBuilderCatalogQuery(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function parsePcBuilderCatalogPage(value: unknown, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > PC_BUILDER_CATALOG_MAX_PAGE) {
    return fallback;
  }
  return parsed;
}

export function parsePcBuilderCatalogPageSize(
  value: unknown,
  fallback = PC_BUILDER_CATALOG_PAGE_SIZE,
) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, PC_BUILDER_CATALOG_MAX_PAGE_SIZE);
}
