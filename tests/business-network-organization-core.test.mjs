import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const expectedModels = [
  "Organization",
  "OrganizationCapability",
  "OrganizationMember",
  "OrganizationMemberRoleGrant",
  "OrganizationInvitation",
  "OrganizationAddress",
  "OrganizationBranch",
  "OrganizationDocument",
  "BusinessAuditLog",
];

test("M1 organization core schema contains the frozen foundation models", async () => {
  const schema = await read("../prisma/schema.prisma");

  for (const model of expectedModels) {
    assert.match(schema, new RegExp(`model ${model}\\s*\\{`));
  }

  for (const enumName of [
    "OrganizationCompanyType",
    "OrganizationStatus",
    "OrganizationCapabilityType",
    "OrganizationCapabilityStatus",
    "OrganizationMemberStatus",
    "OrganizationPortalRole",
    "OrganizationAddressType",
    "OrganizationDocumentType",
    "OrganizationDocumentStatus",
  ]) {
    assert.match(schema, new RegExp(`enum ${enumName}\\s*\\{`));
  }

  assert.match(schema, /@@unique\(\[organizationId, type\]\)/);
  assert.match(schema, /@@unique\(\[organizationId, userId\]\)/);
  assert.match(schema, /@@unique\(\[memberId, role\]\)/);
  assert.match(schema, /tokenHash\s+String\s+@unique/);
  assert.match(schema, /@@unique\(\[organizationId, name\]\)/);
});

test("M1 migration creates only the organization-core database surface", async () => {
  const migration = await read(
    "../prisma/migrations/20260825_add_business_network_organization_core/migration.sql",
  );

  for (const model of expectedModels) {
    assert.match(migration, new RegExp(`CREATE TABLE "${model}"`));
  }

  assert.match(
    migration,
    /OrganizationCapability_organizationId_fkey[\s\S]*REFERENCES "Organization"\("id"\)/,
  );
  assert.match(
    migration,
    /OrganizationMemberRoleGrant_memberId_fkey[\s\S]*REFERENCES "OrganizationMember"\("id"\)/,
  );
  assert.match(
    migration,
    /BusinessAuditLog_memberId_fkey[\s\S]*REFERENCES "OrganizationMember"\("id"\)/,
  );

  assert.doesNotMatch(migration, /CREATE TABLE "Rfq"/);
  assert.doesNotMatch(migration, /CREATE TABLE "PurchaseOrder"/);
  assert.doesNotMatch(migration, /CREATE TABLE "Supplier"/);
  assert.doesNotMatch(migration, /ALTER TABLE "Rfq"/);
  assert.doesNotMatch(migration, /ALTER TABLE "PurchaseOrder"/);
  assert.doesNotMatch(migration, /ALTER TABLE "Supplier"/);
});

test("M1 keeps member identity ready for M2 portal RBAC without mixing global RBAC", async () => {
  const [businessSchema, rootSchema] = await Promise.all([
    read("../prisma/schema.prisma"),
    read("../prisma/schema.prisma"),
  ]);

  assert.match(businessSchema, /userId\s+String/);
  assert.match(businessSchema, /enum OrganizationPortalRole/);
  assert.match(businessSchema, /OWNER[\s\S]*ADMIN[\s\S]*BUYER[\s\S]*APPROVER[\s\S]*FINANCE/);
  const accessScopeBody = rootSchema.match(/enum AccessScopeType\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(accessScopeBody, /GLOBAL[\s\S]*WAREHOUSE/);
  assert.doesNotMatch(accessScopeBody, /\bORGANIZATION\b/);
});

test("M1 rejects duplicate Trade License, TIN, or BIN in every organization write path", async () => {
  const [application, admin, identifiers, migration] = await Promise.all([
    read("../lib/business-portal/application.ts"),
    read("../lib/business-network/admin-organizations.ts"),
    read("../lib/business-network/organization-identifiers.ts"),
    read("../prisma/migrations/20260831_m1_organization_identifier_uniqueness/migration.sql"),
  ]);

  assert.match(application, /assertOrganizationIdentifiersAvailable\(tx, input\.data\)/);
  assert.ok((admin.match(/assertOrganizationIdentifiersAvailable\(/g) ?? []).length >= 2);
  assert.match(identifiers, /409,[\s\S]*"ORGANIZATION_IDENTIFIER_CONFLICT"/);
  assert.match(
    identifiers,
    /An organization with this Trade License, TIN, or BIN already exists\./,
  );
  assert.match(identifiers, /pg_advisory_xact_lock/);
  assert.match(identifiers, /regexp_replace\(upper\(btrim\("tradeLicenseNo"\)\)/);
  assert.match(identifiers, /regexp_replace\(upper\(btrim\("tin"\)\)/);
  assert.match(identifiers, /regexp_replace\(upper\(btrim\("bin"\)\)/);

  assert.match(migration, /Organization_identifier_uniqueness_trigger/);
  assert.match(migration, /BEFORE INSERT OR UPDATE OF "tradeLicenseNo", "tin", "bin"/);
  assert.ok((migration.match(/ERRCODE = '23505'/g) ?? []).length === 3);
});

test("M1 preserves the original verification metadata when a suspended organization is reactivated", async () => {
  const { getOrganizationVerificationMetadata } = await import(
    "../lib/business-network/organization-lifecycle.ts"
  );
  const originalVerifiedAt = new Date("2026-08-31T08:57:00.000Z");
  const before = { verifiedAt: originalVerifiedAt, verifiedById: "original-verifier" };

  const reactivated = getOrganizationVerificationMetadata(
    before,
    "activate",
    "reactivating-admin",
    new Date("2026-08-31T09:10:00.000Z"),
  );
  assert.strictEqual(reactivated.verifiedAt, originalVerifiedAt);
  assert.equal(reactivated.verifiedById, "original-verifier");

  const firstVerificationAt = new Date("2026-08-31T10:00:00.000Z");
  const verified = getOrganizationVerificationMetadata(
    { verifiedAt: null, verifiedById: null },
    "verify",
    "first-verifier",
    firstVerificationAt,
  );
  assert.strictEqual(verified.verifiedAt, firstVerificationAt);
  assert.equal(verified.verifiedById, "first-verifier");
});
