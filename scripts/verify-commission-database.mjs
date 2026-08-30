import "dotenv/config";
import { randomInt, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

const migrationName = "20260830_m10_commission_engine_ledger";
const tables = ["CommissionPlan", "CommissionRule", "CommissionEntry"];
const constraints = [
  "CommissionPlan_code_check",
  "CommissionPlan_dates_check",
  "CommissionRule_calculation_check",
  "CommissionRule_scope_check",
  "CommissionRule_basis_scope_check",
  "CommissionEntry_amount_check",
  "CommissionEntry_basis_check",
  "CommissionEntry_source_check",
  "CommissionEntry_lifecycle_evidence_check",
  "PartnerAgreementVersion_commissionPlanId_fkey",
];
const indexes = [
  "CommissionEntry_order_item_earning_key",
  "CommissionEntry_order_earning_key",
  "CommissionEntry_lead_earning_key",
  "CommissionEntry_source_reversal_key",
];
const triggers = ["CommissionPlan_lifecycle_guard", "CommissionRule_draft_guard", "CommissionEntry_immutable_guard"];
const permissions = ["partner.commission.view", "partner.commission.calculate", "partner.commission.adjust", "partner.commission.approve"];

function ids() {
  const token = randomUUID().replaceAll("-", "");
  const digits = String(randomInt(1, 99_999_999)).padStart(8, "0");
  return { token, digits, organization: `${token}org`, profile: `${token}profile`, plan: `${token}plan`, rule: `${token}rule`, entry: `${token}entry` };
}

async function insertFixture(tx, identity) {
  await tx.$executeRawUnsafe(
    `INSERT INTO "Organization" ("id", "code", "legalName", "companyType", "status", "createdAt", "updatedAt")
     VALUES ($1, $2, 'M10 verifier', 'LIMITED_COMPANY', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    identity.organization,
    identity.token.slice(0, 32),
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO "PartnerProfile" ("id", "organizationId", "partnerCode", "status", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'APPLIED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    identity.profile,
    identity.organization,
    `PAR-${identity.digits}`,
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO "CommissionPlan" ("id", "code", "name", "status", "currency", "createdAt", "updatedAt")
     VALUES ($1, $2, 'M10 verifier plan', 'DRAFT', 'BDT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    identity.plan,
    `VERIFY_${identity.token.slice(0, 12).toUpperCase()}`,
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO "CommissionRule"
      ("id", "commissionPlanId", "name", "scopeType", "targetKey", "calculationType", "basis", "rate", "priority", "isActive", "createdAt", "updatedAt")
     VALUES ($1, $2, 'Verifier global rule', 'GLOBAL', 'GLOBAL', 'PERCENTAGE', 'NET_ITEM', 5, 100, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    identity.rule,
    identity.plan,
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO "CommissionEntry"
      ("id", "partnerProfileId", "type", "status", "grossBasisAmount", "netBasisAmount", "amount", "currency", "reason", "createdAt")
     VALUES ($1, $2, 'ADJUSTMENT', 'PENDING', 0, 0, 10, 'BDT', 'Verifier adjustment', CURRENT_TIMESTAMP)`,
    identity.entry,
    identity.profile,
  );
}

async function mutationIsBlocked(label, mutation, expected) {
  const allowed = new Error(`${label}_UNEXPECTEDLY_ALLOWED`);
  try {
    await prisma.$transaction(async (tx) => {
      const identity = ids();
      await insertFixture(tx, identity);
      await mutation(tx, identity);
      throw allowed;
    });
  } catch (error) {
    if (error === allowed) return false;
    if (String(error).toLowerCase().includes(expected.toLowerCase())) return true;
    throw error;
  }
  return false;
}

async function verifyLiveGuards() {
  const immutableMoney = await mutationIsBlocked(
    "COMMISSION_MONEY",
    (tx, identity) => tx.$executeRawUnsafe(`UPDATE "CommissionEntry" SET "amount" = 99 WHERE "id" = $1`, identity.entry),
    "financial data is immutable",
  );
  const invalidLifecycle = await mutationIsBlocked(
    "COMMISSION_LIFECYCLE",
    (tx, identity) => tx.$executeRawUnsafe(`UPDATE "CommissionEntry" SET "status" = 'PAID', "approvedAt" = CURRENT_TIMESTAMP, "payableAt" = CURRENT_TIMESTAMP, "paidAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, identity.entry),
    "invalid commission entry status transition",
  );
  const activatedRuleLocked = await mutationIsBlocked(
    "COMMISSION_RULE_LOCK",
    async (tx, identity) => {
      await tx.$executeRawUnsafe(`UPDATE "CommissionPlan" SET "status" = 'ACTIVE' WHERE "id" = $1`, identity.plan);
      await tx.$executeRawUnsafe(`UPDATE "CommissionRule" SET "rate" = 6 WHERE "id" = $1`, identity.rule);
    },
    "only change while their plan is draft",
  );
  return immutableMoney && invalidLifecycle && activatedRuleLocked;
}

try {
  const [migrations, foundTables, foundConstraints, foundIndexes, foundTriggers, foundPermissions] = await Promise.all([
    prisma.$queryRawUnsafe(`SELECT "migration_name" AS name FROM "_prisma_migrations" WHERE "migration_name" = $1 AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`, migrationName),
    prisma.$queryRawUnsafe(`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`, tables),
    prisma.$queryRawUnsafe(`SELECT conname AS name, convalidated AS validated FROM pg_constraint WHERE conname = ANY($1::text[])`, constraints),
    prisma.$queryRawUnsafe(`SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1::text[])`, indexes),
    prisma.$queryRawUnsafe(`SELECT tgname AS name FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY($1::text[])`, triggers),
    prisma.$queryRawUnsafe(`SELECT key AS name FROM "Permission" WHERE key = ANY($1::text[])`, permissions),
  ]);
  const liveGuards = await verifyLiveGuards();
  const missing = [];
  if (!migrations.some((row) => row.name === migrationName)) missing.push(`migration ${migrationName}`);
  for (const name of tables) if (!foundTables.some((row) => row.name === name)) missing.push(`table ${name}`);
  for (const name of constraints) if (!foundConstraints.find((row) => row.name === name)?.validated) missing.push(`validated constraint ${name}`);
  for (const name of indexes) if (!foundIndexes.some((row) => row.name === name)) missing.push(`index ${name}`);
  for (const name of triggers) if (!foundTriggers.some((row) => row.name === name)) missing.push(`trigger ${name}`);
  for (const name of permissions) if (!foundPermissions.some((row) => row.name === name)) missing.push(`permission ${name}`);
  if (!liveGuards) missing.push("live immutable money, lifecycle, and activated-plan rule guards");
  if (missing.length) {
    console.error("Commission database verification failed:");
    for (const item of missing) console.error(`- Missing ${item}`);
    process.exitCode = 1;
  } else {
    console.log("Commission database verification passed.");
    console.log(`Verified ${tables.length} tables, ${constraints.length} constraints, ${indexes.length} idempotency indexes, ${triggers.length} triggers, ${permissions.length} permissions, and rollback-safe live guards.`);
  }
} finally {
  await prisma.$disconnect();
}
