CREATE INDEX IF NOT EXISTS "Product_deleted_available_createdAt_idx"
ON "Product"("deleted", "available", "createdAt");

CREATE INDEX IF NOT EXISTS "Product_deleted_available_soldCount_idx"
ON "Product"("deleted", "available", "soldCount");

CREATE INDEX IF NOT EXISTS "Product_categoryId_deleted_available_idx"
ON "Product"("categoryId", "deleted", "available");

CREATE INDEX IF NOT EXISTS "Product_brandId_deleted_available_idx"
ON "Product"("brandId", "deleted", "available");

CREATE INDEX IF NOT EXISTS "Product_writerId_deleted_available_idx"
ON "Product"("writerId", "deleted", "available");

CREATE INDEX IF NOT EXISTS "Product_publisherId_deleted_available_idx"
ON "Product"("publisherId", "deleted", "available");
