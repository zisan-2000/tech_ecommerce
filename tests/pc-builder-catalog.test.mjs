import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  PC_BUILDER_CATALOG_MAX_PAGE_SIZE,
  normalizePcBuilderCatalogQuery,
  parsePcBuilderCatalogPage,
  parsePcBuilderCatalogPageSize,
} from "../lib/pc-builder-catalog.ts";

test("catalog query normalization is stable", () => {
  assert.equal(normalizePcBuilderCatalogQuery("  Ryzen   7  "), "Ryzen 7");
});

test("catalog pagination rejects invalid page values", () => {
  assert.equal(parsePcBuilderCatalogPage("2"), 2);
  assert.equal(parsePcBuilderCatalogPage("0"), 1);
  assert.equal(parsePcBuilderCatalogPage("abc"), 1);
});

test("catalog page size is bounded", () => {
  assert.equal(parsePcBuilderCatalogPageSize("8"), 8);
  assert.equal(parsePcBuilderCatalogPageSize("999"), PC_BUILDER_CATALOG_MAX_PAGE_SIZE);
});

test("storefront catalog no longer uses a global forty-item cap", async () => {
  const source = await readFile(new URL("../lib/storefront-pc-builder.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /take:\s*40/);
  assert.match(source, /searchPcBuilderCatalogPage/);
  assert.match(source, /skip:\s*\(page - 1\) \* pageSize/);
});

test("picker uses paginated server-side catalog search", async () => {
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
  assert.match(client, /pickerNextPage/);
  assert.match(client, /Load more/);
  assert.match(hook, /\/api\/pc-builder\/catalog/);
  assert.match(hook, /cache: "no-store"/);
  assert.match(hook, /AbortController/);
});
