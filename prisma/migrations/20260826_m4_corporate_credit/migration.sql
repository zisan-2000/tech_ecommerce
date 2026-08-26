-- M4 Corporate Credit: additive credit account and immutable application ledger foundation.
CREATE TYPE "CreditLedgerEntryType" AS ENUM (
  'CREDIT_DRAW',
  'REPAYMENT',
  'CREDIT_NOTE',
  'DEBIT_ADJUSTMENT',
  'CREDIT_ADJUSTMENT'
);

CREATE TYPE "CreditLedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

CREATE TABLE "OrganizationCreditAccount" (
  "id" TEXT NOT NULL,
  "businessAccountId" TEXT NOT NULL,
  "creditLimit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "currentBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'BDT',
  "paymentTermDays" INTEGER NOT NULL DEFAULT 30,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "reviewDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationCreditAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrganizationCreditAccount_credit_values_check"
    CHECK ("creditLimit" >= 0 AND "currentBalance" >= 0 AND "currentBalance" <= "creditLimit"),
  CONSTRAINT "OrganizationCreditAccount_currency_check"
    CHECK (char_length("currency") = 3 AND "currency" = upper("currency")),
  CONSTRAINT "OrganizationCreditAccount_payment_terms_check"
    CHECK ("paymentTermDays" >= 0 AND "paymentTermDays" <= 365)
);

CREATE TABLE "CreditLedgerEntry" (
  "id" TEXT NOT NULL,
  "creditAccountId" TEXT NOT NULL,
  "type" "CreditLedgerEntryType" NOT NULL,
  "direction" "CreditLedgerDirection" NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'BDT',
  "orderId" INTEGER,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "description" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreditLedgerEntry_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "CreditLedgerEntry_currency_check"
    CHECK (char_length("currency") = 3 AND "currency" = upper("currency")),
  CONSTRAINT "CreditLedgerEntry_source_pair_check"
    CHECK (
      ("sourceType" IS NULL AND "sourceId" IS NULL) OR
      (length(btrim("sourceType")) > 0 AND length(btrim("sourceId")) > 0)
    ),
  CONSTRAINT "CreditLedgerEntry_direction_check"
    CHECK (
      ("type" IN ('CREDIT_DRAW', 'DEBIT_ADJUSTMENT') AND "direction" = 'DEBIT') OR
      ("type" IN ('REPAYMENT', 'CREDIT_NOTE', 'CREDIT_ADJUSTMENT') AND "direction" = 'CREDIT')
    )
);

CREATE UNIQUE INDEX "OrganizationCreditAccount_businessAccountId_key"
  ON "OrganizationCreditAccount"("businessAccountId");
CREATE INDEX "OrganizationCreditAccount_isActive_reviewDate_idx"
  ON "OrganizationCreditAccount"("isActive", "reviewDate");
CREATE INDEX "CreditLedgerEntry_creditAccountId_createdAt_idx"
  ON "CreditLedgerEntry"("creditAccountId", "createdAt");
CREATE INDEX "CreditLedgerEntry_orderId_idx" ON "CreditLedgerEntry"("orderId");
CREATE INDEX "CreditLedgerEntry_sourceType_sourceId_idx"
  ON "CreditLedgerEntry"("sourceType", "sourceId");
CREATE UNIQUE INDEX "CreditLedgerEntry_creditAccountId_sourceType_sourceId_key"
  ON "CreditLedgerEntry"("creditAccountId", "sourceType", "sourceId")
  WHERE "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL;

ALTER TABLE "OrganizationCreditAccount"
  ADD CONSTRAINT "OrganizationCreditAccount_businessAccountId_fkey"
  FOREIGN KEY ("businessAccountId") REFERENCES "BusinessAccount"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditLedgerEntry"
  ADD CONSTRAINT "CreditLedgerEntry_creditAccountId_fkey"
  FOREIGN KEY ("creditAccountId") REFERENCES "OrganizationCreditAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CreditLedgerEntry"
  ADD CONSTRAINT "CreditLedgerEntry_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Provision zero-limit accounts for any business accounts that already opted into credit in M3.
INSERT INTO "OrganizationCreditAccount" (
  "id", "businessAccountId", "creditLimit", "currentBalance", "currency",
  "paymentTermDays", "isActive", "createdAt", "updatedAt"
)
SELECT
  'm4_credit_' || md5(account."id"),
  account."id",
  0,
  0,
  organization."currency",
  CASE WHEN account."paymentTermDays" > 0 THEN account."paymentTermDays" ELSE 30 END,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "BusinessAccount" AS account
JOIN "Organization" AS organization ON organization."id" = account."organizationId"
WHERE account."allowCredit" = true
ON CONFLICT ("businessAccountId") DO NOTHING;

-- Bootstrap frozen M4 internal permissions for existing full-admin roles.
INSERT INTO "Permission" ("id", "key", "description", "createdAt", "updatedAt") VALUES
  ('m4_business_credit_view', 'business.credit.view', 'Read corporate credit accounts, limits, balances, and ledgers.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m4_business_credit_manage', 'business.credit.manage', 'Configure corporate credit limits, terms, reviews, and availability.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m4_business_credit_adjust', 'business.credit.adjust', 'Post audited debit or credit adjustments to the corporate credit ledger.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET
  "description" = EXCLUDED."description",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "Role" AS role
CROSS JOIN "Permission" AS permission
WHERE role."name" IN ('admin', 'superadmin')
  AND permission."key" IN (
    'business.credit.view',
    'business.credit.manage',
    'business.credit.adjust'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
