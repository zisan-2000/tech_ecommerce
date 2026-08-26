import "dotenv/config";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

const requiredTables = ["SalesQuotation", "SalesQuotationVersion", "SalesQuotationItem"];
const requiredConstraints = [
  "SalesQuotation_validity_check",
  "SalesQuotation_lifecycle_check",
  "SalesQuotationVersion_number_check",
  "SalesQuotationVersion_currency_check",
  "SalesQuotationVersion_totals_check",
  "SalesQuotationVersion_lifecycle_check",
  "SalesQuotationItem_name_check",
  "SalesQuotationItem_quantity_check",
  "SalesQuotationItem_amounts_check",
  "SalesQuotationItem_variant_product_check",
];
const requiredIndexes = ["SalesQuotationVersion_one_current_idx"];
const requiredTriggers = [
  "SalesQuotationVersion_issued_immutable",
  "SalesQuotationItem_issued_immutable",
];
const requiredPermissions = [
  "business.quotation.view",
  "business.quotation.create",
  "business.quotation.update",
  "business.quotation.approve",
  "business.quotation.send",
];

async function verifyIssuedImmutability(target) {
  const token = `m6verify${Date.now()}${target}`;
  const rollback = new Error("M6_VERIFICATION_ROLLBACK");
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO "Organization"
          ("id", "code", "legalName", "companyType", "status", "createdAt", "updatedAt")
         VALUES ($1, $2, 'M6 verifier', 'LIMITED_COMPANY', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        `${token}org`, token.slice(0, 32),
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "SalesQuotation"
          ("id", "quotationNumber", "organizationId", "status", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'DRAFT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        `${token}quote`, `${token}number`, `${token}org`,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "SalesQuotationVersion"
          ("id", "quotationId", "versionNumber", "status", "isCurrent", "subtotal",
           "discountTotal", "vatTotal", "shippingTotal", "grandTotal", "currency", "createdAt")
         VALUES ($1, $2, 1, 'DRAFT', true, 100, 0, 0, 0, 100, 'BDT', CURRENT_TIMESTAMP)`,
        `${token}version`, `${token}quote`,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "SalesQuotationItem"
          ("id", "quotationVersionId", "productName", "quantity", "unitPrice",
           "discountAmount", "vatAmount", "lineTotal", "createdAt")
         VALUES ($1, $2, 'Verifier item', 1, 100, 0, 0, 100, CURRENT_TIMESTAMP)`,
        `${token}item`, `${token}version`,
      );
      await tx.$executeRawUnsafe(
        `UPDATE "SalesQuotationVersion"
         SET "status" = 'ISSUED', "issuedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        `${token}version`,
      );
      if (target === "version") {
        await tx.$executeRawUnsafe(
          `UPDATE "SalesQuotationVersion"
           SET "subtotal" = 101, "grandTotal" = 101 WHERE "id" = $1`,
          `${token}version`,
        );
      } else {
        await tx.$executeRawUnsafe(
          `UPDATE "SalesQuotationItem"
           SET "unitPrice" = 101, "lineTotal" = 101 WHERE "id" = $1`,
          `${token}item`,
        );
      }
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
  const [migration, tables, constraints, indexes, triggers, sequence, permissions] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT "migration_name" AS name FROM "_prisma_migrations"
       WHERE "migration_name" = '20260826_m6_sales_quotation'
         AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`,
    ),
    prisma.$queryRawUnsafe(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`, requiredTables,
    ),
    prisma.$queryRawUnsafe(
      `SELECT conname AS name, convalidated AS validated FROM pg_constraint
       WHERE conname = ANY($1::text[])`, requiredConstraints,
    ),
    prisma.$queryRawUnsafe(
      `SELECT indexname AS name FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = ANY($1::text[])`, requiredIndexes,
    ),
    prisma.$queryRawUnsafe(
      `SELECT tgname AS name FROM pg_trigger
       WHERE NOT tgisinternal AND tgname = ANY($1::text[])`, requiredTriggers,
    ),
    prisma.$queryRawUnsafe(
      `SELECT sequence_name AS name FROM information_schema.sequences
       WHERE sequence_schema = 'public' AND sequence_name = 'SalesQuotationNumber_seq'`,
    ),
    prisma.$queryRawUnsafe(
      `SELECT key AS name FROM "Permission" WHERE key = ANY($1::text[])`, requiredPermissions,
    ),
  ]);
  const [versionImmutable, itemImmutable] = await Promise.all([
    verifyIssuedImmutability("version"),
    verifyIssuedImmutability("item"),
  ]);
  const missing = [];
  if (migration.length === 0) missing.push("migration 20260826_m6_sales_quotation");
  for (const name of requiredTables) if (!tables.some((row) => row.name === name)) missing.push(`table ${name}`);
  for (const name of requiredConstraints) {
    const constraint = constraints.find((row) => row.name === name);
    if (!constraint?.validated) missing.push(`validated constraint ${name}`);
  }
  for (const name of requiredIndexes) if (!indexes.some((row) => row.name === name)) missing.push(`index ${name}`);
  for (const name of requiredTriggers) if (!triggers.some((row) => row.name === name)) missing.push(`trigger ${name}`);
  if (sequence.length === 0) missing.push("sequence SalesQuotationNumber_seq");
  for (const name of requiredPermissions) if (!permissions.some((row) => row.name === name)) missing.push(`permission ${name}`);
  if (!versionImmutable) missing.push("enforced issued-version immutability behavior");
  if (!itemImmutable) missing.push("enforced issued-item immutability behavior");

  if (missing.length) {
    console.error("Sales quotation database verification failed:");
    for (const item of missing) console.error(`- Missing ${item}`);
    process.exitCode = 1;
  } else {
    console.log("Sales quotation database verification passed.");
    console.log(`Verified 1 migration, ${requiredTables.length} tables, ${requiredConstraints.length} constraints, ${requiredIndexes.length} partial unique index, ${requiredTriggers.length} immutability triggers (including live behavior), 1 sequence, and ${requiredPermissions.length} permissions.`);
  }
} finally {
  await prisma.$disconnect();
}
