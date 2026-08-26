import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("M6 adds versioned sales quotation models without altering procurement quotations", async () => {
  const [schema, migration] = await Promise.all([
    read("../prisma/schema.prisma"),
    read("../prisma/migrations/20260826_m6_sales_quotation/migration.sql"),
  ]);
  for (const enumName of ["SalesQuotationStatus", "SalesQuotationVersionStatus"]) {
    assert.match(schema, new RegExp(`enum ${enumName}\\s*\\{`));
  }
  for (const model of ["SalesQuotation", "SalesQuotationVersion", "SalesQuotationItem"]) {
    assert.match(schema, new RegExp(`model ${model}\\s*\\{`));
    assert.match(migration, new RegExp(`CREATE TABLE "${model}"`));
  }
  assert.match(schema, /model SupplierQuotation\s*\{/);
  assert.doesNotMatch(migration, /ALTER TABLE "SupplierQuotation"/);
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|INDEX|TYPE)/i);
});

test("M6 migration enforces totals, lifecycle, one-current-version, and issued immutability", async () => {
  const migration = await read("../prisma/migrations/20260826_m6_sales_quotation/migration.sql");
  for (const contract of [
    /CREATE SEQUENCE "SalesQuotationNumber_seq"/,
    /SalesQuotation_lifecycle_check/,
    /SalesQuotationVersion_totals_check/,
    /SalesQuotationVersion_lifecycle_check/,
    /SalesQuotationItem_amounts_check/,
    /SalesQuotationVersion_one_current_idx[\s\S]*WHERE "isCurrent" = true/,
    /SalesQuotationVersion_issued_immutable/,
    /SalesQuotationItem_issued_immutable/,
  ]) assert.match(migration, contract);
});

test("M6 registers exact internal permissions and frozen portal/admin API routes", async () => {
  const rbac = await read("../lib/rbac-config.ts");
  const permissions = [
    "business.quotation.view",
    "business.quotation.create",
    "business.quotation.update",
    "business.quotation.approve",
    "business.quotation.send",
  ];
  for (const key of permissions) assert.match(rbac, new RegExp(key.replaceAll(".", "\\.")));
  const routes = [
    "../app/api/business/quotations/route.ts",
    "../app/api/business/quotations/[id]/route.ts",
    "../app/api/business/quotations/[id]/view/route.ts",
    "../app/api/business/quotations/[id]/accept/route.ts",
    "../app/api/business/quotations/[id]/reject/route.ts",
    "../app/api/admin/business-network/quotations/route.ts",
    "../app/api/admin/business-network/quotations/[id]/route.ts",
    "../app/api/admin/business-network/quotations/[id]/versions/route.ts",
    "../app/api/admin/business-network/quotations/[id]/submit-review/route.ts",
    "../app/api/admin/business-network/quotations/[id]/approve/route.ts",
    "../app/api/admin/business-network/quotations/[id]/send/route.ts",
    "../app/api/admin/business-network/quotations/[id]/cancel/route.ts",
  ];
  for (const path of routes) {
    const source = await read(path);
    assert.match(source, /export async function (?:GET|POST)/);
    assert.match(source, /businessApiErrorResponse/);
    assert.doesNotMatch(source, /\b(?:db|prisma)\.[a-z]/);
  }
});

test("M6 service is tenant-scoped, transactional, snapshots pricing, and links RFQ on send", async () => {
  const source = await read("../lib/business-network/sales-quotation.ts");
  assert.match(source, /where: \{ id, \.\.\.\(organizationId \? \{ organizationId \} : \{\}\) \}/);
  assert.match(source, /runSerializableTransaction\(async \(tx\) =>/);
  assert.match(source, /snapshotQuotationItems/);
  assert.match(source, /QUOTATION_DISCOUNT_EXCEEDS_GROSS/);
  assert.match(source, /nextval\('\"SalesQuotationNumber_seq\"'\)/);
  assert.match(source, /status: SalesRfqStatus\.QUOTED/);
  assert.match(source, /writeBusinessAudit\(\{/);
});
