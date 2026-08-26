-- M3: Business Account + Pricing Engine (strictly additive, forward-only)

CREATE TYPE "BusinessAccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE "BusinessPriceScopeType" AS ENUM ('GLOBAL', 'PRODUCT', 'VARIANT', 'CATEGORY', 'BRAND');
CREATE TYPE "BusinessPriceAdjustmentType" AS ENUM ('FIXED_PRICE', 'PERCENT_DISCOUNT', 'AMOUNT_DISCOUNT');
CREATE TYPE "BusinessPriceSource" AS ENUM ('PUBLIC', 'TIER', 'CONTRACT', 'QUOTATION');

CREATE TABLE "BusinessAccount" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "accountNumber" VARCHAR(32) NOT NULL,
  "status" "BusinessAccountStatus" NOT NULL DEFAULT 'PENDING',
  "pricingTierId" TEXT,
  "accountManagerId" TEXT,
  "paymentTermDays" INTEGER NOT NULL DEFAULT 0,
  "allowCredit" BOOLEAN NOT NULL DEFAULT false,
  "allowCoupons" BOOLEAN NOT NULL DEFAULT false,
  "requirePo" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "activatedAt" TIMESTAMP(3),
  "suspendedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BusinessAccount_paymentTermDays_check" CHECK ("paymentTermDays" BETWEEN 0 AND 365)
);

CREATE TABLE "BusinessPricingTier" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessPricingTier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusinessPricingRule" (
  "id" TEXT NOT NULL,
  "pricingTierId" TEXT NOT NULL,
  "scopeType" "BusinessPriceScopeType" NOT NULL,
  "targetKey" TEXT NOT NULL,
  "productId" INTEGER,
  "variantId" INTEGER,
  "categoryId" INTEGER,
  "brandId" INTEGER,
  "minQuantity" INTEGER NOT NULL DEFAULT 1,
  "adjustmentType" "BusinessPriceAdjustmentType" NOT NULL,
  "value" DECIMAL(14,4) NOT NULL,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessPricingRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BusinessPricingRule_minQuantity_check" CHECK ("minQuantity" > 0),
  CONSTRAINT "BusinessPricingRule_value_check" CHECK (
    "value" > 0 AND ("adjustmentType" <> 'PERCENT_DISCOUNT' OR "value" <= 100)
  ),
  CONSTRAINT "BusinessPricingRule_date_range_check" CHECK (
    "startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" > "startsAt"
  ),
  CONSTRAINT "BusinessPricingRule_target_check" CHECK (
    ("scopeType" = 'GLOBAL' AND "targetKey" = 'GLOBAL' AND "productId" IS NULL AND "variantId" IS NULL AND "categoryId" IS NULL AND "brandId" IS NULL) OR
    ("scopeType" = 'PRODUCT' AND "targetKey" = 'PRODUCT:' || "productId"::TEXT AND "productId" IS NOT NULL AND "variantId" IS NULL AND "categoryId" IS NULL AND "brandId" IS NULL) OR
    ("scopeType" = 'VARIANT' AND "targetKey" = 'VARIANT:' || "variantId"::TEXT AND "productId" IS NULL AND "variantId" IS NOT NULL AND "categoryId" IS NULL AND "brandId" IS NULL) OR
    ("scopeType" = 'CATEGORY' AND "targetKey" = 'CATEGORY:' || "categoryId"::TEXT AND "productId" IS NULL AND "variantId" IS NULL AND "categoryId" IS NOT NULL AND "brandId" IS NULL) OR
    ("scopeType" = 'BRAND' AND "targetKey" = 'BRAND:' || "brandId"::TEXT AND "productId" IS NULL AND "variantId" IS NULL AND "categoryId" IS NULL AND "brandId" IS NOT NULL)
  )
);

CREATE TABLE "ContractPrice" (
  "id" TEXT NOT NULL,
  "businessAccountId" TEXT NOT NULL,
  "scopeType" "BusinessPriceScopeType" NOT NULL,
  "targetKey" TEXT NOT NULL,
  "productId" INTEGER,
  "variantId" INTEGER,
  "categoryId" INTEGER,
  "brandId" INTEGER,
  "minQuantity" INTEGER NOT NULL DEFAULT 1,
  "unitPrice" DECIMAL(14,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'BDT',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContractPrice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContractPrice_minQuantity_check" CHECK ("minQuantity" > 0),
  CONSTRAINT "ContractPrice_unitPrice_check" CHECK ("unitPrice" > 0),
  CONSTRAINT "ContractPrice_currency_check" CHECK (char_length("currency") = 3 AND "currency" = upper("currency")),
  CONSTRAINT "ContractPrice_date_range_check" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt"),
  CONSTRAINT "ContractPrice_target_check" CHECK (
    ("scopeType" = 'GLOBAL' AND "targetKey" = 'GLOBAL' AND "productId" IS NULL AND "variantId" IS NULL AND "categoryId" IS NULL AND "brandId" IS NULL) OR
    ("scopeType" = 'PRODUCT' AND "targetKey" = 'PRODUCT:' || "productId"::TEXT AND "productId" IS NOT NULL AND "variantId" IS NULL AND "categoryId" IS NULL AND "brandId" IS NULL) OR
    ("scopeType" = 'VARIANT' AND "targetKey" = 'VARIANT:' || "variantId"::TEXT AND "productId" IS NULL AND "variantId" IS NOT NULL AND "categoryId" IS NULL AND "brandId" IS NULL) OR
    ("scopeType" = 'CATEGORY' AND "targetKey" = 'CATEGORY:' || "categoryId"::TEXT AND "productId" IS NULL AND "variantId" IS NULL AND "categoryId" IS NOT NULL AND "brandId" IS NULL) OR
    ("scopeType" = 'BRAND' AND "targetKey" = 'BRAND:' || "brandId"::TEXT AND "productId" IS NULL AND "variantId" IS NULL AND "categoryId" IS NULL AND "brandId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "BusinessAccount_organizationId_key" ON "BusinessAccount"("organizationId");
CREATE UNIQUE INDEX "BusinessAccount_accountNumber_key" ON "BusinessAccount"("accountNumber");
CREATE INDEX "BusinessAccount_status_idx" ON "BusinessAccount"("status");
CREATE INDEX "BusinessAccount_pricingTierId_idx" ON "BusinessAccount"("pricingTierId");
CREATE INDEX "BusinessAccount_accountManagerId_idx" ON "BusinessAccount"("accountManagerId");

CREATE UNIQUE INDEX "BusinessPricingTier_code_key" ON "BusinessPricingTier"("code");
CREATE INDEX "BusinessPricingTier_isActive_priority_idx" ON "BusinessPricingTier"("isActive", "priority");

CREATE INDEX "BusinessPricingRule_pricingTierId_isActive_priority_idx" ON "BusinessPricingRule"("pricingTierId", "isActive", "priority");
CREATE INDEX "BusinessPricingRule_productId_idx" ON "BusinessPricingRule"("productId");
CREATE INDEX "BusinessPricingRule_variantId_idx" ON "BusinessPricingRule"("variantId");
CREATE INDEX "BusinessPricingRule_categoryId_idx" ON "BusinessPricingRule"("categoryId");
CREATE INDEX "BusinessPricingRule_brandId_idx" ON "BusinessPricingRule"("brandId");
CREATE UNIQUE INDEX "BusinessPricingRule_pricingTierId_targetKey_minQuantity_key" ON "BusinessPricingRule"("pricingTierId", "targetKey", "minQuantity");

CREATE INDEX "ContractPrice_businessAccountId_isActive_idx" ON "ContractPrice"("businessAccountId", "isActive");
CREATE INDEX "ContractPrice_productId_idx" ON "ContractPrice"("productId");
CREATE INDEX "ContractPrice_variantId_idx" ON "ContractPrice"("variantId");
CREATE INDEX "ContractPrice_startsAt_endsAt_idx" ON "ContractPrice"("startsAt", "endsAt");

ALTER TABLE "BusinessAccount"
  ADD CONSTRAINT "BusinessAccount_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessAccount"
  ADD CONSTRAINT "BusinessAccount_pricingTierId_fkey"
  FOREIGN KEY ("pricingTierId") REFERENCES "BusinessPricingTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessPricingRule"
  ADD CONSTRAINT "BusinessPricingRule_pricingTierId_fkey"
  FOREIGN KEY ("pricingTierId") REFERENCES "BusinessPricingTier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractPrice"
  ADD CONSTRAINT "ContractPrice_businessAccountId_fkey"
  FOREIGN KEY ("businessAccountId") REFERENCES "BusinessAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bootstrap the M3 internal RBAC keys and grant them to existing full-admin roles.
INSERT INTO "Permission" ("id", "key", "description", "createdAt", "updatedAt") VALUES
  ('m3_business_account_view', 'business.account.view', 'Read business accounts and their commercial configuration.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m3_business_account_manage', 'business.account.manage', 'Create and update business accounts and account status.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m3_business_pricing_view', 'business.pricing.view', 'Read business pricing tiers, rules, and contract prices.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m3_business_pricing_manage', 'business.pricing.manage', 'Create and update business pricing tiers, rules, and contracts.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET
  "description" = EXCLUDED."description",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "Role" AS role
CROSS JOIN "Permission" AS permission
WHERE role."name" IN ('admin', 'superadmin')
  AND permission."key" IN (
    'business.account.view',
    'business.account.manage',
    'business.pricing.view',
    'business.pricing.manage'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
