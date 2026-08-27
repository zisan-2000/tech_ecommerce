import "dotenv/config";
import { randomInt, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

const migrationNames = [
  "20260827_m9_referral_attribution_leads",
  "20260827_m9_attribution_identity_hardening",
];
const tables = ["PartnerAsset", "PartnerAttribution", "PartnerLead"];
const constraints = [
  "PartnerAsset_code_check",
  "PartnerAsset_destination_check",
  "PartnerAsset_campaign_check",
  "PartnerAsset_dates_check",
  "PartnerAttribution_identity_check",
  "PartnerAttribution_dates_check",
  "PartnerAttribution_lifecycle_check",
  "PartnerAttribution_customerUserId_fkey",
  "PartnerLead_number_check",
  "PartnerLead_company_check",
  "PartnerLead_contact_check",
  "PartnerLead_contact_method_check",
  "PartnerLead_email_check",
  "PartnerLead_phone_check",
  "PartnerLead_requirement_check",
  "PartnerLead_value_check",
  "PartnerLead_currency_check",
  "PartnerLead_ownership_check",
  "PartnerLead_lifecycle_check",
];
const indexes = ["PartnerAttribution_one_active_visitor_idx", "PartnerAttribution_one_active_session_idx"];
const triggers = [
  "PartnerAsset_lifecycle_guard",
  "PartnerAttribution_scope_lifecycle_guard",
  "PartnerLead_lifecycle_guard",
];
const sequences = ["PartnerLeadNumber_seq"];
const permissions = ["partner.lead.view", "partner.lead.manage", "partner.lead.assign"];

function verificationIdentity() {
  const digits = String(randomInt(1, 99_999_999)).padStart(8, "0");
  const token = randomUUID().replaceAll("-", "");
  return {
    token,
    organizationId: `${token}org`,
    profileId: `${token}profile`,
    agreementId: `${token}agreement`,
    versionId: `${token}version`,
    assetId: `${token}asset`,
    attributionId: `${token}attribution`,
    leadId: `${token}lead`,
    partnerCode: `PAR-${digits}`,
    agreementNumber: `AGR-${digits}`,
    leadNumber: `LEAD-${digits}`,
    assetCode: `VERIFY-${token.slice(0, 16).toUpperCase()}`,
  };
}

async function insertBase(tx, identity, level) {
  await tx.$executeRawUnsafe(
    `INSERT INTO "Organization"
      ("id", "code", "legalName", "companyType", "status", "createdAt", "updatedAt")
     VALUES ($1, $2, 'M9 verifier', 'LIMITED_COMPANY', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    identity.organizationId,
    identity.token.slice(0, 32),
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO "PartnerProfile"
      ("id", "organizationId", "partnerCode", "status", "approvedAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    identity.profileId,
    identity.organizationId,
    identity.partnerCode,
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO "OrganizationCapability"
      ("id", "organizationId", "type", "status", "approvedAt", "createdAt", "updatedAt")
     VALUES ($1, $2, 'AFFILIATE', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    `${identity.token}capability`,
    identity.organizationId,
  );
  if (level === "profile") return;
  await tx.$executeRawUnsafe(
    `INSERT INTO "PartnerAgreement"
      ("id", "agreementNumber", "partnerProfileId", "status", "startsAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    identity.agreementId,
    identity.agreementNumber,
    identity.profileId,
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO "PartnerAgreementVersion"
      ("id", "agreementId", "versionNumber", "status", "approvedById", "approvedAt", "minimumSettlement", "currency", "createdAt")
     VALUES ($1, $2, 1, 'ACTIVE', 'm9-verifier', CURRENT_TIMESTAMP, 0, 'BDT', CURRENT_TIMESTAMP)`,
    identity.versionId,
    identity.agreementId,
  );
  await tx.$executeRawUnsafe(
    `INSERT INTO "PartnerAsset"
      ("id", "partnerProfileId", "type", "status", "code", "destinationPath", "createdAt", "updatedAt")
     VALUES ($1, $2, 'REFERRAL_LINK', 'ACTIVE', $3, '/verify', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    identity.assetId,
    identity.profileId,
    identity.assetCode,
  );
}

async function mutationIsBlocked(label, setup, mutation, expectedMessage) {
  const rollback = new Error(`${label}_UNEXPECTEDLY_ALLOWED`);
  try {
    await prisma.$transaction(async (tx) => {
      const identity = verificationIdentity();
      await setup(tx, identity);
      await mutation(tx, identity);
      throw rollback;
    });
  } catch (error) {
    if (error === rollback) return false;
    if (String(error).toLowerCase().includes(expectedMessage.toLowerCase())) return true;
    throw error;
  }
  return false;
}

async function verifyLiveGuards() {
  const assetImmutable = await mutationIsBlocked(
    "M9_ASSET_IDENTITY",
    (tx, identity) => insertBase(tx, identity, "agreement"),
    (tx, identity) => tx.$executeRawUnsafe(
      `UPDATE "PartnerAsset" SET "code" = 'VERIFY-CHANGED' WHERE "id" = $1`,
      identity.assetId,
    ),
    "asset identity is immutable",
  );
  const attributionImmutable = await mutationIsBlocked(
    "M9_ATTRIBUTION_IDENTITY",
    async (tx, identity) => {
      await insertBase(tx, identity, "agreement");
      await tx.$executeRawUnsafe(
        `INSERT INTO "PartnerAttribution"
          ("id", "partnerProfileId", "agreementVersionId", "assetId", "source", "status", "visitorId", "capturedAt", "expiresAt")
         VALUES ($1, $2, $3, $4, 'REFERRAL_LINK', 'ACTIVE', $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days')`,
        identity.attributionId,
        identity.profileId,
        identity.versionId,
        identity.assetId,
        `visitor-${identity.token}`,
      );
    },
    (tx, identity) => tx.$executeRawUnsafe(
      `UPDATE "PartnerAttribution" SET "visitorId" = 'visitor-changed' WHERE "id" = $1`,
      identity.attributionId,
    ),
    "capture data is immutable",
  );
  const leadLifecycle = await mutationIsBlocked(
    "M9_LEAD_LIFECYCLE",
    async (tx, identity) => {
      await insertBase(tx, identity, "profile");
      await tx.$executeRawUnsafe(
        `INSERT INTO "PartnerLead"
          ("id", "partnerProfileId", "leadNumber", "status", "companyName", "contactName", "contactEmail", "currency", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'SUBMITTED', 'Verifier company', 'Verifier contact', 'verify@example.com', 'BDT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        identity.leadId,
        identity.profileId,
        identity.leadNumber,
      );
    },
    (tx, identity) => tx.$executeRawUnsafe(
      `UPDATE "PartnerLead" SET "status" = 'ACCEPTED' WHERE "id" = $1`,
      identity.leadId,
    ),
    "invalid partner lead status transition",
  );
  return assetImmutable && attributionImmutable && leadLifecycle;
}

try {
  const [migrations, foundTables, foundConstraints, foundIndexes, foundTriggers, foundSequences, foundPermissions] = await Promise.all([
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
  const liveGuards = await verifyLiveGuards();
  const missing = [];
  for (const name of migrationNames) if (!migrations.some((row) => row.name === name)) missing.push(`migration ${name}`);
  for (const name of tables) if (!foundTables.some((row) => row.name === name)) missing.push(`table ${name}`);
  for (const name of constraints) {
    const constraint = foundConstraints.find((row) => row.name === name);
    if (!constraint?.validated) missing.push(`validated constraint ${name}`);
  }
  for (const name of indexes) if (!foundIndexes.some((row) => row.name === name)) missing.push(`index ${name}`);
  for (const name of triggers) if (!foundTriggers.some((row) => row.name === name)) missing.push(`trigger ${name}`);
  for (const name of sequences) if (!foundSequences.some((row) => row.name === name)) missing.push(`sequence ${name}`);
  for (const name of permissions) if (!foundPermissions.some((row) => row.name === name)) missing.push(`permission ${name}`);
  if (!liveGuards) missing.push("live asset, attribution, and lead guard behavior");

  if (missing.length) {
    console.error("Partner referral database verification failed:");
    for (const item of missing) console.error(`- Missing ${item}`);
    process.exitCode = 1;
  } else {
    console.log("Partner referral database verification passed.");
    console.log(`Verified ${tables.length} tables, ${constraints.length} constraints, ${indexes.length} partial indexes, ${triggers.length} triggers, ${sequences.length} sequence, ${permissions.length} permissions, and live rollback-safe guard behavior.`);
  }
} finally {
  await prisma.$disconnect();
}
