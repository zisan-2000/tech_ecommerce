import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("M7 integrates customer POs with the existing Order domain", async () => {
  const [schema, migration] = await Promise.all([
    read("../prisma/schema.prisma"),
    read("../prisma/migrations/20260826_m7_customer_po_order_integration/migration.sql"),
  ]);
  assert.match(schema, /enum CustomerPurchaseOrderStatus\s*\{/);
  assert.match(schema, /enum SalesChannel\s*\{/);
  assert.match(schema, /model CustomerPurchaseOrder\s*\{/);
  assert.match(schema, /model Order\s*\{[\s\S]*salesChannel\s+SalesChannel/s);
  assert.match(schema, /model OrderItem\s*\{[\s\S]*priceSource\s+BusinessPriceSource\?/s);
  assert.match(migration, /ALTER TABLE "Order"/);
  assert.doesNotMatch(migration, /CREATE TABLE "Order"/);
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|INDEX|TYPE)/i);
});

test("M7 migrations guard lifecycle, deduplication, snapshots, and corporate money", async () => {
  const [migration, hardening, financialHardening] = await Promise.all([
    read("../prisma/migrations/20260826_m7_customer_po_order_integration/migration.sql"),
    read("../prisma/migrations/20260826_m7_commercial_snapshot_hardening/migration.sql"),
    read("../prisma/migrations/20260826_m7_financial_snapshot_hardening/migration.sql"),
  ]);
  for (const contract of [
    /CustomerPurchaseOrder_lifecycle_check/,
    /CustomerPurchaseOrder_active_quotation_idx[\s\S]*status" NOT IN \('REJECTED', 'CANCELLED'\)/,
    /CustomerPurchaseOrder_lifecycle_guard/,
    /Order_corporate_context_immutable/,
    /OrderItem_business_snapshot_immutable/,
    /ALTER COLUMN "grand_total" TYPE DECIMAL\(14,2\)/,
  ]) assert.match(migration, contract);
  assert.match(hardening, /BEFORE UPDATE OR DELETE ON "OrderItem"/);
  assert.match(hardening, /CustomerPurchaseOrder_review_metadata_immutable/);
  assert.match(financialHardening, /NEW\."grand_total" IS DISTINCT FROM OLD\."grand_total"/);
  assert.match(financialHardening, /Customer purchase order rejection evidence is immutable/);
});

test("M7 registers exact permissions and frozen portal/admin routes", async () => {
  const rbac = await read("../lib/rbac-config.ts");
  for (const permission of [
    "business.customer_po.view",
    "business.customer_po.verify",
    "business.customer_po.convert",
  ]) assert.match(rbac, new RegExp(permission.replaceAll(".", "\\.")));

  const routes = [
    "../app/api/business/customer-pos/route.ts",
    "../app/api/business/customer-pos/[id]/route.ts",
    "../app/api/business/customer-pos/[id]/cancel/route.ts",
    "../app/api/admin/business-network/customer-pos/route.ts",
    "../app/api/admin/business-network/customer-pos/[id]/route.ts",
    "../app/api/admin/business-network/customer-pos/[id]/verify/route.ts",
    "../app/api/admin/business-network/customer-pos/[id]/reject/route.ts",
    "../app/api/admin/business-network/customer-pos/[id]/convert-to-order/route.ts",
  ];
  for (const path of routes) {
    const source = await read(path);
    assert.match(source, /export async function (?:GET|POST)/);
    assert.match(source, /businessApiErrorResponse/);
    assert.doesNotMatch(source, /\b(?:db|prisma)\.[a-z]/);
  }
});

test("M7 conversion is serialized, revalidates quote/catalog, and reserves inventory atomically", async () => {
  const source = await read("../lib/business-network/customer-po.ts");
  assert.match(source, /runSerializableTransaction\(async \(tx\) =>/);
  assert.match(source, /FOR UPDATE/);
  assert.match(source, /acceptedVersion\(before\)/);
  assert.match(source, /QUOTATION_TOTALS_INVALID/);
  assert.match(source, /reserveVariantInventory\(\{/);
  assert.match(source, /salesChannel: SalesChannel\.CORPORATE/);
  assert.match(source, /priceSource: BusinessPriceSource\.QUOTATION/);
  assert.match(source, /status: CustomerPurchaseOrderStatus\.CONVERTED/);
  assert.match(source, /writeBusinessAudit\(\{/);
});
