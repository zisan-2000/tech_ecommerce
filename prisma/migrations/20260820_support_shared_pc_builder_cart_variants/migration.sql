ALTER TABLE "CartItem"
  ADD COLUMN "lineKey" VARCHAR(80) NOT NULL DEFAULT 'standard';

DROP INDEX IF EXISTS "CartItem_userId_productId_variantId_key";

CREATE UNIQUE INDEX "CartItem_userId_productId_variantId_lineKey_key"
  ON "CartItem"("userId", "productId", "variantId", "lineKey");

CREATE INDEX "CartItem_userId_lineKey_idx"
  ON "CartItem"("userId", "lineKey");
