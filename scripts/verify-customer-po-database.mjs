import "dotenv/config";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

const migrationNames = [
  "20260826_m7_customer_po_order_integration",
  "20260826_m7_commercial_snapshot_hardening",
  "20260826_m7_financial_snapshot_hardening",
];
const requiredConstraints = [
  "CustomerPurchaseOrder_number_check",
  "CustomerPurchaseOrder_file_check",
  "CustomerPurchaseOrder_currency_check",
  "CustomerPurchaseOrder_amount_check",
  "CustomerPurchaseOrder_delivery_check",
  "CustomerPurchaseOrder_lifecycle_check",
];
const requiredIndexes = [
  "CustomerPurchaseOrder_organizationId_customerPoNumber_key",
  "CustomerPurchaseOrder_active_quotation_idx",
  "Order_organizationId_order_date_idx",
  "Order_salesChannel_order_date_idx",
];
const requiredTriggers = [
  "CustomerPurchaseOrder_lifecycle_guard",
  "CustomerPurchaseOrder_review_metadata_immutable",
  "Order_corporate_context_immutable",
  "OrderItem_business_snapshot_immutable",
];
const requiredPermissions = [
  "business.customer_po.view",
  "business.customer_po.verify",
  "business.customer_po.convert",
];
const requiredOrderColumns = [
  "organizationId",
  "salesChannel",
  "salesQuotationVersionId",
  "commercialContext",
];
const requiredOrderItemColumns = [
  "priceSource",
  "publicUnitPriceSnapshot",
  "businessDiscountSnapshot",
];

async function verifySubmittedSourceImmutability() {
  const token = `m7verify${Date.now()}`;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO "Organization"
          ("id", "code", "legalName", "companyType", "status", "createdAt", "updatedAt")
         VALUES ($1, $2, 'M7 verifier', 'LIMITED_COMPANY', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        `${token}org`, token.slice(0, 32),
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "CustomerPurchaseOrder"
          ("id", "organizationId", "customerPoNumber", "fileUrl", "currency", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, '/upload/m7-verifier.pdf', 'BDT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        `${token}po`, `${token}org`, token,
      );
      await tx.$executeRawUnsafe(
        `UPDATE "CustomerPurchaseOrder" SET "fileUrl" = '/upload/changed.pdf' WHERE "id" = $1`,
        `${token}po`,
      );
    });
  } catch (error) {
    if (String(error).toLowerCase().includes("immutable")) return true;
    throw error;
  }
  return false;
}

try {
  const [migration, table, constraints, indexes, triggers, permissions, orderColumns, itemColumns] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT "migration_name" AS name FROM "_prisma_migrations"
       WHERE "migration_name" = ANY($1::text[])
         AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`,
      migrationNames,
    ),
    prisma.$queryRawUnsafe(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'CustomerPurchaseOrder'`,
    ),
    prisma.$queryRawUnsafe(
      `SELECT conname AS name, convalidated AS validated FROM pg_constraint
       WHERE conname = ANY($1::text[])`,
      requiredConstraints,
    ),
    prisma.$queryRawUnsafe(
      `SELECT indexname AS name FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = ANY($1::text[])`,
      requiredIndexes,
    ),
    prisma.$queryRawUnsafe(
      `SELECT tgname AS name FROM pg_trigger
       WHERE NOT tgisinternal AND tgname = ANY($1::text[])`,
      requiredTriggers,
    ),
    prisma.$queryRawUnsafe(
      `SELECT key AS name FROM "Permission" WHERE key = ANY($1::text[])`,
      requiredPermissions,
    ),
    prisma.$queryRawUnsafe(
      `SELECT column_name AS name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'Order' AND column_name = ANY($1::text[])`,
      requiredOrderColumns,
    ),
    prisma.$queryRawUnsafe(
      `SELECT column_name AS name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'OrderItem' AND column_name = ANY($1::text[])`,
      requiredOrderItemColumns,
    ),
  ]);
  const sourceImmutable = await verifySubmittedSourceImmutability();
  const missing = [];
  for (const name of migrationNames) {
    if (!migration.some((row) => row.name === name)) missing.push(`migration ${name}`);
  }
  if (!table.length) missing.push("table CustomerPurchaseOrder");
  for (const name of requiredConstraints) {
    const constraint = constraints.find((row) => row.name === name);
    if (!constraint?.validated) missing.push(`validated constraint ${name}`);
  }
  for (const name of requiredIndexes) if (!indexes.some((row) => row.name === name)) missing.push(`index ${name}`);
  for (const name of requiredTriggers) if (!triggers.some((row) => row.name === name)) missing.push(`trigger ${name}`);
  for (const name of requiredPermissions) if (!permissions.some((row) => row.name === name)) missing.push(`permission ${name}`);
  for (const name of requiredOrderColumns) if (!orderColumns.some((row) => row.name === name)) missing.push(`Order column ${name}`);
  for (const name of requiredOrderItemColumns) if (!itemColumns.some((row) => row.name === name)) missing.push(`OrderItem column ${name}`);
  if (!sourceImmutable) missing.push("enforced submitted PO source immutability behavior");

  if (missing.length) {
    console.error("Customer PO database verification failed:");
    for (const item of missing) console.error(`- Missing ${item}`);
    process.exitCode = 1;
  } else {
    console.log("Customer PO database verification passed.");
    console.log(`Verified ${migrationNames.length} migrations, 1 table, ${requiredConstraints.length} constraints, ${requiredIndexes.length} indexes, ${requiredTriggers.length} triggers, ${requiredPermissions.length} permissions, Order/OrderItem integration columns, and live immutability behavior.`);
  }
} finally {
  await prisma.$disconnect();
}
