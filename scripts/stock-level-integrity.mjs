import nextEnv from "@next/env";
import { PrismaClient } from "../generated/prisma/index.js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const APPLY_CONFIRMATION = "BACKFILL_STOCK_LEVELS";
const SAMPLE_LIMIT = 25;
const prisma = new PrismaClient();

function parseArgs(argv) {
  const values = new Map();
  const flags = new Set();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const separator = arg.indexOf("=");
    if (separator === -1) flags.add(arg);
    else values.set(arg.slice(0, separator), arg.slice(separator + 1));
  }

  const warehouseRaw = values.get("--warehouse-id");
  const warehouseId = warehouseRaw === undefined ? null : Number(warehouseRaw);
  if (
    warehouseRaw !== undefined &&
    (!Number.isInteger(warehouseId) || warehouseId < 1)
  ) {
    throw new Error("--warehouse-id must be a positive integer");
  }

  return {
    apply: flags.has("--apply"),
    json: flags.has("--json"),
    warehouseId,
    confirmation: values.get("--confirm") ?? null,
  };
}

function asCount(rows) {
  return Number(rows[0]?.count ?? 0);
}

async function count(query) {
  return asCount(await prisma.$queryRawUnsafe(query));
}

async function auditStockLevels() {
  const [
    warehouses,
    physicalVariantCount,
    missingStockLevelCount,
    invalidStockLevelCount,
    negativeLegacyStockCount,
    aggregateMismatchCount,
    nonPhysicalStockLevelCount,
  ] = await Promise.all([
    prisma.warehouse.findMany({
      select: { id: true, code: true, name: true, isDefault: true },
      orderBy: { id: "asc" },
    }),
    count(`
      SELECT COUNT(*)::int AS "count"
      FROM "ProductVariant" pv
      INNER JOIN "Product" p ON p."id" = pv."productId"
      WHERE p."type" = 'PHYSICAL'
    `),
    count(`
      SELECT COUNT(*)::int AS "count"
      FROM "ProductVariant" pv
      INNER JOIN "Product" p ON p."id" = pv."productId"
      WHERE p."type" = 'PHYSICAL'
        AND NOT EXISTS (
          SELECT 1 FROM "StockLevel" sl
          WHERE sl."productVariantId" = pv."id"
        )
    `),
    count(`
      SELECT COUNT(*)::int AS "count"
      FROM "StockLevel" sl
      WHERE sl."quantity" < 0
         OR sl."reserved" < 0
         OR sl."reserved" > sl."quantity"
    `),
    count(`
      SELECT COUNT(*)::int AS "count"
      FROM "ProductVariant" pv
      INNER JOIN "Product" p ON p."id" = pv."productId"
      WHERE p."type" = 'PHYSICAL' AND pv."stock" < 0
    `),
    count(`
      WITH totals AS (
        SELECT
          sl."productVariantId",
          SUM(GREATEST(sl."quantity" - sl."reserved", 0))::int AS available
        FROM "StockLevel" sl
        GROUP BY sl."productVariantId"
      )
      SELECT COUNT(*)::int AS "count"
      FROM "ProductVariant" pv
      INNER JOIN "Product" p ON p."id" = pv."productId"
      INNER JOIN totals t ON t."productVariantId" = pv."id"
      WHERE p."type" = 'PHYSICAL' AND pv."stock" <> t.available
    `),
    count(`
      SELECT COUNT(*)::int AS "count"
      FROM "StockLevel" sl
      INNER JOIN "ProductVariant" pv ON pv."id" = sl."productVariantId"
      INNER JOIN "Product" p ON p."id" = pv."productId"
      WHERE p."type" <> 'PHYSICAL'
    `),
  ]);

  const [missingSamples, invalidSamples, mismatchSamples] = await Promise.all([
    prisma.$queryRawUnsafe(`
      SELECT
        pv."id" AS "variantId",
        pv."sku" AS "variantSku",
        pv."stock" AS "legacyStock",
        p."id" AS "productId",
        p."name" AS "productName",
        p."available" AS "productAvailable",
        p."deleted" AS "productDeleted"
      FROM "ProductVariant" pv
      INNER JOIN "Product" p ON p."id" = pv."productId"
      WHERE p."type" = 'PHYSICAL'
        AND NOT EXISTS (
          SELECT 1 FROM "StockLevel" sl
          WHERE sl."productVariantId" = pv."id"
        )
      ORDER BY pv."id" ASC
      LIMIT ${SAMPLE_LIMIT}
    `),
    prisma.$queryRawUnsafe(`
      SELECT
        sl."id" AS "stockLevelId",
        sl."warehouseId",
        w."code" AS "warehouseCode",
        sl."productVariantId" AS "variantId",
        pv."sku" AS "variantSku",
        sl."quantity",
        sl."reserved"
      FROM "StockLevel" sl
      INNER JOIN "Warehouse" w ON w."id" = sl."warehouseId"
      INNER JOIN "ProductVariant" pv ON pv."id" = sl."productVariantId"
      WHERE sl."quantity" < 0
         OR sl."reserved" < 0
         OR sl."reserved" > sl."quantity"
      ORDER BY sl."id" ASC
      LIMIT ${SAMPLE_LIMIT}
    `),
    prisma.$queryRawUnsafe(`
      WITH totals AS (
        SELECT
          sl."productVariantId",
          SUM(GREATEST(sl."quantity" - sl."reserved", 0))::int AS available
        FROM "StockLevel" sl
        GROUP BY sl."productVariantId"
      )
      SELECT
        pv."id" AS "variantId",
        pv."sku" AS "variantSku",
        pv."stock" AS "legacyStock",
        t.available AS "warehouseAvailable"
      FROM "ProductVariant" pv
      INNER JOIN "Product" p ON p."id" = pv."productId"
      INNER JOIN totals t ON t."productVariantId" = pv."id"
      WHERE p."type" = 'PHYSICAL' AND pv."stock" <> t.available
      ORDER BY pv."id" ASC
      LIMIT ${SAMPLE_LIMIT}
    `),
  ]);

  const defaultWarehouses = warehouses.filter((warehouse) => warehouse.isDefault);
  const blockingIssues = [];
  if (warehouses.length === 0) blockingIssues.push("NO_WAREHOUSE");
  if (defaultWarehouses.length === 0) blockingIssues.push("NO_DEFAULT_WAREHOUSE");
  if (defaultWarehouses.length > 1) blockingIssues.push("MULTIPLE_DEFAULT_WAREHOUSES");
  if (invalidStockLevelCount > 0) blockingIssues.push("INVALID_STOCK_LEVEL_ROWS");
  if (negativeLegacyStockCount > 0) blockingIssues.push("NEGATIVE_LEGACY_STOCK");
  if (nonPhysicalStockLevelCount > 0) blockingIssues.push("NON_PHYSICAL_STOCK_LEVEL_ROWS");

  const readyForStrictWarehouseStock =
    blockingIssues.length === 0 &&
    missingStockLevelCount === 0 &&
    aggregateMismatchCount === 0;

  return {
    generatedAt: new Date().toISOString(),
    warehouses,
    defaultWarehouseIds: defaultWarehouses.map((warehouse) => warehouse.id),
    counts: {
      physicalVariants: physicalVariantCount,
      missingStockLevels: missingStockLevelCount,
      invalidStockLevels: invalidStockLevelCount,
      negativeLegacyStock: negativeLegacyStockCount,
      aggregateMismatches: aggregateMismatchCount,
      nonPhysicalStockLevels: nonPhysicalStockLevelCount,
    },
    blockingIssues,
    readyForStrictWarehouseStock,
    samples: {
      missingStockLevels: missingSamples,
      invalidStockLevels: invalidSamples,
      aggregateMismatches: mismatchSamples,
    },
  };
}

async function resolveTargetWarehouse(audit, requestedWarehouseId) {
  if (requestedWarehouseId !== null) {
    const requested = audit.warehouses.find(
      (warehouse) => warehouse.id === requestedWarehouseId,
    );
    if (!requested) {
      throw new Error(`Warehouse ${requestedWarehouseId} does not exist`);
    }
    return requested;
  }

  if (audit.defaultWarehouseIds.length !== 1) {
    throw new Error(
      "Exactly one default warehouse is required unless --warehouse-id is supplied",
    );
  }

  return audit.warehouses.find(
    (warehouse) => warehouse.id === audit.defaultWarehouseIds[0],
  );
}

async function applyBackfill(targetWarehouseId) {
  return prisma.$transaction(
    async (tx) => {
      const inserted = await tx.$executeRawUnsafe(
        `
          INSERT INTO "StockLevel"
            ("warehouseId", "productVariantId", "quantity", "reserved", "createdAt", "updatedAt")
          SELECT
            $1,
            pv."id",
            GREATEST(pv."stock", 0),
            0,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          FROM "ProductVariant" pv
          INNER JOIN "Product" p ON p."id" = pv."productId"
          WHERE p."type" = 'PHYSICAL'
            AND NOT EXISTS (
              SELECT 1 FROM "StockLevel" sl
              WHERE sl."productVariantId" = pv."id"
            )
          ON CONFLICT ("warehouseId", "productVariantId") DO NOTHING
        `,
        targetWarehouseId,
      );

      const reconciled = await tx.$executeRawUnsafe(`
        WITH totals AS (
          SELECT
            sl."productVariantId",
            SUM(GREATEST(sl."quantity" - sl."reserved", 0))::int AS available
          FROM "StockLevel" sl
          GROUP BY sl."productVariantId"
        )
        UPDATE "ProductVariant" pv
        SET "stock" = totals.available
        FROM totals, "Product" p
        WHERE pv."id" = totals."productVariantId"
          AND p."id" = pv."productId"
          AND p."type" = 'PHYSICAL'
          AND pv."stock" <> totals.available
      `);

      return {
        insertedStockLevels: inserted,
        reconciledVariantStocks: reconciled,
      };
    },
    { maxWait: 10_000, timeout: 120_000 },
  );
}

function printReport(label, audit, json) {
  if (json) {
    console.log(JSON.stringify({ label, ...audit }, null, 2));
    return;
  }

  console.log(`\n[stock-integrity] ${label}`);
  console.log(`physical variants: ${audit.counts.physicalVariants}`);
  console.log(`missing StockLevel rows: ${audit.counts.missingStockLevels}`);
  console.log(`invalid StockLevel rows: ${audit.counts.invalidStockLevels}`);
  console.log(`negative legacy stock rows: ${audit.counts.negativeLegacyStock}`);
  console.log(`aggregate mismatches: ${audit.counts.aggregateMismatches}`);
  console.log(`non-physical StockLevel rows: ${audit.counts.nonPhysicalStockLevels}`);
  console.log(`default warehouse ids: ${audit.defaultWarehouseIds.join(", ") || "none"}`);
  console.log(`blocking issues: ${audit.blockingIssues.join(", ") || "none"}`);
  console.log(
    `ready for strict warehouse stock: ${audit.readyForStrictWarehouseStock ? "yes" : "no"}`,
  );
  if (audit.samples.missingStockLevels.length) {
    console.log("missing samples:", audit.samples.missingStockLevels);
  }
  if (audit.samples.invalidStockLevels.length) {
    console.log("invalid level samples:", audit.samples.invalidStockLevels);
  }
  if (audit.samples.aggregateMismatches.length) {
    console.log("mismatch samples:", audit.samples.aggregateMismatches);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const before = await auditStockLevels();
  printReport(args.apply ? "pre-apply audit" : "dry-run audit", before, args.json);

  if (!args.apply) {
    if (!before.readyForStrictWarehouseStock) process.exitCode = 2;
    return;
  }

  if (args.confirmation !== APPLY_CONFIRMATION) {
    throw new Error(
      `Refusing write: pass --confirm=${APPLY_CONFIRMATION} together with --apply`,
    );
  }

  if (before.counts.invalidStockLevels > 0) {
    throw new Error(
      "Refusing backfill while invalid StockLevel rows exist; repair quantity/reserved integrity first",
    );
  }
  if (before.counts.negativeLegacyStock > 0) {
    throw new Error(
      "Refusing backfill while negative ProductVariant.stock values exist; correct those rows first",
    );
  }
  if (before.counts.nonPhysicalStockLevels > 0) {
    throw new Error(
      "Refusing backfill while non-physical products have StockLevel rows; audit those rows first",
    );
  }

  const target = await resolveTargetWarehouse(before, args.warehouseId);
  const result = await applyBackfill(target.id);
  if (!args.json) {
    console.log(
      `[stock-integrity] applied to warehouse ${target.id} (${target.code}):`,
      result,
    );
  }

  const after = await auditStockLevels();
  printReport("post-apply audit", after, args.json);
  if (!after.readyForStrictWarehouseStock) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error("[stock-integrity] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
