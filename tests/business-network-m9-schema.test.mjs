import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("M9 adds the frozen referral, attribution, and lead models to the canonical schema", async () => {
  const [schema, migration] = await Promise.all([
    read("../prisma/schema.prisma"),
    read("../prisma/migrations/20260827_m9_referral_attribution_leads/migration.sql"),
  ]);
  for (const enumName of [
    "PartnerAssetType",
    "PartnerAssetStatus",
    "PartnerAttributionSource",
    "PartnerAttributionStatus",
    "PartnerLeadStatus",
  ]) assert.match(schema, new RegExp(`enum ${enumName}\\s*\\{`));
  for (const model of ["PartnerAsset", "PartnerAttribution", "PartnerLead"]) {
    assert.match(schema, new RegExp(`model ${model}\\s*\\{`));
    assert.match(migration, new RegExp(`CREATE TABLE "${model}"`));
  }
  assert.match(schema, /model Order\s*\{[\s\S]*partnerAttribution\s+PartnerAttribution\?/s);
  assert.doesNotMatch(migration, /CREATE TABLE "(?:CommissionPlan|CommissionEntry|PartnerSettlement)"/);
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|INDEX|TYPE)/i);
});

test("M9 database contract enforces attribution and lead integrity", async () => {
  const [migration, hardening] = await Promise.all([
    read("../prisma/migrations/20260827_m9_referral_attribution_leads/migration.sql"),
    read("../prisma/migrations/20260827_m9_attribution_identity_hardening/migration.sql"),
  ]);
  for (const contract of [
    /CREATE SEQUENCE "PartnerLeadNumber_seq"/,
    /PartnerAsset_destination_check/,
    /PartnerAttribution_lifecycle_check/,
    /PartnerLead_lifecycle_check/,
    /PartnerAttribution_one_active_visitor_idx[\s\S]*WHERE "status" = 'ACTIVE'/,
    /PartnerAttribution_one_active_session_idx[\s\S]*WHERE "status" = 'ACTIVE'/,
    /PartnerAsset_lifecycle_guard/,
    /PartnerAttribution_scope_lifecycle_guard/,
    /PartnerLead_lifecycle_guard/,
    /PartnerLead_assignedToUserId_fkey/,
    /PartnerLead_wonOrderId_fkey/,
    /PartnerLead_duplicateOfId_fkey/,
  ]) assert.match(migration, contract);
  assert.match(hardening, /PartnerAttribution_customerUserId_fkey/);
});

test("M9 registers exact permissions and frozen portal, public, and admin routes", async () => {
  const rbac = await read("../lib/rbac-config.ts");
  for (const permission of ["partner.lead.view", "partner.lead.manage", "partner.lead.assign"]) {
    assert.match(rbac, new RegExp(permission.replaceAll(".", "\\.")));
  }
  const routes = [
    "../app/api/business/partner/assets/route.ts",
    "../app/api/business/partner/assets/[id]/route.ts",
    "../app/api/business/partner/leads/route.ts",
    "../app/api/business/partner/leads/[id]/route.ts",
    "../app/api/public/partner/attributions/route.ts",
    "../app/r/[code]/route.ts",
    "../app/api/admin/business-network/leads/route.ts",
    "../app/api/admin/business-network/leads/[id]/route.ts",
    "../app/api/admin/business-network/leads/[id]/accept/route.ts",
    "../app/api/admin/business-network/leads/[id]/duplicate/route.ts",
    "../app/api/admin/business-network/leads/[id]/assign/route.ts",
    "../app/api/admin/business-network/leads/[id]/won/route.ts",
    "../app/api/admin/business-network/leads/[id]/lost/route.ts",
    "../app/api/admin/business-network/leads/[id]/reject/route.ts",
  ];
  for (const path of routes) {
    const source = await read(path);
    assert.match(source, /export async function (?:GET|POST|PATCH|DELETE)/);
    assert.match(source, /businessApiErrorResponse/);
    assert.doesNotMatch(source, /\b(?:db|prisma)\.[a-z]/);
  }
});

test("M9 attribution is signed, rate-limited, privacy-safe, and converted atomically with checkout", async () => {
  const [cookie, service, captureRoute, redirectRoute, orderRoute] = await Promise.all([
    read("../lib/business-network/partner-attribution-cookie.ts"),
    read("../lib/business-network/partner-referral.ts"),
    read("../app/api/public/partner/attributions/route.ts"),
    read("../app/r/[code]/route.ts"),
    read("../app/api/orders/route-core.ts"),
  ]);
  assert.match(cookie, /createHmac\("sha256"/);
  assert.match(cookie, /timingSafeEqual/);
  assert.match(cookie, /httpOnly:\s*true/);
  assert.match(captureRoute, /rateLimitRequest/);
  assert.match(redirectRoute, /NextResponse\.redirect/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /allowSelfReferral/);
  assert.match(service, /hashPartnerAttributionFingerprint/);
  assert.match(service, /organization\.findMany/);
  assert.match(service, /endsWith: `@\$\{emailDomain\}`/);
  assert.match(service, /const idempotent =/);
  assert.doesNotMatch(captureRoute, /partnerProfileId|partnerCode|organizationId/);
  assert.match(orderRoute, /parsePartnerAttributionCookie/);
  assert.match(orderRoute, /convertPartnerAttributionForOrder\(\{/);
  assert.match(orderRoute, /await prisma\.\$transaction\(async \(tx/);
});
