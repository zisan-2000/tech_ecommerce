import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("M3 keeps one canonical Prisma schema and adds the frozen pricing models", async () => {
  const schema = await read("../prisma/schema.prisma");
  await assert.rejects(access(new URL("../prisma/business-network.prisma", import.meta.url)));
  for (const enumName of [
    "BusinessAccountStatus",
    "BusinessPriceScopeType",
    "BusinessPriceAdjustmentType",
    "BusinessPriceSource",
  ]) {
    assert.match(schema, new RegExp(`enum ${enumName}\\s*\\{`));
  }
  for (const modelName of [
    "BusinessAccount",
    "BusinessPricingTier",
    "BusinessPricingRule",
    "ContractPrice",
  ]) {
    assert.match(schema, new RegExp(`model ${modelName}\\s*\\{`));
  }
  assert.match(schema, /businessAccount\s+BusinessAccount\?/);
  assert.doesNotMatch(schema, /OrganizationCreditAccount/);
});

test("M3 migration is additive, constrained, and does not modify catalog/search tables", async () => {
  const migration = await read(
    "../prisma/migrations/20260826_m3_business_account_pricing_engine/migration.sql",
  );
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|INDEX|TYPE)/i);
  assert.doesNotMatch(migration, /ALTER TABLE "(?:Product|Order|OrderItem|Category|Brand)"/);
  for (const table of ["BusinessAccount", "BusinessPricingTier", "BusinessPricingRule", "ContractPrice"]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.match(migration, /BusinessPricingRule_target_check/);
  assert.match(migration, /ContractPrice_target_check/);
  assert.match(migration, /BusinessPricingRule_value_check/);
  assert.match(migration, /ON DELETE CASCADE/);
});

test("M3 registers internal RBAC keys and exact frozen admin API routes", async () => {
  const rbac = await read("../lib/rbac-config.ts");
  for (const key of [
    "business.account.view",
    "business.account.manage",
    "business.pricing.view",
    "business.pricing.manage",
  ]) {
    assert.match(rbac, new RegExp(key.replaceAll(".", "\\.")));
  }

  const routeContracts = [
    ["../app/api/admin/business-network/accounts/route.ts", /export async function GET[\s\S]*export async function POST/],
    ["../app/api/admin/business-network/accounts/[id]/route.ts", /export async function GET[\s\S]*export async function PATCH/],
    ["../app/api/admin/business-network/pricing/tiers/route.ts", /export async function GET[\s\S]*export async function POST/],
    ["../app/api/admin/business-network/pricing/tiers/[id]/route.ts", /export async function PATCH/],
    ["../app/api/admin/business-network/pricing/tiers/[id]/rules/route.ts", /export async function POST/],
    ["../app/api/admin/business-network/pricing/rules/[id]/route.ts", /export async function PATCH[\s\S]*export async function DELETE/],
    ["../app/api/admin/business-network/pricing/contracts/route.ts", /export async function GET[\s\S]*export async function POST/],
    ["../app/api/admin/business-network/pricing/contracts/[id]/route.ts", /export async function PATCH/],
  ];
  for (const [path, contract] of routeContracts) {
    const source = await read(path);
    assert.match(source, contract);
    assert.doesNotMatch(source, /\b(?:db|prisma)\.[a-z]/);
  }
});

test("M3 mutation services use serializable transactions and business audit", async () => {
  const [accounts, pricing] = await Promise.all([
    read("../lib/business-network/business-accounts.ts"),
    read("../lib/business-network/pricing.ts"),
  ]);
  for (const source of [accounts, pricing]) {
    assert.match(source, /runSerializableTransaction\(async \(tx\) =>/);
    assert.match(source, /writeBusinessAudit\(\{/);
  }
  assert.match(pricing, /CONTRACT_PRICE_PERIOD_OVERLAP/);
  assert.match(pricing, /resolvePricePrecedence\(\{/);
});
