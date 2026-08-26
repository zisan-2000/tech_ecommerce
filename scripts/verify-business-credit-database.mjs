import "dotenv/config";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

const requiredMigrations = [
  "20260826_m4_corporate_credit",
  "20260826_m4_credit_ledger_immutability",
  "20260826_m4_credit_source_pair_hardening",
];
const requiredTables = ["OrganizationCreditAccount", "CreditLedgerEntry"];
const requiredConstraints = [
  "OrganizationCreditAccount_credit_values_check",
  "OrganizationCreditAccount_currency_check",
  "OrganizationCreditAccount_payment_terms_check",
  "CreditLedgerEntry_amount_check",
  "CreditLedgerEntry_currency_check",
  "CreditLedgerEntry_source_pair_check",
  "CreditLedgerEntry_direction_check",
];
const requiredPermissions = [
  "business.credit.view",
  "business.credit.manage",
  "business.credit.adjust",
];

try {
  const [migrations, tables, constraints, triggers, permissions] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT "migration_name" AS name
       FROM "_prisma_migrations"
       WHERE "finished_at" IS NOT NULL
         AND "rolled_back_at" IS NULL
         AND "migration_name" = ANY($1::text[])`,
      requiredMigrations,
    ),
    prisma.$queryRawUnsafe(
      `SELECT table_name AS name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
      requiredTables,
    ),
    prisma.$queryRawUnsafe(
      `SELECT conname AS name, convalidated AS validated
       FROM pg_constraint
       WHERE conname = ANY($1::text[])`,
      requiredConstraints,
    ),
    prisma.$queryRawUnsafe(
      `SELECT tgname AS name
       FROM pg_trigger
       WHERE NOT tgisinternal
         AND tgname = 'CreditLedgerEntry_immutable_trigger'`,
    ),
    prisma.$queryRawUnsafe(
      `SELECT key AS name
       FROM "Permission"
       WHERE key = ANY($1::text[])`,
      requiredPermissions,
    ),
  ]);

  const missing = [];
  const migrationNames = new Set(migrations.map((row) => row.name));
  const tableNames = new Set(tables.map((row) => row.name));
  const permissionNames = new Set(permissions.map((row) => row.name));
  for (const name of requiredMigrations) if (!migrationNames.has(name)) missing.push(`migration ${name}`);
  for (const name of requiredTables) if (!tableNames.has(name)) missing.push(`table public.${name}`);
  for (const name of requiredConstraints) {
    const constraint = constraints.find((row) => row.name === name);
    if (!constraint?.validated) missing.push(`validated constraint ${name}`);
  }
  for (const name of requiredPermissions) if (!permissionNames.has(name)) missing.push(`permission ${name}`);
  if (triggers.length === 0) missing.push("trigger CreditLedgerEntry_immutable_trigger");

  if (missing.length > 0) {
    console.error("Corporate credit database verification failed:");
    for (const item of missing) console.error(`- Missing ${item}`);
    process.exitCode = 1;
  } else {
    console.log("Corporate credit database verification passed.");
    console.log(`Verified ${requiredMigrations.length} migrations, ${requiredTables.length} tables, ${requiredConstraints.length} constraints, 1 immutable-ledger trigger, and ${requiredPermissions.length} permissions.`);
  }
} finally {
  await prisma.$disconnect();
}
