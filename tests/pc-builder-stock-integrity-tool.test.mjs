import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("StockLevel integrity tool is dry-run by default and requires explicit write confirmation", async () => {
  const source = await read("../scripts/stock-level-integrity.mjs");

  assert.match(source, /flags\.has\("--apply"\)/);
  assert.match(source, /BACKFILL_STOCK_LEVELS/);
  assert.match(source, /Refusing write/);
  assert.match(source, /if \(!args\.apply\)/);
  assert.match(source, /process\.exitCode = 2/);
});

test("StockLevel integrity tool audits blocking data-integrity conditions", async () => {
  const source = await read("../scripts/stock-level-integrity.mjs");

  assert.match(source, /INVALID_STOCK_LEVEL_ROWS/);
  assert.match(source, /NEGATIVE_LEGACY_STOCK/);
  assert.match(source, /NON_PHYSICAL_STOCK_LEVEL_ROWS/);
  assert.match(source, /NO_DEFAULT_WAREHOUSE/);
  assert.match(source, /MULTIPLE_DEFAULT_WAREHOUSES/);
  assert.match(source, /sl\."reserved" > sl\."quantity"/);
  assert.match(source, /aggregateMismatchCount/);
});

test("backfill inserts only missing physical StockLevel rows and never overwrites existing rows", async () => {
  const source = await read("../scripts/stock-level-integrity.mjs");

  assert.match(source, /p\."type" = 'PHYSICAL'/);
  assert.match(source, /NOT EXISTS \(\s*SELECT 1 FROM "StockLevel" sl/);
  assert.match(source, /ON CONFLICT \("warehouseId", "productVariantId"\) DO NOTHING/);
  assert.doesNotMatch(source, /ON CONFLICT[\s\S]*DO UPDATE SET "quantity"/);
});

test("post-backfill reconciliation derives ProductVariant.stock from warehouse availability", async () => {
  const source = await read("../scripts/stock-level-integrity.mjs");

  assert.match(source, /SUM\(GREATEST\(sl\."quantity" - sl\."reserved", 0\)\)/);
  assert.match(source, /SET "stock" = totals\.available/);
  assert.match(source, /post-apply audit/);
  assert.match(source, /readyForStrictWarehouseStock/);
});
