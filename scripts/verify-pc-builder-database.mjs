import "dotenv/config";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../generated/prisma");

const prisma = new PrismaClient();

const requiredRelations = [
  "PcBuildCartItem",
  "PcBuildOrderItem",
  "PcBuilderSavedBuild",
];

const requiredMigrations = [
  "20260820_add_pc_build_grouping",
  "20260820_add_pc_builder_saved_builds",
  "20260820_harden_pc_builder_catalog_search",
  "20260820_support_shared_pc_builder_cart_variants",
];

try {
  const [relations, migrationTables, extensions, cartColumns] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT c.relname AS name
       FROM pg_class c
       INNER JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind IN ('r', 'p')
         AND c.relname = ANY($1::text[])`,
      requiredRelations,
    ),
    prisma.$queryRawUnsafe(
      `SELECT table_name AS name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = '_prisma_migrations'`,
    ),
    prisma.$queryRawUnsafe(
      "SELECT extname AS name FROM pg_extension WHERE extname = 'pg_trgm'",
    ),
    prisma.$queryRawUnsafe(
      `SELECT column_name AS name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'CartItem'
         AND column_name = 'lineKey'`,
    ),
  ]);

  const migrations =
    migrationTables.length > 0
      ? await prisma.$queryRawUnsafe(
          `SELECT "migration_name" AS name
           FROM "_prisma_migrations"
           WHERE "finished_at" IS NOT NULL
             AND "rolled_back_at" IS NULL
             AND "migration_name" = ANY($1::text[])`,
          requiredMigrations,
        )
      : [];

  const relationNames = new Set(relations.map((row) => row.name));
  const migrationNames = new Set(migrations.map((row) => row.name));
  const missing = [
    ...requiredRelations
      .filter((name) => !relationNames.has(name))
      .map((name) => `relation public.${name}`),
    ...(migrationTables.length > 0
      ? requiredMigrations
          .filter((name) => !migrationNames.has(name))
          .map((name) => `migration ${name}`)
      : []),
  ];

  if (extensions.length === 0) missing.push("extension pg_trgm");
  if (cartColumns.length === 0) missing.push("column public.CartItem.lineKey");

  if (missing.length > 0) {
    console.error("PC Builder database verification failed:");
    for (const item of missing) console.error(`- Missing ${item}`);
    process.exitCode = 1;
  } else {
    const migrationSummary =
      migrationTables.length > 0
        ? `${requiredMigrations.length} migrations`
        : "live schema objects";
    console.log(
      `PC Builder database is ready (${requiredRelations.length} relations, ${migrationSummary}, pg_trgm, CartItem.lineKey).`,
    );
    if (migrationTables.length === 0) {
      console.warn(
        "Prisma migration history table is absent; readiness was verified from live database objects.",
      );
    }
  }
} catch (error) {
  console.error("PC Builder database verification could not complete:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
