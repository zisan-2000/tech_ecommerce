import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("M11 adds frozen settlement and payout models to the canonical schema", async () => {
  const [schema, migration] = await Promise.all([
    read("../prisma/schema.prisma"),
    read("../prisma/migrations/20260830_m11_partner_settlement_payout/migration.sql"),
  ]);
  for (const name of ["PartnerSettlementStatus", "PartnerPayoutAccountType", "PartnerPayoutAccountStatus"]) {
    assert.match(schema, new RegExp(`enum ${name}\\s*\\{`));
  }
  for (const model of ["PartnerSettlement", "PartnerSettlementLine", "PartnerPayoutAccount"]) {
    assert.match(schema, new RegExp(`model ${model}\\s*\\{`));
    assert.match(migration, new RegExp(`CREATE TABLE "${model}"`));
  }
  assert.match(schema, /model CommissionEntry\s*\{[\s\S]*settlementLine\s+PartnerSettlementLine\?/s);
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|TYPE)/i);
});

test("M11 database contract protects encrypted accounts and immutable settlement snapshots", async () => {
  const migration = await read("../prisma/migrations/20260830_m11_partner_settlement_payout/migration.sql");
  for (const contract of [
    /PartnerPayoutAccount_ciphertext_check/,
    /PartnerPayoutAccount_verification_check/,
    /PartnerPayoutAccount_default_key[\s\S]*WHERE "isDefault" = true/,
    /PartnerSettlement_amount_check/,
    /PartnerSettlement_lifecycle_evidence_check/,
    /PartnerSettlementLine_commissionEntryId_key/,
    /PartnerPayoutAccount_guard/,
    /PartnerSettlement_guard/,
    /PartnerSettlementLine_guard/,
    /CREATE OR REPLACE FUNCTION "protect_commission_entry"/,
  ]) assert.match(migration, contract);
  assert.match(migration, /Commission settlement transition lacks matching settlement evidence/);
  assert.match(migration, /Payout accounts cannot be deleted; disable them instead/);
});

test("M11 registers exact permissions and frozen portal/admin routes", async () => {
  const rbac = await read("../lib/rbac-config.ts");
  for (const permission of [
    "partner.settlement.view",
    "partner.settlement.create",
    "partner.settlement.approve",
    "partner.settlement.pay",
    "partner.payout_account.view",
    "partner.payout_account.verify",
  ]) assert.match(rbac, new RegExp(permission.replaceAll(".", "\\.")));
  const routes = [
    "../app/api/business/partner/settlements/route.ts",
    "../app/api/business/partner/settlements/[id]/route.ts",
    "../app/api/business/partner/payout-accounts/route.ts",
    "../app/api/business/partner/payout-accounts/[id]/route.ts",
    "../app/api/admin/business-network/settlements/route.ts",
    "../app/api/admin/business-network/settlements/[id]/route.ts",
    "../app/api/admin/business-network/settlements/[id]/submit/route.ts",
    "../app/api/admin/business-network/settlements/[id]/approve/route.ts",
    "../app/api/admin/business-network/settlements/[id]/process/route.ts",
    "../app/api/admin/business-network/settlements/[id]/mark-paid/route.ts",
    "../app/api/admin/business-network/settlements/[id]/cancel/route.ts",
    "../app/api/admin/business-network/payout-accounts/[id]/verify/route.ts",
    "../app/api/admin/business-network/payout-accounts/[id]/reject/route.ts",
  ];
  for (const path of routes) {
    const source = await read(path);
    assert.match(source, /export async function (?:GET|POST|PATCH|DELETE)/);
    assert.match(source, /businessApiErrorResponse/);
    assert.doesNotMatch(source, /\b(?:db|prisma)\.[a-z]/);
  }
});

test("M11 settlement service is serializable, tenant-scoped, encrypted, audited, and reversal-aware", async () => {
  const [service, commission, sanitizer] = await Promise.all([
    read("../lib/business-network/settlement.ts"),
    read("../lib/business-network/commission.ts"),
    read("../lib/business-network/audit-sanitization.ts"),
  ]);
  assert.match(service, /runSerializableTransaction/);
  assert.match(service, /partnerProfileId:\s*profile\.id/);
  assert.match(service, /encryptPayoutAccountNumber/);
  assert.match(service, /CommissionStatus\.APPROVED/);
  assert.match(service, /CommissionStatus\.PAYABLE/);
  assert.match(service, /CommissionStatus\.PAID/);
  assert.match(service, /writeBusinessAudit/);
  assert.match(commission, /cancelOpenSettlementForCommissionEntry/);
  assert.match(sanitizer, /encrypted\|accountnumber/);
});
