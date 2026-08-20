-- PC Builder catalog search hardening.
-- pg_trgm accelerates the ILIKE/contains predicates used by Prisma for public catalog search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "PcBuilder_Product_name_trgm_idx"
  ON "Product" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "PcBuilder_Product_sku_trgm_idx"
  ON "Product" USING GIN ("sku" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "PcBuilder_Brand_name_trgm_idx"
  ON "Brand" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "PcBuilder_ProductVariant_sku_trgm_idx"
  ON "ProductVariant" USING GIN ("sku" gin_trgm_ops)
  WHERE "active" = true;

CREATE INDEX IF NOT EXISTS "PcBuilder_ProductAttribute_value_trgm_idx"
  ON "ProductAttribute" USING GIN ("value" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "PcBuilder_Attribute_name_trgm_idx"
  ON "Attribute" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "PcBuilder_Product_catalog_sort_idx"
  ON "Product" ("categoryId", "featured" DESC, "soldCount" DESC, "id" DESC)
  WHERE "deleted" = false
    AND "available" = true
    AND "type" = 'PHYSICAL';
