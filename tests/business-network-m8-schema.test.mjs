import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("M8 adds partner profile and versioned agreement models to the canonical schema", async () => {
  const [schema, migration] = await Promise.all([
    read("../prisma/schema.prisma"),
    read("../prisma/migrations/20260827_m8_partner_profile_agreement/migration.sql"),
  ]);
  for (const enumName of [
    "PartnerStatus",
    "PartnerAgreementStatus",
    "PartnerAgreementVersionStatus",
    "PartnerAttributionModel",
  ]) assert.match(schema, new RegExp(`enum ${enumName}\\s*\\{`));
  for (const model of ["PartnerProfile", "PartnerAgreement", "PartnerAgreementVersion"]) {
    assert.match(schema, new RegExp(`model ${model}\\s*\\{`));
    assert.match(migration, new RegExp(`CREATE TABLE "${model}"`));
  }
  assert.match(schema, /model Organization\s*\{[\s\S]*partnerProfile\s+PartnerProfile\?/s);
  assert.doesNotMatch(migration, /CREATE TABLE "(?:PartnerAsset|PartnerLead|CommissionEntry)"/);
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|INDEX|TYPE)/i);
});

test("M8 database contract protects lifecycle, current versions, and submitted terms", async () => {
  const [migration, hardening] = await Promise.all([
    read("../prisma/migrations/20260827_m8_partner_profile_agreement/migration.sql"),
    read("../prisma/migrations/20260827_m8_partner_agreement_hardening/migration.sql"),
  ]);
  for (const contract of [
    /CREATE SEQUENCE "PartnerProfileCode_seq"/,
    /CREATE SEQUENCE "PartnerAgreementNumber_seq"/,
    /PartnerProfile_lifecycle_check/,
    /PartnerAgreement_dates_check/,
    /PartnerAgreementVersion_lifecycle_check/,
    /PartnerAgreementVersion_one_active_idx[\s\S]*WHERE "status" = 'ACTIVE'/,
    /PartnerAgreementVersion_one_open_idx[\s\S]*WHERE "status" IN \('DRAFT', 'PENDING_APPROVAL'\)/,
    /PartnerProfile_lifecycle_guard/,
    /PartnerAgreement_lifecycle_guard/,
    /PartnerAgreementVersion_immutable_guard/,
  ]) assert.match(migration, contract);
  assert.match(hardening, /PartnerAgreementVersion_commission_plan_m8_check/);
  assert.match(hardening, /OLD\."status" <> 'DRAFT' OR NEW\."status" <> 'DRAFT'/);
  assert.match(hardening, /Partner agreement approval evidence is immutable/);
});

test("M8 registers exact permissions and frozen portal/admin routes", async () => {
  const rbac = await read("../lib/rbac-config.ts");
  for (const permission of [
    "partner.profile.view",
    "partner.profile.manage",
    "partner.profile.approve",
    "partner.profile.suspend",
    "partner.agreement.view",
    "partner.agreement.manage",
    "partner.agreement.approve",
  ]) assert.match(rbac, new RegExp(permission.replaceAll(".", "\\.")));

  const routes = [
    "../app/api/business/partner/route.ts",
    "../app/api/admin/business-network/partners/route.ts",
    "../app/api/admin/business-network/partners/[id]/route.ts",
    "../app/api/admin/business-network/partners/[id]/approve/route.ts",
    "../app/api/admin/business-network/partners/[id]/reject/route.ts",
    "../app/api/admin/business-network/partners/[id]/suspend/route.ts",
    "../app/api/admin/business-network/partners/[id]/reactivate/route.ts",
    "../app/api/admin/business-network/agreements/route.ts",
    "../app/api/admin/business-network/agreements/[id]/route.ts",
    "../app/api/admin/business-network/agreements/[id]/versions/route.ts",
    "../app/api/admin/business-network/agreements/[id]/submit/route.ts",
    "../app/api/admin/business-network/agreements/[id]/approve/route.ts",
    "../app/api/admin/business-network/agreements/[id]/suspend/route.ts",
    "../app/api/admin/business-network/agreements/[id]/terminate/route.ts",
  ];
  for (const path of routes) {
    const source = await read(path);
    assert.match(source, /export async function (?:GET|POST)/);
    assert.match(source, /businessApiErrorResponse/);
    assert.doesNotMatch(source, /\b(?:db|prisma)\.[a-z]/);
  }
});

test("M8 service is transactional, capability-aware, audited, and versions without overwriting", async () => {
  const source = await read("../lib/business-network/partner.ts");
  assert.match(source, /runSerializableTransaction\(async \(tx\) =>/);
  assert.match(source, /PARTNER_CAPABILITIES/);
  assert.match(source, /PartnerAgreementVersionStatus\.SUPERSEDED/);
  assert.match(source, /COMMISSION_PLAN_MILESTONE_REQUIRED/);
  assert.match(source, /nextval\('\"PartnerProfileCode_seq\"'\)/);
  assert.match(source, /nextval\('\"PartnerAgreementNumber_seq\"'\)/);
  assert.match(source, /writeBusinessAudit\(\{/);
});
