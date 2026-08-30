import "dotenv/config";
import { randomInt, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

const migrationName = "20260830_m11_partner_settlement_payout";
const tables = ["PartnerSettlement", "PartnerSettlementLine", "PartnerPayoutAccount"];
const constraints = [
  "PartnerPayoutAccount_ciphertext_check",
  "PartnerPayoutAccount_type_check",
  "PartnerPayoutAccount_verification_check",
  "PartnerPayoutAccount_default_check",
  "PartnerSettlement_period_check",
  "PartnerSettlement_amount_check",
  "PartnerSettlement_lifecycle_evidence_check",
  "PartnerSettlementLine_amount_check",
];
const indexes = [
  "PartnerSettlement_paymentReference_key",
  "PartnerSettlementLine_commissionEntryId_key",
  "PartnerPayoutAccount_default_key",
];
const triggers = ["PartnerPayoutAccount_guard", "PartnerSettlement_guard", "PartnerSettlementLine_guard"];
const permissions = [
  "partner.settlement.view",
  "partner.settlement.create",
  "partner.settlement.approve",
  "partner.settlement.pay",
  "partner.payout_account.view",
  "partner.payout_account.verify",
];

function ids() {
  const token = randomUUID().replaceAll("-", "");
  const digits = String(randomInt(1, 99_999_999)).padStart(8, "0");
  return {
    token,
    digits,
    user: `${token}user`,
    organization: `${token}org`,
    profile: `${token}profile`,
    account: `${token}account`,
    entry: `${token}entry`,
    settlement: `${token}settlement`,
    line: `${token}line`,
  };
}

async function insertFixture(tx, identity) {
  await tx.$executeRawUnsafe(
    `INSERT INTO "User" ("id", "email", "role", "createdAt", "updatedAt") VALUES ($1, $2, 'admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    identity.user,
    `${identity.token}@m11.test`,
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO "Organization" ("id", "code", "legalName", "companyType", "status", "createdAt", "updatedAt")
     VALUES ($1, $2, 'M11 verifier', 'LIMITED_COMPANY', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    identity.organization,
    identity.token.slice(0, 32),
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO "PartnerProfile" ("id", "organizationId", "partnerCode", "status", "approvedAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    identity.profile,
    identity.organization,
    `PAR-${identity.digits}`,
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO "PartnerPayoutAccount"
      ("id", "partnerProfileId", "type", "status", "accountName", "providerName", "accountNumberEncrypted", "accountNumberLast4", "createdAt", "updatedAt")
     VALUES ($1, $2, 'MOBILE_WALLET', 'PENDING_VERIFICATION', 'M11 verifier', 'bKash', 'v1:YWJj:ZGVm:Z2hp', '5678', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    identity.account,
    identity.profile,
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO "CommissionEntry"
      ("id", "partnerProfileId", "type", "status", "grossBasisAmount", "netBasisAmount", "amount", "currency", "approvedAt", "reason", "createdAt")
     VALUES ($1, $2, 'ADJUSTMENT', 'APPROVED', 0, 0, 100, 'BDT', CURRENT_TIMESTAMP, 'M11 verifier', CURRENT_TIMESTAMP)`,
    identity.entry,
    identity.profile,
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO "PartnerSettlement"
      ("id", "settlementNumber", "partnerProfileId", "status", "periodStart", "periodEnd", "grossCommission", "adjustments", "netPayable", "currency", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'DRAFT', CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP + INTERVAL '1 minute', 0, 100, 100, 'BDT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    identity.settlement,
    `SET-${identity.digits}`,
    identity.profile,
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO "PartnerSettlementLine" ("id", "settlementId", "commissionEntryId", "amount", "createdAt")
     VALUES ($1, $2, $3, 100, CURRENT_TIMESTAMP)`,
    identity.line,
    identity.settlement,
    identity.entry,
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
  const lineImmutable = await mutationIsBlocked(
    "SETTLEMENT_LINE",
    (tx, identity) => tx.$executeRawUnsafe(`UPDATE "PartnerSettlementLine" SET "amount" = 99 WHERE "id" = $1`, identity.line),
    "settlement lines are immutable",
  );
  const directPayableBlocked = await mutationIsBlocked(
    "DIRECT_PAYABLE",
    (tx, identity) => tx.$executeRawUnsafe(`UPDATE "CommissionEntry" SET "status" = 'PAYABLE', "payableAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, identity.entry),
    "lacks matching settlement evidence",
  );
  const verifiedDetailsLocked = await mutationIsBlocked(
    "VERIFIED_PAYOUT_DETAILS",
    async (tx, identity) => {
      await tx.$executeRawUnsafe(
        `UPDATE "PartnerPayoutAccount" SET "status" = 'VERIFIED', "verifiedAt" = CURRENT_TIMESTAMP, "verifiedById" = $2, "isDefault" = true WHERE "id" = $1`,
        identity.account,
        identity.user,
      );
      await tx.$executeRawUnsafe(`UPDATE "PartnerPayoutAccount" SET "accountName" = 'Changed without review' WHERE "id" = $1`, identity.account);
    },
    "require re-verification",
  );
  const physicalDeleteBlocked = await mutationIsBlocked(
    "PAYOUT_DELETE",
    (tx, identity) => tx.$executeRawUnsafe(`DELETE FROM "PartnerPayoutAccount" WHERE "id" = $1`, identity.account),
    "disable them instead",
  );
  return lineImmutable && directPayableBlocked && verifiedDetailsLocked && physicalDeleteBlocked;
}

async function verifyHappyPath(mode) {
  const rolledBack = new Error(`M11_${mode}_ROLLBACK`);
  try {
    await prisma.$transaction(async (tx) => {
      const identity = ids();
      await insertFixture(tx, identity);
      await tx.$executeRawUnsafe(
        `UPDATE "PartnerPayoutAccount" SET "status" = 'VERIFIED', "verifiedAt" = CURRENT_TIMESTAMP, "verifiedById" = $2, "isDefault" = true WHERE "id" = $1`,
        identity.account,
        identity.user,
      );
      await tx.$executeRawUnsafe(
        `UPDATE "PartnerSettlement" SET "status" = 'SUBMITTED', "payoutAccountId" = $2, "submittedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        identity.settlement,
        identity.account,
      );
      await tx.$executeRawUnsafe(
        `UPDATE "CommissionEntry" SET "status" = 'PAYABLE', "payableAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        identity.entry,
      );
      if (mode === "cancel") {
        await tx.$executeRawUnsafe(
          `UPDATE "PartnerSettlement" SET "status" = 'CANCELLED', "cancelledAt" = CURRENT_TIMESTAMP, "cancellationReason" = 'Rollback-safe verifier cancellation' WHERE "id" = $1`,
          identity.settlement,
        );
        await tx.$executeRawUnsafe(
          `UPDATE "CommissionEntry" SET "status" = 'APPROVED', "payableAt" = NULL WHERE "id" = $1`,
          identity.entry,
        );
      } else {
        await tx.$executeRawUnsafe(
          `UPDATE "PartnerSettlement" SET "status" = 'APPROVED', "approvedAt" = CURRENT_TIMESTAMP, "approvedById" = $2 WHERE "id" = $1`,
          identity.settlement,
          identity.user,
        );
        await tx.$executeRawUnsafe(
          `UPDATE "PartnerSettlement" SET "status" = 'PROCESSING', "processingAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
          identity.settlement,
        );
        await tx.$executeRawUnsafe(
          `UPDATE "PartnerSettlement" SET "status" = 'PAID', "paidAt" = CURRENT_TIMESTAMP, "paymentReference" = $2 WHERE "id" = $1`,
          identity.settlement,
          `PAY-${identity.token}`,
        );
        await tx.$executeRawUnsafe(
          `UPDATE "CommissionEntry" SET "status" = 'PAID', "paidAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
          identity.entry,
        );
      }
      throw rolledBack;
    });
  } catch (error) {
    if (error === rolledBack) return true;
    throw error;
  }
  return false;
}

try {
  const [migrations, foundTables, foundConstraints, foundIndexes, foundTriggers, foundPermissions, foundSequence] = await Promise.all([
    prisma.$queryRawUnsafe(`SELECT "migration_name" AS name FROM "_prisma_migrations" WHERE "migration_name" = $1 AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`, migrationName),
    prisma.$queryRawUnsafe(`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`, tables),
    prisma.$queryRawUnsafe(`SELECT conname AS name, convalidated AS validated FROM pg_constraint WHERE conname = ANY($1::text[])`, constraints),
    prisma.$queryRawUnsafe(`SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1::text[])`, indexes),
    prisma.$queryRawUnsafe(`SELECT tgname AS name FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY($1::text[])`, triggers),
    prisma.$queryRawUnsafe(`SELECT key AS name FROM "Permission" WHERE key = ANY($1::text[])`, permissions),
    prisma.$queryRawUnsafe(`SELECT sequencename AS name FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'PartnerSettlementNumber_seq'`),
  ]);
  const [liveGuards, payableToPaid, cancellationRelease] = await Promise.all([
    verifyLiveGuards(),
    verifyHappyPath("paid"),
    verifyHappyPath("cancel"),
  ]);
  const missing = [];
  if (!migrations.some((row) => row.name === migrationName)) missing.push(`migration ${migrationName}`);
  for (const name of tables) if (!foundTables.some((row) => row.name === name)) missing.push(`table ${name}`);
  for (const name of constraints) if (!foundConstraints.find((row) => row.name === name)?.validated) missing.push(`validated constraint ${name}`);
  for (const name of indexes) if (!foundIndexes.some((row) => row.name === name)) missing.push(`index ${name}`);
  for (const name of triggers) if (!foundTriggers.some((row) => row.name === name)) missing.push(`trigger ${name}`);
  for (const name of permissions) if (!foundPermissions.some((row) => row.name === name)) missing.push(`permission ${name}`);
  if (!foundSequence.some((row) => row.name === "PartnerSettlementNumber_seq")) missing.push("settlement number sequence");
  if (!liveGuards) missing.push("live settlement, payout-account, and commission-transition guards");
  if (!payableToPaid) missing.push("payable-to-paid happy path");
  if (!cancellationRelease) missing.push("settlement cancellation release path");
  if (missing.length) {
    console.error("Partner settlement database verification failed:");
    for (const item of missing) console.error(`- Missing ${item}`);
    process.exitCode = 1;
  } else {
    console.log("Partner settlement database verification passed.");
    console.log(`Verified ${tables.length} tables, ${constraints.length} constraints, ${indexes.length} indexes, ${triggers.length} triggers, ${permissions.length} permissions, one sequence, rollback-safe guards, payout completion, and cancellation release.`);
  }
} finally {
  await prisma.$disconnect();
}
