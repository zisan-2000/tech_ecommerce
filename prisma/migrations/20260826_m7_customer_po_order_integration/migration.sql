-- M7 Customer PO and existing Order integration.
-- The accepted quotation remains the commercial source of truth; conversion is atomic.
CREATE TYPE "SalesChannel" AS ENUM ('RETAIL', 'CORPORATE', 'RESELLER', 'DEALER');
CREATE TYPE "CustomerPurchaseOrderStatus" AS ENUM (
  'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'CONVERTED', 'CANCELLED'
);

-- Corporate quotes use DECIMAL(14,2). Widening these columns is lossless for retail orders.
ALTER TABLE "Order"
  ALTER COLUMN "total" TYPE DECIMAL(14,2),
  ALTER COLUMN "shipping_cost" TYPE DECIMAL(14,2),
  ALTER COLUMN "grand_total" TYPE DECIMAL(14,2),
  ALTER COLUMN "Vat_total" TYPE DECIMAL(14,2),
  ALTER COLUMN "discount_total" TYPE DECIMAL(14,2),
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "salesChannel" "SalesChannel" NOT NULL DEFAULT 'RETAIL',
  ADD COLUMN "salesQuotationVersionId" TEXT,
  ADD COLUMN "commercialContext" JSONB;

ALTER TABLE "OrderItem"
  ALTER COLUMN "price" TYPE DECIMAL(14,2),
  ALTER COLUMN "VatAmount" TYPE DECIMAL(14,2),
  ALTER COLUMN "discountAmount" TYPE DECIMAL(14,2),
  ALTER COLUMN "costPriceSnapshot" TYPE DECIMAL(14,2),
  ADD COLUMN "priceSource" "BusinessPriceSource",
  ADD COLUMN "publicUnitPriceSnapshot" DECIMAL(14,2),
  ADD COLUMN "businessDiscountSnapshot" DECIMAL(14,2);

CREATE TABLE "CustomerPurchaseOrder" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "quotationId" TEXT,
  "customerPoNumber" TEXT NOT NULL,
  "status" "CustomerPurchaseOrderStatus" NOT NULL DEFAULT 'SUBMITTED',
  "fileUrl" TEXT NOT NULL,
  "poDate" TIMESTAMP(3),
  "expectedDeliveryAt" TIMESTAMP(3),
  "totalAmount" DECIMAL(14,2),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'BDT',
  "submittedByMemberId" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "orderId" INTEGER,
  "convertedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerPurchaseOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerPurchaseOrder_number_check" CHECK (
    length(btrim("customerPoNumber")) BETWEEN 1 AND 120
  ),
  CONSTRAINT "CustomerPurchaseOrder_file_check" CHECK (
    length(btrim("fileUrl")) BETWEEN 1 AND 2048
    AND ("fileUrl" ~ '^https://[^[:space:]]+$' OR "fileUrl" ~ '^/[^[:space:]]+$')
  ),
  CONSTRAINT "CustomerPurchaseOrder_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "CustomerPurchaseOrder_amount_check" CHECK ("totalAmount" IS NULL OR "totalAmount" > 0),
  CONSTRAINT "CustomerPurchaseOrder_delivery_check" CHECK (
    "poDate" IS NULL OR "expectedDeliveryAt" IS NULL OR "expectedDeliveryAt" >= "poDate"
  ),
  CONSTRAINT "CustomerPurchaseOrder_lifecycle_check" CHECK (
    ("status" = 'SUBMITTED' AND "reviewedById" IS NULL AND "reviewedAt" IS NULL
      AND "rejectionReason" IS NULL AND "orderId" IS NULL AND "convertedAt" IS NULL)
    OR ("status" = 'UNDER_REVIEW' AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL
      AND "rejectionReason" IS NULL AND "orderId" IS NULL AND "convertedAt" IS NULL)
    OR ("status" = 'VERIFIED' AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL
      AND "rejectionReason" IS NULL AND "orderId" IS NULL AND "convertedAt" IS NULL)
    OR ("status" = 'REJECTED' AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL
      AND length(btrim("rejectionReason")) BETWEEN 3 AND 1000
      AND "orderId" IS NULL AND "convertedAt" IS NULL)
    OR ("status" = 'CONVERTED' AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL
      AND "rejectionReason" IS NULL AND "orderId" IS NOT NULL AND "convertedAt" IS NOT NULL)
    OR ("status" = 'CANCELLED' AND "orderId" IS NULL AND "convertedAt" IS NULL)
  )
);

CREATE UNIQUE INDEX "CustomerPurchaseOrder_orderId_key" ON "CustomerPurchaseOrder"("orderId");
CREATE UNIQUE INDEX "CustomerPurchaseOrder_organizationId_customerPoNumber_key"
  ON "CustomerPurchaseOrder"("organizationId", "customerPoNumber");
CREATE INDEX "CustomerPurchaseOrder_organizationId_status_idx"
  ON "CustomerPurchaseOrder"("organizationId", "status");
CREATE INDEX "CustomerPurchaseOrder_quotationId_idx" ON "CustomerPurchaseOrder"("quotationId");
CREATE UNIQUE INDEX "CustomerPurchaseOrder_active_quotation_idx"
  ON "CustomerPurchaseOrder"("quotationId")
  WHERE "quotationId" IS NOT NULL AND "status" NOT IN ('REJECTED', 'CANCELLED');
CREATE INDEX "Order_organizationId_order_date_idx" ON "Order"("organizationId", "order_date");
CREATE INDEX "Order_salesChannel_order_date_idx" ON "Order"("salesChannel", "order_date");

ALTER TABLE "Order" ADD CONSTRAINT "Order_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_salesQuotationVersionId_fkey"
  FOREIGN KEY ("salesQuotationVersionId") REFERENCES "SalesQuotationVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerPurchaseOrder" ADD CONSTRAINT "CustomerPurchaseOrder_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerPurchaseOrder" ADD CONSTRAINT "CustomerPurchaseOrder_quotationId_fkey"
  FOREIGN KEY ("quotationId") REFERENCES "SalesQuotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerPurchaseOrder" ADD CONSTRAINT "CustomerPurchaseOrder_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION "protect_customer_purchase_order_lifecycle"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'CONVERTED' THEN
      RAISE EXCEPTION 'Converted customer purchase orders cannot be deleted' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
    OR NEW."quotationId" IS DISTINCT FROM OLD."quotationId"
    OR NEW."customerPoNumber" IS DISTINCT FROM OLD."customerPoNumber"
    OR NEW."fileUrl" IS DISTINCT FROM OLD."fileUrl"
    OR NEW."poDate" IS DISTINCT FROM OLD."poDate"
    OR NEW."expectedDeliveryAt" IS DISTINCT FROM OLD."expectedDeliveryAt"
    OR NEW."totalAmount" IS DISTINCT FROM OLD."totalAmount"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."submittedByMemberId" IS DISTINCT FROM OLD."submittedByMemberId" THEN
    RAISE EXCEPTION 'Submitted customer purchase order source data is immutable' USING ERRCODE = '23514';
  END IF;

  IF NOT (
    (OLD."status" = 'SUBMITTED' AND NEW."status" IN ('UNDER_REVIEW', 'CANCELLED'))
    OR (OLD."status" = 'UNDER_REVIEW' AND NEW."status" IN ('VERIFIED', 'REJECTED'))
    OR (OLD."status" = 'VERIFIED' AND NEW."status" = 'CONVERTED')
    OR (OLD."status" = NEW."status")
  ) THEN
    RAISE EXCEPTION 'Invalid customer purchase order status transition' USING ERRCODE = '23514';
  END IF;

  IF OLD."status" = 'CONVERTED' AND (
    NEW."orderId" IS DISTINCT FROM OLD."orderId" OR
    NEW."convertedAt" IS DISTINCT FROM OLD."convertedAt"
  ) THEN
    RAISE EXCEPTION 'Converted customer purchase order linkage is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CustomerPurchaseOrder_lifecycle_guard"
BEFORE UPDATE OR DELETE ON "CustomerPurchaseOrder"
FOR EACH ROW EXECUTE FUNCTION "protect_customer_purchase_order_lifecycle"();

CREATE FUNCTION "protect_corporate_order_context"() RETURNS trigger AS $$
BEGIN
  IF OLD."commercialContext" IS NOT NULL AND (
    NEW."organizationId" IS DISTINCT FROM OLD."organizationId" OR
    NEW."salesChannel" IS DISTINCT FROM OLD."salesChannel" OR
    NEW."salesQuotationVersionId" IS DISTINCT FROM OLD."salesQuotationVersionId" OR
    NEW."commercialContext" IS DISTINCT FROM OLD."commercialContext"
  ) THEN
    RAISE EXCEPTION 'Corporate order commercial context is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Order_corporate_context_immutable"
BEFORE UPDATE ON "Order"
FOR EACH ROW EXECUTE FUNCTION "protect_corporate_order_context"();

CREATE FUNCTION "protect_business_order_item_snapshot"() RETURNS trigger AS $$
BEGIN
  IF OLD."priceSource" IS NOT NULL AND (
    NEW."priceSource" IS DISTINCT FROM OLD."priceSource" OR
    NEW."publicUnitPriceSnapshot" IS DISTINCT FROM OLD."publicUnitPriceSnapshot" OR
    NEW."businessDiscountSnapshot" IS DISTINCT FROM OLD."businessDiscountSnapshot"
  ) THEN
    RAISE EXCEPTION 'Business order item commercial snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "OrderItem_business_snapshot_immutable"
BEFORE UPDATE ON "OrderItem"
FOR EACH ROW EXECUTE FUNCTION "protect_business_order_item_snapshot"();

INSERT INTO "Permission" ("id", "key", "description", "createdAt", "updatedAt") VALUES
  ('m7_business_customer_po_view', 'business.customer_po.view', 'Read customer purchase orders and linked corporate orders.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m7_business_customer_po_verify', 'business.customer_po.verify', 'Review, verify, and reject customer purchase orders.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m7_business_customer_po_convert', 'business.customer_po.convert', 'Atomically convert verified customer purchase orders into orders.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "Role" AS role CROSS JOIN "Permission" AS permission
WHERE role."name" IN ('admin', 'superadmin')
  AND permission."key" IN (
    'business.customer_po.view', 'business.customer_po.verify', 'business.customer_po.convert'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
