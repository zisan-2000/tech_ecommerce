-- M10 Commission Engine + append-only Commission Ledger.
CREATE TYPE "CommissionPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "CommissionScopeType" AS ENUM ('GLOBAL', 'PRODUCT', 'VARIANT', 'CATEGORY', 'BRAND', 'PRODUCT_TYPE', 'LEAD');
CREATE TYPE "CommissionCalculationType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');
CREATE TYPE "CommissionBasis" AS ENUM ('GROSS_ITEM', 'NET_ITEM', 'ORDER_NET', 'LEAD_VALUE');
CREATE TYPE "CommissionEntryType" AS ENUM ('EARNING', 'REVERSAL', 'ADJUSTMENT');
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'HOLD', 'APPROVED', 'PAYABLE', 'PAID', 'CANCELLED', 'REVERSED');

CREATE TABLE "CommissionPlan" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "CommissionPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "currency" VARCHAR(3) NOT NULL DEFAULT 'BDT',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommissionPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommissionPlan_code_check" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  CONSTRAINT "CommissionPlan_name_check" CHECK (length(btrim("name")) BETWEEN 2 AND 160),
  CONSTRAINT "CommissionPlan_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "CommissionPlan_dates_check" CHECK ("endsAt" IS NULL OR "startsAt" IS NULL OR "endsAt" > "startsAt")
);

CREATE TABLE "CommissionRule" (
  "id" TEXT NOT NULL,
  "commissionPlanId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "scopeType" "CommissionScopeType" NOT NULL,
  "targetKey" TEXT NOT NULL,
  "productId" INTEGER,
  "variantId" INTEGER,
  "categoryId" INTEGER,
  "brandId" INTEGER,
  "productType" "ProductType",
  "calculationType" "CommissionCalculationType" NOT NULL,
  "basis" "CommissionBasis" NOT NULL DEFAULT 'NET_ITEM',
  "rate" DECIMAL(8,4),
  "fixedAmount" DECIMAL(14,2),
  "minOrderAmount" DECIMAL(14,2),
  "minQuantity" INTEGER,
  "maxCommission" DECIMAL(14,2),
  "priority" INTEGER NOT NULL DEFAULT 100,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommissionRule_name_check" CHECK (length(btrim("name")) BETWEEN 2 AND 160),
  CONSTRAINT "CommissionRule_priority_check" CHECK ("priority" BETWEEN 0 AND 1000000),
  CONSTRAINT "CommissionRule_thresholds_check" CHECK (
    ("minOrderAmount" IS NULL OR "minOrderAmount" >= 0) AND
    ("minQuantity" IS NULL OR "minQuantity" > 0) AND
    ("maxCommission" IS NULL OR "maxCommission" > 0)
  ),
  CONSTRAINT "CommissionRule_calculation_check" CHECK (
    ("calculationType" = 'PERCENTAGE' AND "rate" > 0 AND "rate" <= 100 AND "fixedAmount" IS NULL) OR
    ("calculationType" = 'FIXED_AMOUNT' AND "fixedAmount" > 0 AND "rate" IS NULL)
  ),
  CONSTRAINT "CommissionRule_scope_check" CHECK (
    ("scopeType" = 'GLOBAL' AND "targetKey" = 'GLOBAL' AND "productId" IS NULL AND "variantId" IS NULL AND "categoryId" IS NULL AND "brandId" IS NULL AND "productType" IS NULL) OR
    ("scopeType" = 'PRODUCT' AND "targetKey" = 'PRODUCT:' || "productId"::text AND "productId" IS NOT NULL AND "variantId" IS NULL AND "categoryId" IS NULL AND "brandId" IS NULL AND "productType" IS NULL) OR
    ("scopeType" = 'VARIANT' AND "targetKey" = 'VARIANT:' || "variantId"::text AND "productId" IS NULL AND "variantId" IS NOT NULL AND "categoryId" IS NULL AND "brandId" IS NULL AND "productType" IS NULL) OR
    ("scopeType" = 'CATEGORY' AND "targetKey" = 'CATEGORY:' || "categoryId"::text AND "productId" IS NULL AND "variantId" IS NULL AND "categoryId" IS NOT NULL AND "brandId" IS NULL AND "productType" IS NULL) OR
    ("scopeType" = 'BRAND' AND "targetKey" = 'BRAND:' || "brandId"::text AND "productId" IS NULL AND "variantId" IS NULL AND "categoryId" IS NULL AND "brandId" IS NOT NULL AND "productType" IS NULL) OR
    ("scopeType" = 'PRODUCT_TYPE' AND "targetKey" = 'PRODUCT_TYPE:' || "productType"::text AND "productId" IS NULL AND "variantId" IS NULL AND "categoryId" IS NULL AND "brandId" IS NULL AND "productType" IS NOT NULL) OR
    ("scopeType" = 'LEAD' AND "targetKey" = 'LEAD' AND "productId" IS NULL AND "variantId" IS NULL AND "categoryId" IS NULL AND "brandId" IS NULL AND "productType" IS NULL)
  ),
  CONSTRAINT "CommissionRule_basis_scope_check" CHECK (
    ("scopeType" = 'LEAD' AND "basis" = 'LEAD_VALUE') OR
    ("scopeType" = 'GLOBAL' AND "basis" <> 'LEAD_VALUE') OR
    ("scopeType" NOT IN ('LEAD', 'GLOBAL') AND "basis" IN ('GROSS_ITEM', 'NET_ITEM'))
  )
);

CREATE TABLE "CommissionEntry" (
  "id" TEXT NOT NULL,
  "partnerProfileId" TEXT NOT NULL,
  "agreementVersionId" TEXT,
  "commissionRuleId" TEXT,
  "type" "CommissionEntryType" NOT NULL,
  "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
  "orderId" INTEGER,
  "orderItemId" INTEGER,
  "partnerLeadId" TEXT,
  "grossBasisAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "netBasisAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "rate" DECIMAL(8,4),
  "amount" DECIMAL(14,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'BDT',
  "sourceEntryId" TEXT,
  "holdUntil" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "payableAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "reason" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommissionEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommissionEntry_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "CommissionEntry_amount_check" CHECK (
    ("type" = 'EARNING' AND "amount" > 0 AND "sourceEntryId" IS NULL) OR
    ("type" = 'REVERSAL' AND "amount" < 0 AND "sourceEntryId" IS NOT NULL) OR
    ("type" = 'ADJUSTMENT' AND "amount" <> 0)
  ),
  CONSTRAINT "CommissionEntry_basis_check" CHECK ("grossBasisAmount" >= 0 AND "netBasisAmount" >= 0 AND ("rate" IS NULL OR ("rate" > 0 AND "rate" <= 100))),
  CONSTRAINT "CommissionEntry_source_check" CHECK (
    ("type" = 'EARNING' AND (
      ("orderId" IS NOT NULL AND "orderItemId" IS NOT NULL AND "partnerLeadId" IS NULL) OR
      ("orderId" IS NOT NULL AND "orderItemId" IS NULL AND "partnerLeadId" IS NULL) OR
      ("orderId" IS NULL AND "orderItemId" IS NULL AND "partnerLeadId" IS NOT NULL)
    )) OR "type" IN ('REVERSAL', 'ADJUSTMENT')
  ),
  CONSTRAINT "CommissionEntry_lifecycle_evidence_check" CHECK (
    ("status" NOT IN ('APPROVED', 'PAYABLE', 'PAID') OR "approvedAt" IS NOT NULL) AND
    ("status" NOT IN ('PAYABLE', 'PAID') OR "payableAt" IS NOT NULL) AND
    ("status" <> 'PAID' OR "paidAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "CommissionPlan_code_key" ON "CommissionPlan"("code");
CREATE INDEX "CommissionPlan_status_startsAt_endsAt_idx" ON "CommissionPlan"("status", "startsAt", "endsAt");
CREATE UNIQUE INDEX "CommissionRule_commissionPlanId_targetKey_key" ON "CommissionRule"("commissionPlanId", "targetKey");
CREATE INDEX "CommissionRule_commissionPlanId_isActive_priority_idx" ON "CommissionRule"("commissionPlanId", "isActive", "priority");
CREATE INDEX "CommissionRule_targetKey_idx" ON "CommissionRule"("targetKey");
CREATE INDEX "CommissionRule_productId_idx" ON "CommissionRule"("productId");
CREATE INDEX "CommissionRule_variantId_idx" ON "CommissionRule"("variantId");
CREATE INDEX "CommissionRule_categoryId_idx" ON "CommissionRule"("categoryId");
CREATE INDEX "CommissionRule_brandId_idx" ON "CommissionRule"("brandId");
CREATE INDEX "CommissionEntry_partnerProfileId_status_idx" ON "CommissionEntry"("partnerProfileId", "status");
CREATE INDEX "CommissionEntry_orderId_idx" ON "CommissionEntry"("orderId");
CREATE INDEX "CommissionEntry_orderItemId_idx" ON "CommissionEntry"("orderItemId");
CREATE INDEX "CommissionEntry_partnerLeadId_idx" ON "CommissionEntry"("partnerLeadId");
CREATE INDEX "CommissionEntry_sourceEntryId_idx" ON "CommissionEntry"("sourceEntryId");
CREATE INDEX "CommissionEntry_createdAt_idx" ON "CommissionEntry"("createdAt");
CREATE UNIQUE INDEX "CommissionEntry_order_item_earning_key" ON "CommissionEntry"("orderItemId") WHERE "type" = 'EARNING' AND "orderItemId" IS NOT NULL;
CREATE UNIQUE INDEX "CommissionEntry_order_earning_key" ON "CommissionEntry"("orderId") WHERE "type" = 'EARNING' AND "orderItemId" IS NULL AND "partnerLeadId" IS NULL;
CREATE UNIQUE INDEX "CommissionEntry_lead_earning_key" ON "CommissionEntry"("partnerLeadId") WHERE "type" = 'EARNING' AND "partnerLeadId" IS NOT NULL;
CREATE UNIQUE INDEX "CommissionEntry_source_reversal_key" ON "CommissionEntry"("sourceEntryId") WHERE "type" = 'REVERSAL';

ALTER TABLE "PartnerAgreementVersion" DROP CONSTRAINT "PartnerAgreementVersion_commission_plan_m8_check";
ALTER TABLE "PartnerAgreementVersion" ADD CONSTRAINT "PartnerAgreementVersion_commissionPlanId_fkey" FOREIGN KEY ("commissionPlanId") REFERENCES "CommissionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_commissionPlanId_fkey" FOREIGN KEY ("commissionPlanId") REFERENCES "CommissionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_partnerProfileId_fkey" FOREIGN KEY ("partnerProfileId") REFERENCES "PartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_agreementVersionId_fkey" FOREIGN KEY ("agreementVersionId") REFERENCES "PartnerAgreementVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_commissionRuleId_fkey" FOREIGN KEY ("commissionRuleId") REFERENCES "CommissionRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_partnerLeadId_fkey" FOREIGN KEY ("partnerLeadId") REFERENCES "PartnerLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_sourceEntryId_fkey" FOREIGN KEY ("sourceEntryId") REFERENCES "CommissionEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION "protect_commission_plan_and_rules"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE plan_status "CommissionPlanStatus";
BEGIN
  IF TG_TABLE_NAME = 'CommissionPlan' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Commission plans cannot be deleted; archive them instead' USING ERRCODE = '23514';
    END IF;
    IF OLD."status" <> 'DRAFT' AND (
      NEW."code" IS DISTINCT FROM OLD."code" OR NEW."currency" IS DISTINCT FROM OLD."currency" OR
      NEW."startsAt" IS DISTINCT FROM OLD."startsAt" OR NEW."endsAt" IS DISTINCT FROM OLD."endsAt"
    ) THEN
      RAISE EXCEPTION 'Activated commission plan financial terms are immutable' USING ERRCODE = '23514';
    END IF;
    IF NOT (
      (OLD."status" = 'DRAFT' AND NEW."status" IN ('DRAFT', 'ACTIVE', 'ARCHIVED')) OR
      (OLD."status" = 'ACTIVE' AND NEW."status" IN ('ACTIVE', 'INACTIVE')) OR
      (OLD."status" = 'INACTIVE' AND NEW."status" IN ('INACTIVE', 'ACTIVE', 'ARCHIVED')) OR
      (OLD."status" = 'ARCHIVED' AND NEW."status" = 'ARCHIVED')
    ) THEN
      RAISE EXCEPTION 'Invalid commission plan status transition' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT "status" INTO plan_status FROM "CommissionPlan" WHERE "id" = OLD."commissionPlanId";
  ELSE
    SELECT "status" INTO plan_status FROM "CommissionPlan" WHERE "id" = NEW."commissionPlanId";
  END IF;
  IF plan_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Commission rules may only change while their plan is DRAFT' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "CommissionPlan_lifecycle_guard" BEFORE UPDATE OR DELETE ON "CommissionPlan" FOR EACH ROW EXECUTE FUNCTION "protect_commission_plan_and_rules"();
CREATE TRIGGER "CommissionRule_draft_guard" BEFORE INSERT OR UPDATE OR DELETE ON "CommissionRule" FOR EACH ROW EXECUTE FUNCTION "protect_commission_plan_and_rules"();

CREATE FUNCTION "protect_commission_entry"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Commission ledger entries are append-only and cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF NEW."partnerProfileId" IS DISTINCT FROM OLD."partnerProfileId"
    OR NEW."agreementVersionId" IS DISTINCT FROM OLD."agreementVersionId"
    OR NEW."commissionRuleId" IS DISTINCT FROM OLD."commissionRuleId"
    OR NEW."type" IS DISTINCT FROM OLD."type"
    OR NEW."orderItemId" IS DISTINCT FROM OLD."orderItemId"
    OR NEW."partnerLeadId" IS DISTINCT FROM OLD."partnerLeadId"
    OR NEW."grossBasisAmount" IS DISTINCT FROM OLD."grossBasisAmount"
    OR NEW."netBasisAmount" IS DISTINCT FROM OLD."netBasisAmount"
    OR NEW."rate" IS DISTINCT FROM OLD."rate"
    OR NEW."amount" IS DISTINCT FROM OLD."amount"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."sourceEntryId" IS DISTINCT FROM OLD."sourceEntryId"
    OR NEW."reason" IS DISTINCT FROM OLD."reason"
    OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR (NEW."orderId" IS DISTINCT FROM OLD."orderId" AND NOT (OLD."orderId" IS NOT NULL AND NEW."orderId" IS NULL))
  THEN
    RAISE EXCEPTION 'Commission ledger financial data is immutable' USING ERRCODE = '23514';
  END IF;
  IF NOT (
    (OLD."status" = 'PENDING' AND NEW."status" IN ('PENDING', 'HOLD', 'CANCELLED', 'REVERSED')) OR
    (OLD."status" = 'HOLD' AND NEW."status" IN ('HOLD', 'APPROVED', 'CANCELLED', 'REVERSED')) OR
    (OLD."status" = 'APPROVED' AND NEW."status" IN ('APPROVED', 'PAYABLE', 'REVERSED')) OR
    (OLD."status" = 'PAYABLE' AND NEW."status" IN ('PAYABLE', 'PAID', 'REVERSED')) OR
    (OLD."status" = 'PAID' AND NEW."status" IN ('PAID', 'REVERSED')) OR
    (OLD."status" IN ('CANCELLED', 'REVERSED') AND NEW."status" = OLD."status")
  ) THEN
    RAISE EXCEPTION 'Invalid commission entry status transition' USING ERRCODE = '23514';
  END IF;
  IF OLD."holdUntil" IS NOT NULL AND NEW."holdUntil" IS DISTINCT FROM OLD."holdUntil" THEN
    RAISE EXCEPTION 'Commission hold evidence is immutable once set' USING ERRCODE = '23514';
  END IF;
  IF OLD."approvedAt" IS NOT NULL AND NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt" THEN
    RAISE EXCEPTION 'Commission approval evidence is immutable once set' USING ERRCODE = '23514';
  END IF;
  IF OLD."payableAt" IS NOT NULL AND NEW."payableAt" IS DISTINCT FROM OLD."payableAt" THEN
    RAISE EXCEPTION 'Commission payable evidence is immutable once set' USING ERRCODE = '23514';
  END IF;
  IF OLD."paidAt" IS NOT NULL AND NEW."paidAt" IS DISTINCT FROM OLD."paidAt" THEN
    RAISE EXCEPTION 'Commission payment evidence is immutable once set' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "CommissionEntry_immutable_guard" BEFORE UPDATE OR DELETE ON "CommissionEntry" FOR EACH ROW EXECUTE FUNCTION "protect_commission_entry"();

INSERT INTO "Permission" ("id", "key", "description", "createdAt", "updatedAt") VALUES
  ('m10_partner_commission_view', 'partner.commission.view', 'Read commission plans, calculation evidence, and ledger balances.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m10_partner_commission_calculate', 'partner.commission.calculate', 'Run deterministic commission calculations for eligible business events.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m10_partner_commission_adjust', 'partner.commission.adjust', 'Create append-only commission adjustment and reversal entries.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m10_partner_commission_approve', 'partner.commission.approve', 'Approve held commission earnings after the return window.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "Role" AS role CROSS JOIN "Permission" AS permission
WHERE role."name" IN ('admin', 'superadmin')
  AND permission."key" IN ('partner.commission.view', 'partner.commission.calculate', 'partner.commission.adjust', 'partner.commission.approve')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
