import "dotenv/config";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

const requiredTables = ["SalesRfq", "SalesRfqItem", "SalesRfqAttachment"];
const requiredConstraints = [
  "SalesRfq_subject_check",
  "SalesRfq_date_order_check",
  "SalesRfq_lifecycle_timestamps_check",
  "SalesRfqItem_name_check",
  "SalesRfqItem_quantity_check",
  "SalesRfqItem_target_price_check",
  "SalesRfqItem_variant_product_check",
  "SalesRfqAttachment_file_url_check",
];
const requiredPermissions = ["business.rfq.view", "business.rfq.manage", "business.rfq.assign"];

try {
  const [migration, tables, constraints, sequence, permissions] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT "migration_name" AS name FROM "_prisma_migrations"
       WHERE "migration_name" = '20260826_m5_sales_rfq'
         AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`,
    ),
    prisma.$queryRawUnsafe(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      requiredTables,
    ),
    prisma.$queryRawUnsafe(
      `SELECT conname AS name, convalidated AS validated FROM pg_constraint
       WHERE conname = ANY($1::text[])`,
      requiredConstraints,
    ),
    prisma.$queryRawUnsafe(
      `SELECT sequence_name AS name FROM information_schema.sequences
       WHERE sequence_schema = 'public' AND sequence_name = 'SalesRfqNumber_seq'`,
    ),
    prisma.$queryRawUnsafe(
      `SELECT key AS name FROM "Permission" WHERE key = ANY($1::text[])`,
      requiredPermissions,
    ),
  ]);
  const missing = [];
  if (migration.length === 0) missing.push("migration 20260826_m5_sales_rfq");
  const tableNames = new Set(tables.map((row) => row.name));
  for (const name of requiredTables) if (!tableNames.has(name)) missing.push(`table ${name}`);
  for (const name of requiredConstraints) {
    const constraint = constraints.find((row) => row.name === name);
    if (!constraint?.validated) missing.push(`validated constraint ${name}`);
  }
  if (sequence.length === 0) missing.push("sequence SalesRfqNumber_seq");
  const permissionNames = new Set(permissions.map((row) => row.name));
  for (const name of requiredPermissions) if (!permissionNames.has(name)) missing.push(`permission ${name}`);

  if (missing.length > 0) {
    console.error("Sales RFQ database verification failed:");
    for (const item of missing) console.error(`- Missing ${item}`);
    process.exitCode = 1;
  } else {
    console.log("Sales RFQ database verification passed.");
    console.log(`Verified 1 migration, ${requiredTables.length} tables, ${requiredConstraints.length} constraints, 1 sequence, and ${requiredPermissions.length} permissions.`);
  }
} finally {
  await prisma.$disconnect();
}
