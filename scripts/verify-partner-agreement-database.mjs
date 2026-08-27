import "dotenv/config";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

const migrationNames = [
  "20260827_m8_partner_profile_agreement",
  "20260827_m8_partner_agreement_hardening",
];
const tables = ["PartnerProfile", "PartnerAgreement", "PartnerAgreementVersion"];
const constraints = [
  "PartnerProfile_code_check",
  "PartnerProfile_lifecycle_check",
  "PartnerAgreement_number_check",
  "PartnerAgreement_dates_check",
  "PartnerAgreementVersion_number_check",
  "PartnerAgreementVersion_window_check",
  "PartnerAgreementVersion_settlement_check",
  "PartnerAgreementVersion_currency_check",
  "PartnerAgreementVersion_lifecycle_check",
  "PartnerAgreementVersion_commission_plan_m8_check",
  "PartnerAgreementVersion_territory_rules_check",
  "PartnerAgreementVersion_category_rules_check",
  "PartnerAgreementVersion_commercial_terms_check",
];
const indexes = [
  "PartnerAgreementVersion_one_active_idx",
  "PartnerAgreementVersion_one_open_idx",
  "PartnerAgreement_one_live_profile_idx",
];
const triggers = [
  "PartnerProfile_lifecycle_guard",
  "PartnerAgreement_lifecycle_guard",
  "PartnerAgreementVersion_immutable_guard",
];
const sequences = ["PartnerProfileCode_seq", "PartnerAgreementNumber_seq"];
const permissions = [
  "partner.profile.view",
  "partner.profile.manage",
  "partner.profile.approve",
  "partner.profile.suspend",
  "partner.agreement.view",
  "partner.agreement.manage",
  "partner.agreement.approve",
];

async function verifySubmittedTermsImmutability() {
  const token = `m8verify${Date.now()}`;
  const rollback = new Error("M8_VERIFICATION_ROLLBACK");
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO "Organization"
          ("id", "code", "legalName", "companyType", "status", "createdAt", "updatedAt")
         VALUES ($1, $2, 'M8 verifier', 'LIMITED_COMPANY', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        `${token}org`, token.slice(0, 32),
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "PartnerProfile"
          ("id", "organizationId", "partnerCode", "status", "approvedAt", "createdAt", "updatedAt")
         VALUES ($1, $2, 'PAR-99999999', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        `${token}profile`, `${token}org`,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "PartnerAgreement"
          ("id", "agreementNumber", "partnerProfileId", "status", "startsAt", "createdAt", "updatedAt")
         VALUES ($1, 'AGR-99999999', $2, 'PENDING_APPROVAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        `${token}agreement`, `${token}profile`,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "PartnerAgreementVersion"
          ("id", "agreementId", "versionNumber", "status", "minimumSettlement", "currency", "createdAt")
         VALUES ($1, $2, 1, 'PENDING_APPROVAL', 0, 'BDT', CURRENT_TIMESTAMP)`,
        `${token}version`, `${token}agreement`,
      );
      await tx.$executeRawUnsafe(
        `UPDATE "PartnerAgreementVersion" SET "minimumSettlement" = 1 WHERE "id" = $1`,
        `${token}version`,
      );
      throw rollback;
    });
  } catch (error) {
    if (error === rollback) return false;
    if (String(error).toLowerCase().includes("immutable")) return true;
    throw error;
  }
  return false;
}

try {
  const [migration, foundTables, foundConstraints, foundIndexes, foundTriggers, foundSequences, foundPermissions] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT "migration_name" AS name FROM "_prisma_migrations"
       WHERE "migration_name" = ANY($1::text[])
         AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`,
      migrationNames,
    ),
    prisma.$queryRawUnsafe(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`, tables,
    ),
    prisma.$queryRawUnsafe(
      `SELECT conname AS name, convalidated AS validated FROM pg_constraint
       WHERE conname = ANY($1::text[])`, constraints,
    ),
    prisma.$queryRawUnsafe(
      `SELECT indexname AS name FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = ANY($1::text[])`, indexes,
    ),
    prisma.$queryRawUnsafe(
      `SELECT tgname AS name FROM pg_trigger
       WHERE NOT tgisinternal AND tgname = ANY($1::text[])`, triggers,
    ),
    prisma.$queryRawUnsafe(
      `SELECT sequence_name AS name FROM information_schema.sequences
       WHERE sequence_schema = 'public' AND sequence_name = ANY($1::text[])`, sequences,
    ),
    prisma.$queryRawUnsafe(
      `SELECT key AS name FROM "Permission" WHERE key = ANY($1::text[])`, permissions,
    ),
  ]);
  const immutable = await verifySubmittedTermsImmutability();
  const missing = [];
  for (const name of migrationNames) {
    if (!migration.some((row) => row.name === name)) missing.push(`migration ${name}`);
  }
  for (const name of tables) if (!foundTables.some((row) => row.name === name)) missing.push(`table ${name}`);
  for (const name of constraints) {
    const constraint = foundConstraints.find((row) => row.name === name);
    if (!constraint?.validated) missing.push(`validated constraint ${name}`);
  }
  for (const name of indexes) if (!foundIndexes.some((row) => row.name === name)) missing.push(`index ${name}`);
  for (const name of triggers) if (!foundTriggers.some((row) => row.name === name)) missing.push(`trigger ${name}`);
  for (const name of sequences) if (!foundSequences.some((row) => row.name === name)) missing.push(`sequence ${name}`);
  for (const name of permissions) if (!foundPermissions.some((row) => row.name === name)) missing.push(`permission ${name}`);
  if (!immutable) missing.push("enforced submitted agreement immutability behavior");

  if (missing.length) {
    console.error("Partner agreement database verification failed:");
    for (const item of missing) console.error(`- Missing ${item}`);
    process.exitCode = 1;
  } else {
    console.log("Partner agreement database verification passed.");
    console.log(`Verified ${migrationNames.length} migrations, ${tables.length} tables, ${constraints.length} constraints, ${indexes.length} partial indexes, ${triggers.length} triggers, ${sequences.length} sequences, ${permissions.length} permissions, and live immutability behavior.`);
  }
} finally {
  await prisma.$disconnect();
}
