import "server-only";

import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import {
  deleteTypesenseDocument,
  typesenseSearchEnabled,
  upsertTypesenseDocuments,
} from "@/lib/search/typesense";

type ClaimedRow = {
  id: bigint;
  entityId: string;
  action: string;
  attempts: number;
};

function stockFor(product: { type: string; bundleStockLimit: number | null; variants: Array<{ stock: number }> }) {
  if (product.type === "DIGITAL" || product.type === "SERVICE") return 1;
  if (product.type === "BUNDLE") return Math.max(0, product.bundleStockLimit ?? 0);
  return product.variants.reduce((sum, variant) => sum + Math.max(0, variant.stock), 0);
}

export async function enqueueFullSearchReindex() {
  return prisma.$executeRaw(Prisma.sql`
    INSERT INTO "SearchIndexOutbox" (
      "dedupeKey", "entityType", "entityId", "action", "status",
      "attempts", "nextAttemptAt", "createdAt", "updatedAt"
    )
    SELECT
      'product:' || p."id"::text, 'PRODUCT', p."id"::text, 'UPSERT', 'PENDING',
      0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM "Product" p
    ON CONFLICT ("dedupeKey") DO UPDATE SET
      "action" = 'UPSERT', "status" = 'PENDING', "attempts" = 0,
      "nextAttemptAt" = CURRENT_TIMESTAMP, "processedAt" = NULL,
      "lastError" = NULL, "updatedAt" = CURRENT_TIMESTAMP
  `);
}

export async function processSearchIndexOutbox() {
  if (!typesenseSearchEnabled()) {
    return { configured: false, claimed: 0, processed: 0, failed: 0 };
  }
  const requested = Number(process.env.SEARCH_INDEX_BATCH_SIZE ?? 100);
  const limit = Number.isInteger(requested) ? Math.max(1, Math.min(250, requested)) : 100;
  const rows = await prisma.$transaction((tx) => tx.$queryRaw<ClaimedRow[]>(Prisma.sql`
    WITH picked AS (
      SELECT "id"
      FROM "SearchIndexOutbox"
      WHERE "status" = 'PENDING' AND "nextAttemptAt" <= CURRENT_TIMESTAMP
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE "SearchIndexOutbox" o
    SET "status" = 'PROCESSING', "updatedAt" = CURRENT_TIMESTAMP
    FROM picked
    WHERE o."id" = picked."id"
    RETURNING o."id", o."entityId", o."action", o."attempts"
  `));
  if (!rows.length) return { configured: true, claimed: 0, processed: 0, failed: 0 };

  const productIds = Array.from(new Set(rows.map((row) => Number(row.entityId)).filter(Number.isInteger)));
  try {
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true, name: true, slug: true, sku: true, basePrice: true,
        soldCount: true, ratingAvg: true, available: true, deleted: true,
        type: true, bundleStockLimit: true, updatedAt: true,
        brand: { select: { name: true } },
        category: { select: { name: true, slug: true } },
        variants: { where: { active: true }, select: { sku: true, stock: true } },
        attributes: { select: { value: true, attribute: { select: { name: true } } } },
      },
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    const documents = rows.flatMap((row) => {
      const product = productById.get(Number(row.entityId));
      if (!product || product.deleted || row.action === "DELETE") return [];
      return [{
        id: String(product.id),
        productId: product.id,
        name: product.name,
        slug: product.slug,
        sku: product.sku ?? undefined,
        variantSkus: product.variants.map((variant) => variant.sku),
        brand: product.brand?.name ?? undefined,
        category: product.category.name,
        categorySlug: product.category.slug,
        attributes: product.attributes.flatMap((item) => [item.attribute.name, item.value]),
        price: Number(product.basePrice),
        stock: stockFor(product),
        soldCount: product.soldCount,
        ratingAvg: product.ratingAvg,
        available: product.available,
        deleted: product.deleted,
        updatedAt: product.updatedAt.getTime(),
      }];
    });
    await upsertTypesenseDocuments(documents);
    for (const row of rows) {
      const product = productById.get(Number(row.entityId));
      if (!product || product.deleted || row.action === "DELETE") {
        await deleteTypesenseDocument(Number(row.entityId));
      }
    }
    await prisma.searchIndexOutbox.updateMany({
      where: { id: { in: rows.map((row) => row.id) }, status: "PROCESSING" },
      data: { status: "PROCESSED", processedAt: new Date(), lastError: null },
    });
    return { configured: true, claimed: rows.length, processed: rows.length, failed: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2_000) : "Unknown indexing error";
    await Promise.all(rows.map((row) => {
      const attempts = row.attempts + 1;
      return prisma.searchIndexOutbox.update({
        where: { id: row.id },
        data: {
          status: attempts >= 8 ? "FAILED" : "PENDING",
          attempts,
          nextAttemptAt: new Date(Date.now() + Math.min(60 * 60_000, 2 ** attempts * 5_000)),
          lastError: message,
        },
      });
    }));
    console.error("Search index batch failed", error);
    return { configured: true, claimed: rows.length, processed: 0, failed: rows.length };
  }
}
