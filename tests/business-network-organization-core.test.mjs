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
  const schema = await read("../prisma/business-network.prisma");

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
    read("../prisma/business-network.prisma"),
    read("../prisma/schema.prisma"),
  ]);

  assert.match(businessSchema, /userId\s+String/);
  assert.match(businessSchema, /enum OrganizationPortalRole/);
  assert.match(businessSchema, /OWNER[\s\S]*ADMIN[\s\S]*BUYER[\s\S]*APPROVER[\s\S]*FINANCE/);
  assert.match(rootSchema, /enum AccessScopeType\s*\{[\s\S]*GLOBAL[\s\S]*WAREHOUSE[\s\S]*\}/);
  assert.doesNotMatch(rootSchema, /enum AccessScopeType\s*\{[\s\S]*ORGANIZATION/);
});
