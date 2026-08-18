-- Composite indexes for the catalog's visibility, price, featured and stock filters.
CREATE INDEX IF NOT EXISTS "Product_deleted_available_basePrice_idx"
ON "Product"("deleted", "available", "basePrice");

CREATE INDEX IF NOT EXISTS "Product_deleted_available_featured_idx"
ON "Product"("deleted", "available", "featured");

CREATE INDEX IF NOT EXISTS "ProductVariant_productId_active_stock_idx"
ON "ProductVariant"("productId", "active", "stock");

-- Trigram indexes keep case-insensitive contains search responsive as the
-- catalog grows. The migration role must be allowed to install pg_trgm.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Product_name_trgm_idx"
ON "Product" USING GIN ("name" gin_trgm_ops)
WHERE "deleted" = false AND "available" = true;

CREATE INDEX IF NOT EXISTS "Product_slug_trgm_idx"
ON "Product" USING GIN ("slug" gin_trgm_ops)
WHERE "deleted" = false AND "available" = true;

CREATE INDEX IF NOT EXISTS "Product_sku_trgm_idx"
ON "Product" USING GIN ("sku" gin_trgm_ops)
WHERE "deleted" = false AND "available" = true;

CREATE INDEX IF NOT EXISTS "Product_shortDesc_trgm_idx"
ON "Product" USING GIN ("shortDesc" gin_trgm_ops)
WHERE "deleted" = false AND "available" = true;

CREATE INDEX IF NOT EXISTS "Brand_name_trgm_idx"
ON "Brand" USING GIN ("name" gin_trgm_ops)
WHERE "deleted" = false;
