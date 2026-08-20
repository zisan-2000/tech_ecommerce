import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  PC_BUILDER_CATALOG_MAX_PAGE_SIZE,
  normalizePcBuilderCatalogQuery,
  parsePcBuilderCatalogCursor,
  parsePcBuilderCatalogPageSize,
  serializePcBuilderCatalogCursor,
} from "../lib/pc-builder-catalog.ts";

test("catalog query normalization is stable", () => {
  assert.equal(normalizePcBuilderCatalogQuery("  Ryzen   7  "), "Ryzen 7");
});

test("catalog cursor round-trips the deterministic sort tuple", () => {
  const encoded = serializePcBuilderCatalogCursor({
    featured: true,
    soldCount: 42,
    id: 123,
  });
  assert.deepEqual(parsePcBuilderCatalogCursor(encoded), {
    featured: true,
    soldCount: 42,
    id: 123,
  });
  assert.equal(parsePcBuilderCatalogCursor("bad.cursor"), null);
  assert.equal(parsePcBuilderCatalogCursor("pc1.2.42.123"), null);
});

test("catalog page size is bounded", () => {
  assert.equal(parsePcBuilderCatalogPageSize("8"), 8);
  assert.equal(
    parsePcBuilderCatalogPageSize("999"),
    PC_BUILDER_CATALOG_MAX_PAGE_SIZE,
  );
});

test("storefront catalog uses stable cursor pagination instead of deep offsets", async () => {
  const source = await readFile(
    new URL("../lib/storefront-pc-builder.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /take:\s*40/);
  assert.match(source, /searchPcBuilderCatalogPage/);
  assert.match(source, /cursorWhere/);
  assert.match(source, /serializePcBuilderCatalogCursor/);
  assert.doesNotMatch(source, /skip:\s*\(page - 1\) \* pageSize/);
});

test("public catalog route validates cursors and rate limits search traffic", async () => {
  const source = await readFile(
    new URL("../app/api/pc-builder/catalog/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /rateLimitRequest/);
  assert.match(source, /pc-builder-catalog-search/);
  assert.match(source, /status: 429/);
  assert.match(source, /Retry-After/);
  assert.match(source, /parsePcBuilderCatalogCursor/);
  assert.match(source, /Catalog cursor is invalid/);
});

test("picker carries an opaque cursor for load-more requests", async () => {
  const [client, hook] = await Promise.all([
    readFile(
      new URL("../components/ecommarce/pc-builder/PcBuilderClient.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../components/ecommarce/pc-builder/usePcBuilderCatalogSearch.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(client, /usePcBuilderCatalogSearch/);
  assert.match(client, /pickerNextCursor/);
  assert.match(client, /Load more/);
  assert.match(hook, /\/api\/pc-builder\/catalog/);
  assert.match(hook, /params\.set\("cursor", cursor\)/);
  assert.match(hook, /payload\.nextCursor/);
  assert.match(hook, /cache: "no-store"/);
  assert.match(hook, /AbortController/);
  assert.doesNotMatch(hook, /page:\s*String\(page\)/);
});

test("catalog search migration adds trigram and deterministic sort indexes", async () => {
  const migration = await readFile(
    new URL(
      "../prisma/migrations/20260820_harden_pc_builder_catalog_search/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /CREATE EXTENSION IF NOT EXISTS pg_trgm/);
  assert.match(migration, /gin_trgm_ops/);
  assert.match(migration, /PcBuilder_Product_name_trgm_idx/);
  assert.match(migration, /PcBuilder_ProductVariant_sku_trgm_idx/);
  assert.match(migration, /PcBuilder_ProductAttribute_value_trgm_idx/);
  assert.match(migration, /PcBuilder_Attribute_name_trgm_idx/);
  assert.match(migration, /PcBuilder_Product_catalog_sort_idx/);
  assert.match(
    migration,
    /"categoryId", "featured" DESC, "soldCount" DESC, "id" DESC/,
  );
});
