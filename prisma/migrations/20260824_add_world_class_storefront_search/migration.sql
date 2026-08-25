-- World-class storefront search foundations: analytics, curated relevance,
-- query merchandising and reliable external-index synchronization.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE "SearchEventType" AS ENUM (
  'SEARCH_SUBMITTED',
  'SUGGESTION_CLICKED',
  'RESULTS_VIEWED',
  'RESULT_CLICKED',
  'ZERO_RESULTS',
  'FILTER_APPLIED',
  'ADD_TO_CART',
  'PURCHASE_COMPLETED'
);

CREATE TYPE "SearchRuleMatchType" AS ENUM ('EXACT', 'PREFIX', 'CONTAINS');

CREATE TABLE "SearchEvent" (
  "id" BIGSERIAL NOT NULL,
  "event" "SearchEventType" NOT NULL,
  "queryId" VARCHAR(64),
  "query" VARCHAR(100) NOT NULL,
  "normalizedQuery" VARCHAR(100) NOT NULL,
  "resultCount" INTEGER,
  "productId" INTEGER,
  "position" INTEGER,
  "visitorId" VARCHAR(100),
  "sessionId" VARCHAR(100),
  "userId" VARCHAR(100),
  "filters" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SearchEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SearchSynonym" (
  "id" SERIAL NOT NULL,
  "label" VARCHAR(100) NOT NULL,
  "terms" TEXT[] NOT NULL,
  "locale" VARCHAR(16) NOT NULL DEFAULT 'en-BD',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SearchSynonym_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SearchQueryRule" (
  "id" SERIAL NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "query" VARCHAR(100) NOT NULL,
  "matchType" "SearchRuleMatchType" NOT NULL DEFAULT 'CONTAINS',
  "action" JSONB NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SearchQueryRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SearchIndexOutbox" (
  "id" BIGSERIAL NOT NULL,
  "dedupeKey" VARCHAR(160) NOT NULL,
  "entityType" VARCHAR(40) NOT NULL,
  "entityId" VARCHAR(80) NOT NULL,
  "action" VARCHAR(24) NOT NULL,
  "payload" JSONB,
  "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SearchIndexOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SearchIndexOutbox_dedupeKey_key" ON "SearchIndexOutbox"("dedupeKey");
CREATE INDEX "SearchEvent_event_createdAt_idx" ON "SearchEvent"("event", "createdAt");
CREATE INDEX "SearchEvent_normalizedQuery_createdAt_idx" ON "SearchEvent"("normalizedQuery", "createdAt");
CREATE INDEX "SearchEvent_queryId_idx" ON "SearchEvent"("queryId");
CREATE INDEX "SearchEvent_productId_createdAt_idx" ON "SearchEvent"("productId", "createdAt");
CREATE INDEX "SearchEvent_sessionId_createdAt_idx" ON "SearchEvent"("sessionId", "createdAt");
CREATE INDEX "SearchSynonym_active_updatedAt_idx" ON "SearchSynonym"("active", "updatedAt");
CREATE INDEX "SearchQueryRule_active_priority_idx" ON "SearchQueryRule"("active", "priority");
CREATE INDEX "SearchQueryRule_query_active_idx" ON "SearchQueryRule"("query", "active");
CREATE INDEX "SearchQueryRule_startsAt_endsAt_idx" ON "SearchQueryRule"("startsAt", "endsAt");
CREATE INDEX "SearchIndexOutbox_status_nextAttemptAt_idx" ON "SearchIndexOutbox"("status", "nextAttemptAt");
CREATE INDEX "SearchIndexOutbox_entityType_entityId_idx" ON "SearchIndexOutbox"("entityType", "entityId");

-- Public search hits more text surfaces than PC Builder search. These indexes
-- make substring/typo candidate generation predictable at catalog scale.
CREATE INDEX IF NOT EXISTS "Search_Product_slug_trgm_idx"
  ON "Product" USING GIN ("slug" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Search_Product_shortDesc_trgm_idx"
  ON "Product" USING GIN ("shortDesc" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Search_Category_name_trgm_idx"
  ON "Category" USING GIN ("name" gin_trgm_ops);

-- Weighted full-text vector keeps exact names/models ahead of descriptive text.
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("sku", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("shortDesc", '')), 'C')
  ) STORED;
CREATE INDEX IF NOT EXISTS "Search_Product_searchVector_idx"
  ON "Product" USING GIN ("searchVector");

-- Transactional outbox triggers coalesce repeated changes for the same product.
-- The storefront remains PostgreSQL-first; an external search index can consume
-- these rows without risking a product write and index write drifting apart.
CREATE OR REPLACE FUNCTION "enqueue_search_product_index"()
RETURNS trigger AS $$
DECLARE
  product_id INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'Product' THEN
    product_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."id" ELSE NEW."id" END;
  ELSE
    product_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."productId" ELSE NEW."productId" END;
  END IF;

  INSERT INTO "SearchIndexOutbox" (
    "dedupeKey", "entityType", "entityId", "action", "status",
    "attempts", "nextAttemptAt", "createdAt", "updatedAt"
  ) VALUES (
    'product:' || product_id::text,
    'PRODUCT', product_id::text,
    CASE WHEN TG_TABLE_NAME = 'Product' AND TG_OP = 'DELETE' THEN 'DELETE' ELSE 'UPSERT' END,
    'PENDING', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
  ON CONFLICT ("dedupeKey") DO UPDATE SET
    "action" = EXCLUDED."action",
    "status" = 'PENDING',
    "attempts" = 0,
    "nextAttemptAt" = CURRENT_TIMESTAMP,
    "processedAt" = NULL,
    "lastError" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "search_product_outbox_product"
AFTER INSERT OR UPDATE OR DELETE ON "Product"
FOR EACH ROW EXECUTE FUNCTION "enqueue_search_product_index"();

CREATE TRIGGER "search_product_outbox_variant"
AFTER INSERT OR UPDATE OR DELETE ON "ProductVariant"
FOR EACH ROW EXECUTE FUNCTION "enqueue_search_product_index"();

CREATE TRIGGER "search_product_outbox_attribute"
AFTER INSERT OR UPDATE OR DELETE ON "ProductAttribute"
FOR EACH ROW EXECUTE FUNCTION "enqueue_search_product_index"();

-- Seed every existing product into the outbox so enabling Typesense later does
-- not require a separate one-off script.
INSERT INTO "SearchIndexOutbox" (
  "dedupeKey", "entityType", "entityId", "action", "status",
  "attempts", "nextAttemptAt", "createdAt", "updatedAt"
)
SELECT
  'product:' || p."id"::text, 'PRODUCT', p."id"::text, 'UPSERT', 'PENDING',
  0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Product" p
ON CONFLICT ("dedupeKey") DO NOTHING;
