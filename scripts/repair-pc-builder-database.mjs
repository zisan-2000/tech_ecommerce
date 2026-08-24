import "dotenv/config";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../generated/prisma");

const prisma = new PrismaClient();

const statements = [
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
  `ALTER TABLE "CartItem"
     ADD COLUMN IF NOT EXISTS "lineKey" VARCHAR(80) NOT NULL DEFAULT 'standard'`,
  `DROP INDEX IF EXISTS "CartItem_userId_productId_variantId_key"`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CartItem_userId_productId_variantId_lineKey_key"
     ON "CartItem"("userId", "productId", "variantId", "lineKey")`,
  `CREATE INDEX IF NOT EXISTS "CartItem_userId_lineKey_idx"
     ON "CartItem"("userId", "lineKey")`,
  `CREATE TABLE IF NOT EXISTS "PcBuildCartItem" (
     "cartItemId" INTEGER NOT NULL,
     "buildId" VARCHAR(64) NOT NULL,
     "slot" VARCHAR(32) NOT NULL,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "PcBuildCartItem_pkey" PRIMARY KEY ("cartItemId"),
     CONSTRAINT "PcBuildCartItem_cartItemId_fkey"
       FOREIGN KEY ("cartItemId") REFERENCES "CartItem"("id")
       ON DELETE CASCADE ON UPDATE CASCADE
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PcBuildCartItem_buildId_slot_key"
     ON "PcBuildCartItem"("buildId", "slot")`,
  `CREATE INDEX IF NOT EXISTS "PcBuildCartItem_buildId_idx"
     ON "PcBuildCartItem"("buildId")`,
  `CREATE TABLE IF NOT EXISTS "PcBuildOrderItem" (
     "orderItemId" INTEGER NOT NULL,
     "orderId" INTEGER NOT NULL,
     "buildId" VARCHAR(64) NOT NULL,
     "slot" VARCHAR(32) NOT NULL,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "PcBuildOrderItem_pkey" PRIMARY KEY ("orderItemId"),
     CONSTRAINT "PcBuildOrderItem_orderItemId_fkey"
       FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id")
       ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT "PcBuildOrderItem_orderId_fkey"
       FOREIGN KEY ("orderId") REFERENCES "Order"("id")
       ON DELETE CASCADE ON UPDATE CASCADE
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PcBuildOrderItem_buildId_slot_key"
     ON "PcBuildOrderItem"("buildId", "slot")`,
  `CREATE INDEX IF NOT EXISTS "PcBuildOrderItem_orderId_buildId_idx"
     ON "PcBuildOrderItem"("orderId", "buildId")`,
  `CREATE TABLE IF NOT EXISTS "PcBuilderSavedBuild" (
     "id" VARCHAR(64) NOT NULL,
     "userId" TEXT NOT NULL,
     "name" VARCHAR(80) NOT NULL,
     "shareToken" VARCHAR(64) NOT NULL,
     "selectionHash" CHAR(64) NOT NULL,
     "selections" JSONB NOT NULL,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "PcBuilderSavedBuild_pkey" PRIMARY KEY ("id"),
     CONSTRAINT "PcBuilderSavedBuild_userId_fkey"
       FOREIGN KEY ("userId") REFERENCES "User"("id")
       ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT "PcBuilderSavedBuild_selections_object_check"
       CHECK (jsonb_typeof("selections") = 'object')
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PcBuilderSavedBuild_shareToken_key"
     ON "PcBuilderSavedBuild"("shareToken")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PcBuilderSavedBuild_userId_selectionHash_key"
     ON "PcBuilderSavedBuild"("userId", "selectionHash")`,
  `CREATE INDEX IF NOT EXISTS "PcBuilderSavedBuild_userId_updatedAt_idx"
     ON "PcBuilderSavedBuild"("userId", "updatedAt" DESC)`,
  `CREATE INDEX IF NOT EXISTS "PcBuilder_Product_name_trgm_idx"
     ON "Product" USING GIN ("name" gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS "PcBuilder_Product_sku_trgm_idx"
     ON "Product" USING GIN ("sku" gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS "PcBuilder_Brand_name_trgm_idx"
     ON "Brand" USING GIN ("name" gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS "PcBuilder_ProductVariant_sku_trgm_idx"
     ON "ProductVariant" USING GIN ("sku" gin_trgm_ops)
     WHERE "active" = true`,
  `CREATE INDEX IF NOT EXISTS "PcBuilder_ProductAttribute_value_trgm_idx"
     ON "ProductAttribute" USING GIN ("value" gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS "PcBuilder_Attribute_name_trgm_idx"
     ON "Attribute" USING GIN ("name" gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS "PcBuilder_Product_catalog_sort_idx"
     ON "Product" ("categoryId", "featured" DESC, "soldCount" DESC, "id" DESC)
     WHERE "deleted" = false
       AND "available" = true
       AND "type" = 'PHYSICAL'`,
];

try {
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  console.log("PC Builder database repair completed.");
} catch (error) {
  console.error("PC Builder database repair failed:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
