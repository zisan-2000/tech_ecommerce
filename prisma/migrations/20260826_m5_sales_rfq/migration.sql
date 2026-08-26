-- M5 Sales RFQ: corporate customer request-for-quotation domain.
-- This remains separate from the existing supplier procurement Rfq tables.
CREATE TYPE "SalesRfqStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'QUOTED',
  'CLOSED',
  'REJECTED',
  'CANCELLED'
);

CREATE SEQUENCE "SalesRfqNumber_seq" START 1;

CREATE TABLE "SalesRfq" (
  "id" TEXT NOT NULL,
  "rfqNumber" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "requestedByMemberId" TEXT NOT NULL,
  "status" "SalesRfqStatus" NOT NULL DEFAULT 'DRAFT',
  "subject" TEXT NOT NULL,
  "requestedDelivery" TIMESTAMP(3),
  "quotationDueAt" TIMESTAMP(3),
  "notes" TEXT,
  "assignedToUserId" TEXT,
  "submittedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesRfq_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalesRfq_subject_check" CHECK (length(btrim("subject")) BETWEEN 3 AND 240),
  CONSTRAINT "SalesRfq_date_order_check" CHECK (
    "quotationDueAt" IS NULL OR
    "requestedDelivery" IS NULL OR
    "quotationDueAt" <= "requestedDelivery"
  ),
  CONSTRAINT "SalesRfq_lifecycle_timestamps_check" CHECK (
    (
      "status" = 'DRAFT'
      AND "submittedAt" IS NULL
      AND "closedAt" IS NULL
    ) OR (
      "status" IN ('SUBMITTED', 'UNDER_REVIEW', 'QUOTED')
      AND "submittedAt" IS NOT NULL
      AND "closedAt" IS NULL
    ) OR (
      "status" IN ('CLOSED', 'REJECTED')
      AND "submittedAt" IS NOT NULL
      AND "closedAt" IS NOT NULL
    ) OR (
      "status" = 'CANCELLED'
      AND "closedAt" IS NOT NULL
    )
  )
);

CREATE TABLE "SalesRfqItem" (
  "id" TEXT NOT NULL,
  "salesRfqId" TEXT NOT NULL,
  "productId" INTEGER,
  "variantId" INTEGER,
  "productName" TEXT NOT NULL,
  "skuSnapshot" TEXT,
  "description" TEXT,
  "quantity" INTEGER NOT NULL,
  "targetUnitPrice" DECIMAL(14,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesRfqItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalesRfqItem_name_check" CHECK (length(btrim("productName")) BETWEEN 2 AND 240),
  CONSTRAINT "SalesRfqItem_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "SalesRfqItem_target_price_check" CHECK ("targetUnitPrice" IS NULL OR "targetUnitPrice" > 0),
  CONSTRAINT "SalesRfqItem_variant_product_check" CHECK ("variantId" IS NULL OR "productId" IS NOT NULL)
);

CREATE TABLE "SalesRfqAttachment" (
  "id" TEXT NOT NULL,
  "salesRfqId" TEXT NOT NULL,
  "title" TEXT,
  "fileUrl" TEXT NOT NULL,
  "fileName" TEXT,
  "mimeType" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesRfqAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalesRfqAttachment_file_url_check" CHECK (length(btrim("fileUrl")) BETWEEN 1 AND 2048)
);

CREATE UNIQUE INDEX "SalesRfq_rfqNumber_key" ON "SalesRfq"("rfqNumber");
CREATE INDEX "SalesRfq_organizationId_status_idx" ON "SalesRfq"("organizationId", "status");
CREATE INDEX "SalesRfq_assignedToUserId_status_idx" ON "SalesRfq"("assignedToUserId", "status");
CREATE INDEX "SalesRfqItem_salesRfqId_idx" ON "SalesRfqItem"("salesRfqId");
CREATE INDEX "SalesRfqItem_productId_idx" ON "SalesRfqItem"("productId");
CREATE INDEX "SalesRfqItem_variantId_idx" ON "SalesRfqItem"("variantId");
CREATE INDEX "SalesRfqAttachment_salesRfqId_idx" ON "SalesRfqAttachment"("salesRfqId");

ALTER TABLE "SalesRfq"
  ADD CONSTRAINT "SalesRfq_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesRfq"
  ADD CONSTRAINT "SalesRfq_requestedByMemberId_fkey"
  FOREIGN KEY ("requestedByMemberId") REFERENCES "OrganizationMember"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesRfqItem"
  ADD CONSTRAINT "SalesRfqItem_salesRfqId_fkey"
  FOREIGN KEY ("salesRfqId") REFERENCES "SalesRfq"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesRfqAttachment"
  ADD CONSTRAINT "SalesRfqAttachment_salesRfqId_fkey"
  FOREIGN KEY ("salesRfqId") REFERENCES "SalesRfq"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "key", "description", "createdAt", "updatedAt") VALUES
  ('m5_business_rfq_view', 'business.rfq.view', 'Read corporate customer sales RFQs and their supporting documents.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m5_business_rfq_manage', 'business.rfq.manage', 'Review, reject, and close corporate customer sales RFQs.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m5_business_rfq_assign', 'business.rfq.assign', 'Assign corporate customer sales RFQs to internal users.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET
  "description" = EXCLUDED."description",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "Role" AS role
CROSS JOIN "Permission" AS permission
WHERE role."name" IN ('admin', 'superadmin')
  AND permission."key" IN (
    'business.rfq.view',
    'business.rfq.manage',
    'business.rfq.assign'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
