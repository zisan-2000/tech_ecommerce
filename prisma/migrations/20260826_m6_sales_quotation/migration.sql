-- M6 Sales Quotation: versioned corporate quotations linked to the M5 Sales RFQ domain.
CREATE TYPE "SalesQuotationStatus" AS ENUM (
  'DRAFT', 'INTERNAL_REVIEW', 'SENT', 'VIEWED',
  'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'
);

CREATE TYPE "SalesQuotationVersionStatus" AS ENUM (
  'DRAFT', 'ISSUED', 'ACCEPTED', 'SUPERSEDED', 'REJECTED', 'EXPIRED'
);

CREATE SEQUENCE "SalesQuotationNumber_seq" START 1;

CREATE TABLE "SalesQuotation" (
  "id" TEXT NOT NULL,
  "quotationNumber" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "salesRfqId" TEXT,
  "status" "SalesQuotationStatus" NOT NULL DEFAULT 'DRAFT',
  "validUntil" TIMESTAMP(3),
  "createdById" TEXT,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "viewedAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesQuotation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalesQuotation_validity_check" CHECK (
    "validUntil" IS NULL OR "validUntil" > "createdAt"
  ),
  CONSTRAINT "SalesQuotation_lifecycle_check" CHECK (
    ("status" IN ('DRAFT', 'INTERNAL_REVIEW', 'CANCELLED')
      AND "sentAt" IS NULL AND "viewedAt" IS NULL
      AND "acceptedAt" IS NULL AND "rejectedAt" IS NULL)
    OR ("status" = 'SENT'
      AND "approvedAt" IS NOT NULL AND "sentAt" IS NOT NULL
      AND "viewedAt" IS NULL AND "acceptedAt" IS NULL AND "rejectedAt" IS NULL)
    OR ("status" = 'VIEWED'
      AND "approvedAt" IS NOT NULL AND "sentAt" IS NOT NULL AND "viewedAt" IS NOT NULL
      AND "acceptedAt" IS NULL AND "rejectedAt" IS NULL)
    OR ("status" = 'ACCEPTED'
      AND "approvedAt" IS NOT NULL AND "sentAt" IS NOT NULL
      AND "viewedAt" IS NOT NULL AND "acceptedAt" IS NOT NULL AND "rejectedAt" IS NULL)
    OR ("status" = 'REJECTED'
      AND "approvedAt" IS NOT NULL AND "sentAt" IS NOT NULL
      AND "acceptedAt" IS NULL AND "rejectedAt" IS NOT NULL)
    OR ("status" = 'EXPIRED'
      AND "approvedAt" IS NOT NULL AND "sentAt" IS NOT NULL
      AND "acceptedAt" IS NULL AND "rejectedAt" IS NULL)
  )
);

CREATE TABLE "SalesQuotationVersion" (
  "id" TEXT NOT NULL,
  "quotationId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "status" "SalesQuotationVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "isCurrent" BOOLEAN NOT NULL DEFAULT true,
  "subtotal" DECIMAL(14,2) NOT NULL,
  "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "vatTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "shippingTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "grandTotal" DECIMAL(14,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'BDT',
  "paymentTerms" TEXT,
  "deliveryTerms" TEXT,
  "warrantyTerms" TEXT,
  "notes" TEXT,
  "pdfUrl" TEXT,
  "createdById" TEXT,
  "issuedAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesQuotationVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalesQuotationVersion_number_check" CHECK ("versionNumber" > 0),
  CONSTRAINT "SalesQuotationVersion_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "SalesQuotationVersion_totals_check" CHECK (
    "subtotal" >= 0 AND "discountTotal" >= 0 AND "vatTotal" >= 0
    AND "shippingTotal" >= 0 AND "grandTotal" >= 0
    AND "discountTotal" <= "subtotal"
    AND "grandTotal" = "subtotal" - "discountTotal" + "vatTotal" + "shippingTotal"
  ),
  CONSTRAINT "SalesQuotationVersion_lifecycle_check" CHECK (
    ("status" = 'DRAFT' AND "issuedAt" IS NULL AND "acceptedAt" IS NULL)
    OR ("status" = 'ISSUED' AND "issuedAt" IS NOT NULL AND "acceptedAt" IS NULL)
    OR ("status" = 'ACCEPTED' AND "issuedAt" IS NOT NULL AND "acceptedAt" IS NOT NULL)
    OR ("status" = 'SUPERSEDED' AND "acceptedAt" IS NULL)
    OR ("status" IN ('REJECTED', 'EXPIRED') AND "issuedAt" IS NOT NULL AND "acceptedAt" IS NULL)
  )
);

CREATE TABLE "SalesQuotationItem" (
  "id" TEXT NOT NULL,
  "quotationVersionId" TEXT NOT NULL,
  "productId" INTEGER,
  "variantId" INTEGER,
  "productName" TEXT NOT NULL,
  "skuSnapshot" TEXT,
  "quantity" INTEGER NOT NULL,
  "publicUnitPrice" DECIMAL(14,2),
  "unitPrice" DECIMAL(14,2) NOT NULL,
  "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "vatAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "lineTotal" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesQuotationItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalesQuotationItem_name_check" CHECK (length(btrim("productName")) BETWEEN 2 AND 240),
  CONSTRAINT "SalesQuotationItem_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "SalesQuotationItem_amounts_check" CHECK (
    "unitPrice" > 0 AND ("publicUnitPrice" IS NULL OR "publicUnitPrice" > 0)
    AND "discountAmount" >= 0 AND "vatAmount" >= 0
    AND "discountAmount" <= "unitPrice" * "quantity"
    AND "lineTotal" = "unitPrice" * "quantity" - "discountAmount" + "vatAmount"
  ),
  CONSTRAINT "SalesQuotationItem_variant_product_check" CHECK ("variantId" IS NULL OR "productId" IS NOT NULL)
);

CREATE UNIQUE INDEX "SalesQuotation_quotationNumber_key" ON "SalesQuotation"("quotationNumber");
CREATE INDEX "SalesQuotation_organizationId_status_idx" ON "SalesQuotation"("organizationId", "status");
CREATE INDEX "SalesQuotation_salesRfqId_idx" ON "SalesQuotation"("salesRfqId");
CREATE UNIQUE INDEX "SalesQuotationVersion_quotationId_versionNumber_key" ON "SalesQuotationVersion"("quotationId", "versionNumber");
CREATE INDEX "SalesQuotationVersion_quotationId_isCurrent_idx" ON "SalesQuotationVersion"("quotationId", "isCurrent");
CREATE UNIQUE INDEX "SalesQuotationVersion_one_current_idx" ON "SalesQuotationVersion"("quotationId") WHERE "isCurrent" = true;
CREATE INDEX "SalesQuotationItem_quotationVersionId_idx" ON "SalesQuotationItem"("quotationVersionId");
CREATE INDEX "SalesQuotationItem_productId_idx" ON "SalesQuotationItem"("productId");
CREATE INDEX "SalesQuotationItem_variantId_idx" ON "SalesQuotationItem"("variantId");

ALTER TABLE "SalesQuotation" ADD CONSTRAINT "SalesQuotation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesQuotation" ADD CONSTRAINT "SalesQuotation_salesRfqId_fkey"
  FOREIGN KEY ("salesRfqId") REFERENCES "SalesRfq"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesQuotationVersion" ADD CONSTRAINT "SalesQuotationVersion_quotationId_fkey"
  FOREIGN KEY ("quotationId") REFERENCES "SalesQuotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesQuotationItem" ADD CONSTRAINT "SalesQuotationItem_quotationVersionId_fkey"
  FOREIGN KEY ("quotationVersionId") REFERENCES "SalesQuotationVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Once issued, commercial content is immutable. Lifecycle metadata can still transition.
CREATE FUNCTION "protect_issued_sales_quotation_version"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'Issued sales quotation versions cannot be deleted' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" <> 'DRAFT' AND (
    NEW."quotationId" IS DISTINCT FROM OLD."quotationId" OR
    NEW."versionNumber" IS DISTINCT FROM OLD."versionNumber" OR
    NEW."subtotal" IS DISTINCT FROM OLD."subtotal" OR
    NEW."discountTotal" IS DISTINCT FROM OLD."discountTotal" OR
    NEW."vatTotal" IS DISTINCT FROM OLD."vatTotal" OR
    NEW."shippingTotal" IS DISTINCT FROM OLD."shippingTotal" OR
    NEW."grandTotal" IS DISTINCT FROM OLD."grandTotal" OR
    NEW."currency" IS DISTINCT FROM OLD."currency" OR
    NEW."paymentTerms" IS DISTINCT FROM OLD."paymentTerms" OR
    NEW."deliveryTerms" IS DISTINCT FROM OLD."deliveryTerms" OR
    NEW."warrantyTerms" IS DISTINCT FROM OLD."warrantyTerms" OR
    NEW."notes" IS DISTINCT FROM OLD."notes" OR
    NEW."pdfUrl" IS DISTINCT FROM OLD."pdfUrl" OR
    NEW."createdById" IS DISTINCT FROM OLD."createdById" OR
    NEW."issuedAt" IS DISTINCT FROM OLD."issuedAt" OR
    NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'Issued sales quotation commercial content is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SalesQuotationVersion_issued_immutable"
BEFORE UPDATE OR DELETE ON "SalesQuotationVersion"
FOR EACH ROW EXECUTE FUNCTION "protect_issued_sales_quotation_version"();

CREATE FUNCTION "protect_issued_sales_quotation_item"() RETURNS trigger AS $$
DECLARE version_status "SalesQuotationVersionStatus";
DECLARE version_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    version_id := OLD."quotationVersionId";
  ELSE
    version_id := NEW."quotationVersionId";
  END IF;
  SELECT "status" INTO version_status FROM "SalesQuotationVersion"
  WHERE "id" = version_id;
  IF version_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Items of an issued sales quotation version are immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SalesQuotationItem_issued_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "SalesQuotationItem"
FOR EACH ROW EXECUTE FUNCTION "protect_issued_sales_quotation_item"();

INSERT INTO "Permission" ("id", "key", "description", "createdAt", "updatedAt") VALUES
  ('m6_business_quotation_view', 'business.quotation.view', 'Read corporate sales quotations and immutable version history.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m6_business_quotation_create', 'business.quotation.create', 'Create corporate sales quotations and versions.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m6_business_quotation_update', 'business.quotation.update', 'Submit and cancel corporate sales quotations.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m6_business_quotation_approve', 'business.quotation.approve', 'Approve internally reviewed corporate sales quotations.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m6_business_quotation_send', 'business.quotation.send', 'Issue approved corporate sales quotations to customers.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "Role" AS role CROSS JOIN "Permission" AS permission
WHERE role."name" IN ('admin', 'superadmin')
  AND permission."key" IN (
    'business.quotation.view', 'business.quotation.create', 'business.quotation.update',
    'business.quotation.approve', 'business.quotation.send'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
