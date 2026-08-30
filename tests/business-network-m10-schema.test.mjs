import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("M10 adds the frozen commission engine and ledger to the canonical schema", async () => {
  const [schema, migration] = await Promise.all([
    read("../prisma/schema.prisma"),
    read("../prisma/migrations/20260830_m10_commission_engine_ledger/migration.sql"),
  ]);
  for (const name of ["CommissionPlanStatus", "CommissionScopeType", "CommissionCalculationType", "CommissionBasis", "CommissionEntryType", "CommissionStatus"]) {
    assert.match(schema, new RegExp(`enum ${name}\\s*\\{`));
  }
  for (const model of ["CommissionPlan", "CommissionRule", "CommissionEntry"]) {
    assert.match(schema, new RegExp(`model ${model}\\s*\\{`));
    assert.match(migration, new RegExp(`CREATE TABLE "${model}"`));
  }
  assert.match(schema, /model PartnerAgreementVersion\s*\{[\s\S]*commissionPlan\s+CommissionPlan\?/s);
  assert.doesNotMatch(migration, /CREATE TABLE "PartnerSettlement"/);
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|INDEX|TYPE)/i);
});

test("M10 database contract makes money immutable and calculation idempotent", async () => {
  const migration = await read("../prisma/migrations/20260830_m10_commission_engine_ledger/migration.sql");
  for (const contract of [
    /CommissionRule_calculation_check/,
    /CommissionRule_scope_check/,
    /CommissionEntry_amount_check/,
    /CommissionEntry_lifecycle_evidence_check/,
    /CommissionEntry_order_item_earning_key[\s\S]*WHERE "type" = 'EARNING'/,
    /CommissionEntry_order_earning_key/,
    /CommissionEntry_lead_earning_key/,
    /CommissionEntry_source_reversal_key/,
    /CommissionEntry_immutable_guard/,
    /CommissionRule_draft_guard/,
  ]) assert.match(migration, contract);
  assert.match(migration, /DROP CONSTRAINT "PartnerAgreementVersion_commission_plan_m8_check"/);
  const tiering = await read("../prisma/migrations/20260830_m10_commission_rule_tiering_hardening/migration.sql");
  assert.match(tiering, /DROP INDEX "CommissionRule_commissionPlanId_targetKey_key"/);
  assert.match(tiering, /CommissionRule_commissionPlanId_targetKey_minQuantity_idx/);
  const lifecycle = await read("../prisma/migrations/20260830_m10_commission_lifecycle_evidence_hardening/migration.sql");
  assert.match(lifecycle, /"status" = 'HOLD' AND "holdUntil" IS NOT NULL/);
  assert.match(lifecycle, /"status" = 'PAID'[\s\S]*"paidAt" IS NOT NULL/);
});

test("M10 registers exact permissions and frozen portal/admin routes", async () => {
  const rbac = await read("../lib/rbac-config.ts");
  for (const permission of ["partner.commission.view", "partner.commission.calculate", "partner.commission.adjust", "partner.commission.approve"]) {
    assert.match(rbac, new RegExp(permission.replaceAll(".", "\\.")));
  }
  const routes = [
    "../app/api/business/partner/commissions/route.ts",
    "../app/api/admin/business-network/commission/plans/route.ts",
    "../app/api/admin/business-network/commission/plans/[id]/route.ts",
    "../app/api/admin/business-network/commission/plans/[id]/rules/route.ts",
    "../app/api/admin/business-network/commission/rules/[id]/route.ts",
    "../app/api/admin/business-network/commission/entries/route.ts",
    "../app/api/admin/business-network/commission/entries/[id]/approve/route.ts",
    "../app/api/admin/business-network/commission/entries/[id]/cancel/route.ts",
    "../app/api/admin/business-network/commission/entries/[id]/reverse/route.ts",
    "../app/api/admin/business-network/commission/adjustments/route.ts",
  ];
  for (const path of routes) {
    const source = await read(path);
    assert.match(source, /export async function (?:GET|POST|PATCH|DELETE)/);
    assert.match(source, /businessApiErrorResponse/);
    assert.doesNotMatch(source, /\b(?:db|prisma)\.[a-z]/);
  }
});

test("M10 calculation is atomic with attribution checkout and lead conversion", async () => {
  const [order, referral, commission, delivery] = await Promise.all([
    read("../app/api/orders/route-core.ts"),
    read("../lib/business-network/partner-referral.ts"),
    read("../lib/business-network/commission.ts"),
    read("../lib/delivery-assignments.ts"),
  ]);
  assert.match(order, /attributionResult === "converted"[\s\S]*calculateOrderCommissions\(\{/);
  assert.match(referral, /input\.action === "won"[\s\S]*calculateLeadCommission\(\{/);
  assert.match(commission, /Prisma\.Decimal/);
  assert.match(commission, /selectCommissionRule/);
  assert.match(delivery, /syncCommissionEntriesForOrderStatus\(\{/);
});
