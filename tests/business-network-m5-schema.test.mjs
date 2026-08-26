import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("M5 adds the frozen Sales RFQ models without modifying supplier procurement Rfq", async () => {
  const [schema, migration] = await Promise.all([
    read("../prisma/schema.prisma"),
    read("../prisma/migrations/20260826_m5_sales_rfq/migration.sql"),
  ]);
  assert.match(schema, /enum SalesRfqStatus\s*\{/);
  for (const model of ["SalesRfq", "SalesRfqItem", "SalesRfqAttachment"]) {
    assert.match(schema, new RegExp(`model ${model}\\s*\\{`));
    assert.match(migration, new RegExp(`CREATE TABLE "${model}"`));
  }
  assert.match(schema, /model Rfq\s*\{/);
  assert.doesNotMatch(migration, /ALTER TABLE "Rfq"/);
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|INDEX|TYPE)/i);
});

test("M5 migration enforces lifecycle, item, date, relation, and human-number constraints", async () => {
  const migration = await read("../prisma/migrations/20260826_m5_sales_rfq/migration.sql");
  assert.match(migration, /CREATE SEQUENCE "SalesRfqNumber_seq"/);
  assert.match(migration, /SalesRfq_lifecycle_timestamps_check/);
  assert.match(migration, /SalesRfq_date_order_check/);
  assert.match(migration, /SalesRfqItem_quantity_check/);
  assert.match(migration, /SalesRfqItem_target_price_check/);
  assert.match(migration, /SalesRfqItem_variant_product_check/);
  assert.match(migration, /SalesRfq_requestedByMemberId_fkey/);
  assert.match(migration, /ON DELETE RESTRICT/);
  assert.match(migration, /ON DELETE CASCADE/);
});

test("M5 registers exact permissions and frozen portal/admin API routes", async () => {
  const rbac = await read("../lib/rbac-config.ts");
  for (const key of ["business.rfq.view", "business.rfq.manage", "business.rfq.assign"]) {
    assert.match(rbac, new RegExp(key.replaceAll(".", "\\.")));
  }
  const routes = [
    ["../app/api/business/rfqs/route.ts", /export async function GET[\s\S]*export async function POST/],
    ["../app/api/business/rfqs/[id]/route.ts", /export async function GET[\s\S]*export async function PATCH/],
    ["../app/api/business/rfqs/[id]/submit/route.ts", /export async function POST/],
    ["../app/api/business/rfqs/[id]/cancel/route.ts", /export async function POST/],
    ["../app/api/business/rfqs/[id]/attachments/route.ts", /export async function POST/],
    ["../app/api/business/rfqs/[id]/attachments/[attachmentId]/route.ts", /export async function DELETE/],
    ["../app/api/admin/business-network/rfqs/route.ts", /export async function GET/],
    ["../app/api/admin/business-network/rfqs/[id]/route.ts", /export async function GET/],
    ["../app/api/admin/business-network/rfqs/[id]/assign/route.ts", /export async function POST/],
    ["../app/api/admin/business-network/rfqs/[id]/close/route.ts", /export async function POST/],
    ["../app/api/admin/business-network/rfqs/[id]/reject/route.ts", /export async function POST/],
  ];
  for (const [path, contract] of routes) {
    const source = await read(path);
    assert.match(source, contract);
    assert.match(source, /businessApiErrorResponse/);
    assert.doesNotMatch(source, /\b(?:db|prisma)\.[a-z]/);
  }
});

test("M5 service is tenant-scoped, transactional, audited, and snapshots catalog data", async () => {
  const source = await read("../lib/business-network/sales-rfq.ts");
  assert.match(source, /where: \{ id, organizationId \}/);
  assert.match(source, /runSerializableTransaction\(async \(tx\) =>/);
  assert.match(source, /writeBusinessAudit\(\{/);
  assert.match(source, /snapshotSalesRfqItems/);
  assert.match(source, /product\.findMany/);
  assert.match(source, /productVariant\.findMany/);
  assert.match(source, /nextval\('\"SalesRfqNumber_seq\"'\)/);
  assert.match(source, /RFQ_ITEMS_REQUIRED/);
  assert.match(source, /DUPLICATE_RFQ_ITEM/);
});
