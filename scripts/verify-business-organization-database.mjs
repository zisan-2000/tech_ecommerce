import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

const migrationName = "20260831_m1_organization_identifier_uniqueness";
const triggerName = "Organization_identifier_uniqueness_trigger";
const indexNames = [
  "Organization_tradeLicenseNo_normalized_idx",
  "Organization_tin_normalized_idx",
  "Organization_bin_normalized_idx",
];
const rollbackMessage = "ROLLBACK_ORGANIZATION_IDENTIFIER_VERIFICATION";

try {
  const [migration, trigger, indexes] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT migration_name AS name
       FROM _prisma_migrations
       WHERE migration_name = $1
         AND finished_at IS NOT NULL
         AND rolled_back_at IS NULL`,
      migrationName,
    ),
    prisma.$queryRawUnsafe(
      `SELECT tgname AS name
       FROM pg_trigger
       WHERE tgname = $1
         AND NOT tgisinternal`,
      triggerName,
    ),
    prisma.$queryRawUnsafe(
      `SELECT indexname AS name
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname = ANY($1::text[])`,
      indexNames,
    ),
  ]);

  const missing = [];
  if (migration.length !== 1) missing.push(`migration ${migrationName}`);
  if (trigger.length !== 1) missing.push(`trigger ${triggerName}`);
  const foundIndexes = new Set(indexes.map((row) => row.name));
  for (const name of indexNames) if (!foundIndexes.has(name)) missing.push(`index ${name}`);
  if (missing.length > 0) throw new Error(`Missing database protection: ${missing.join(", ")}`);

  const token = randomUUID().replaceAll("-", "").toUpperCase();
  const base = {
    id: `verify-org-${token}`,
    code: `V${token.slice(0, 31)}`,
    legalName: "Organization identifier verification fixture",
    companyType: "LIMITED_COMPANY",
    tradeLicenseNo: `TL-VERIFY-${token}`,
    tin: `TIN-VERIFY-${token}`,
    bin: `BIN-VERIFY-${token}`,
  };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.organization.create({ data: base });

      // Each sub-block must observe a unique_violation. A P0001 error escapes
      // the block and fails this verifier if the database accepted a duplicate.
      await tx.$executeRawUnsafe(`
        DO $verify$
        BEGIN
          BEGIN
            INSERT INTO "Organization" ("id", "code", "legalName", "companyType", "tradeLicenseNo", "updatedAt")
            VALUES ('verify-trade-${token}', 'VT${token.slice(0, 30)}', 'Duplicate trade fixture', 'LIMITED_COMPANY', 'tl verify ${token.toLowerCase()}', CURRENT_TIMESTAMP);
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Duplicate Trade License was accepted';
          EXCEPTION WHEN unique_violation THEN NULL;
          END;

          BEGIN
            INSERT INTO "Organization" ("id", "code", "legalName", "companyType", "tin", "updatedAt")
            VALUES ('verify-tin-${token}', 'VI${token.slice(0, 30)}', 'Duplicate TIN fixture', 'LIMITED_COMPANY', 'tin verify ${token.toLowerCase()}', CURRENT_TIMESTAMP);
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Duplicate TIN was accepted';
          EXCEPTION WHEN unique_violation THEN NULL;
          END;

          BEGIN
            INSERT INTO "Organization" ("id", "code", "legalName", "companyType", "bin", "updatedAt")
            VALUES ('verify-bin-${token}', 'VB${token.slice(0, 30)}', 'Duplicate BIN fixture', 'LIMITED_COMPANY', 'bin verify ${token.toLowerCase()}', CURRENT_TIMESTAMP);
            RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Duplicate BIN was accepted';
          EXCEPTION WHEN unique_violation THEN NULL;
          END;
        END
        $verify$;
      `);

      throw new Error(rollbackMessage);
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== rollbackMessage) throw error;
  }

  console.log("Organization identifier database verification passed.");
  console.log("Verified normalized Trade License, TIN, and BIN duplicate rejection with rollback-safe fixtures.");
} finally {
  await prisma.$disconnect();
}
