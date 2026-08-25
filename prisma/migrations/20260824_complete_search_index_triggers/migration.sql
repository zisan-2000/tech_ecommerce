-- Brand/category names and slugs are embedded into external search documents.
-- Queue every affected product when those related catalog entities change.
CREATE OR REPLACE FUNCTION "enqueue_search_related_products"()
RETURNS trigger AS $$
DECLARE
  related_id INTEGER;
  relation_column TEXT;
BEGIN
  related_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;
  relation_column := CASE WHEN TG_TABLE_NAME = 'Brand' THEN 'brandId' ELSE 'categoryId' END;

  IF relation_column = 'brandId' THEN
    INSERT INTO "SearchIndexOutbox" (
      "dedupeKey", "entityType", "entityId", "action", "status",
      "attempts", "nextAttemptAt", "createdAt", "updatedAt"
    )
    SELECT
      'product:' || p."id"::text, 'PRODUCT', p."id"::text, 'UPSERT', 'PENDING',
      0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM "Product" p WHERE p."brandId" = related_id
    ON CONFLICT ("dedupeKey") DO UPDATE SET
      "action" = 'UPSERT', "status" = 'PENDING', "attempts" = 0,
      "nextAttemptAt" = CURRENT_TIMESTAMP, "processedAt" = NULL,
      "lastError" = NULL, "updatedAt" = CURRENT_TIMESTAMP;
  ELSE
    INSERT INTO "SearchIndexOutbox" (
      "dedupeKey", "entityType", "entityId", "action", "status",
      "attempts", "nextAttemptAt", "createdAt", "updatedAt"
    )
    SELECT
      'product:' || p."id"::text, 'PRODUCT', p."id"::text, 'UPSERT', 'PENDING',
      0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM "Product" p WHERE p."categoryId" = related_id
    ON CONFLICT ("dedupeKey") DO UPDATE SET
      "action" = 'UPSERT', "status" = 'PENDING', "attempts" = 0,
      "nextAttemptAt" = CURRENT_TIMESTAMP, "processedAt" = NULL,
      "lastError" = NULL, "updatedAt" = CURRENT_TIMESTAMP;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "search_product_outbox_brand"
AFTER INSERT OR UPDATE OR DELETE ON "Brand"
FOR EACH ROW EXECUTE FUNCTION "enqueue_search_related_products"();

CREATE TRIGGER "search_product_outbox_category"
AFTER INSERT OR UPDATE OR DELETE ON "Category"
FOR EACH ROW EXECUTE FUNCTION "enqueue_search_related_products"();
