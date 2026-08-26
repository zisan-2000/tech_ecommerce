import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("M4 adds the frozen corporate credit schema to the canonical Prisma schema", async () => {
  const schema = await read("../prisma/schema.prisma");
  for (const enumName of ["CreditLedgerEntryType", "CreditLedgerDirection"]) {
    assert.match(schema, new RegExp(`enum ${enumName}\\s*\\{`));
  }
  for (const modelName of ["OrganizationCreditAccount", "CreditLedgerEntry"]) {
    assert.match(schema, new RegExp(`model ${modelName}\\s*\\{`));
  }
  assert.match(schema, /creditAccount\s+OrganizationCreditAccount\?/);
  assert.match(schema, /creditLedgerEntries\s+CreditLedgerEntry\[\]/);
  assert.match(schema, /creditAccount\s+OrganizationCreditAccount\s+@relation\([\s\S]*onDelete: Restrict/);
});

test("M4 migration is additive and enforces monetary, direction, and idempotency constraints", async () => {
  const [migration, immutability, sourcePairHardening] = await Promise.all([
    read("../prisma/migrations/20260826_m4_corporate_credit/migration.sql"),
    read("../prisma/migrations/20260826_m4_credit_ledger_immutability/migration.sql"),
    read("../prisma/migrations/20260826_m4_credit_source_pair_hardening/migration.sql"),
  ]);
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|INDEX|TYPE)/i);
  assert.doesNotMatch(migration, /ALTER TABLE "(?:Product|Order|OrderItem|Category|Brand)"/);
  assert.match(migration, /CREATE TABLE "OrganizationCreditAccount"/);
  assert.match(migration, /CREATE TABLE "CreditLedgerEntry"/);
  assert.match(migration, /OrganizationCreditAccount_credit_values_check/);
  assert.match(migration, /CreditLedgerEntry_direction_check/);
  assert.match(migration, /CreditLedgerEntry_creditAccountId_sourceType_sourceId_key/);
  assert.match(migration, /ON DELETE RESTRICT/);
  assert.match(migration, /ON DELETE SET NULL/);
  assert.doesNotMatch(immutability, /DROP\s+(?:TABLE|COLUMN|INDEX|TYPE)/i);
  assert.match(immutability, /CreditLedgerEntry_immutable_trigger/);
  assert.match(immutability, /append-only and cannot be deleted/);
  assert.match(sourcePairHardening, /"sourceType" IS NOT NULL/);
  assert.match(sourcePairHardening, /"sourceId" IS NOT NULL/);
});

test("M4 registers exact permissions and frozen admin and portal APIs", async () => {
  const rbac = await read("../lib/rbac-config.ts");
  for (const key of ["business.credit.view", "business.credit.manage", "business.credit.adjust"]) {
    assert.match(rbac, new RegExp(key.replaceAll(".", "\\.")));
  }

  const routeContracts = [
    ["../app/api/admin/business-network/credit/route.ts", /export async function GET/],
    ["../app/api/admin/business-network/credit/[id]/route.ts", /export async function GET/],
    ["../app/api/admin/business-network/credit/[id]/set-limit/route.ts", /export async function POST/],
    ["../app/api/admin/business-network/credit/[id]/adjust/route.ts", /export async function POST/],
    ["../app/api/business/credit/route.ts", /export async function GET/],
    ["../app/api/business/credit/ledger/route.ts", /export async function GET/],
    ["../app/api/business/checkout/validate-credit/route.ts", /export async function POST/],
  ];
  for (const [path, contract] of routeContracts) {
    const source = await read(path);
    assert.match(source, contract);
    assert.doesNotMatch(source, /\b(?:db|prisma)\.[a-z]/);
    assert.match(source, /businessApiErrorResponse/);
  }
});

test("M4 mutations are serializable, audited, append-only at the API boundary, and idempotent", async () => {
  const [service, accounts] = await Promise.all([
    read("../lib/business-network/credit.ts"),
    read("../lib/business-network/business-accounts.ts"),
  ]);
  assert.match(service, /runSerializableTransaction\(async \(tx\) =>/);
  assert.match(service, /writeBusinessAudit\(\{/);
  assert.match(service, /sourceType: "ADMIN_ADJUSTMENT"/);
  assert.match(service, /PrismaClientKnownRequestError/);
  assert.doesNotMatch(service, /creditLedgerEntry\.(?:update|delete)/);
  assert.match(accounts, /organizationCreditAccount\.create/);

  const files = [
    "../app/api/admin/business-network/credit/route.ts",
    "../app/api/admin/business-network/credit/[id]/route.ts",
    "../app/api/admin/business-network/credit/[id]/set-limit/route.ts",
    "../app/api/admin/business-network/credit/[id]/adjust/route.ts",
  ];
  for (const path of files) {
    assert.doesNotMatch(await read(path), /export async function DELETE/);
  }
});
