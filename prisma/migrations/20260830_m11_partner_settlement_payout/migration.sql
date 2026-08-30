-- M11 Partner Settlement + encrypted Payout Accounts.
CREATE TYPE "PartnerSettlementStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED');
CREATE TYPE "PartnerPayoutAccountType" AS ENUM ('BANK', 'MOBILE_WALLET');
CREATE TYPE "PartnerPayoutAccountStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'DISABLED');

CREATE SEQUENCE "PartnerSettlementNumber_seq" START 1;

CREATE TABLE "PartnerPayoutAccount" (
  "id" TEXT NOT NULL,
  "partnerProfileId" TEXT NOT NULL,
  "type" "PartnerPayoutAccountType" NOT NULL,
  "status" "PartnerPayoutAccountStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "accountName" TEXT NOT NULL,
  "bankName" TEXT,
  "branchName" TEXT,
  "routingNumber" TEXT,
  "providerName" TEXT,
  "accountNumberEncrypted" TEXT NOT NULL,
  "accountNumberLast4" VARCHAR(4),
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "verifiedAt" TIMESTAMP(3),
  "verifiedById" TEXT,
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerPayoutAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerPayoutAccount_name_check" CHECK (length(btrim("accountName")) BETWEEN 2 AND 160),
  CONSTRAINT "PartnerPayoutAccount_ciphertext_check" CHECK ("accountNumberEncrypted" ~ '^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'),
  CONSTRAINT "PartnerPayoutAccount_last4_check" CHECK ("accountNumberLast4" IS NULL OR "accountNumberLast4" ~ '^[A-Z0-9]{1,4}$'),
  CONSTRAINT "PartnerPayoutAccount_type_check" CHECK (
    ("type" = 'BANK' AND length(btrim(COALESCE("bankName", ''))) > 0 AND "providerName" IS NULL) OR
    ("type" = 'MOBILE_WALLET' AND length(btrim(COALESCE("providerName", ''))) > 0 AND "bankName" IS NULL AND "branchName" IS NULL AND "routingNumber" IS NULL)
  ),
  CONSTRAINT "PartnerPayoutAccount_verification_check" CHECK (
    ("status" = 'VERIFIED' AND "verifiedAt" IS NOT NULL AND "verifiedById" IS NOT NULL AND "rejectionReason" IS NULL) OR
    ("status" = 'REJECTED' AND "verifiedAt" IS NULL AND "verifiedById" IS NULL AND length(btrim(COALESCE("rejectionReason", ''))) BETWEEN 3 AND 500) OR
    ("status" = 'PENDING_VERIFICATION' AND "verifiedAt" IS NULL AND "verifiedById" IS NULL AND "rejectionReason" IS NULL) OR
    "status" = 'DISABLED'
  ),
  CONSTRAINT "PartnerPayoutAccount_default_check" CHECK (NOT "isDefault" OR "status" = 'VERIFIED')
);

CREATE TABLE "PartnerSettlement" (
  "id" TEXT NOT NULL,
  "settlementNumber" VARCHAR(32) NOT NULL,
  "partnerProfileId" TEXT NOT NULL,
  "status" "PartnerSettlementStatus" NOT NULL DEFAULT 'DRAFT',
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "grossCommission" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "adjustments" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "netPayable" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'BDT',
  "payoutAccountId" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "processingAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "paidAt" TIMESTAMP(3),
  "paymentReference" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerSettlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerSettlement_number_check" CHECK ("settlementNumber" ~ '^SET-[0-9]{8}$'),
  CONSTRAINT "PartnerSettlement_period_check" CHECK ("periodEnd" > "periodStart"),
  CONSTRAINT "PartnerSettlement_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "PartnerSettlement_amount_check" CHECK (
    "grossCommission" >= 0 AND "netPayable" > 0 AND "grossCommission" + "adjustments" = "netPayable"
  ),
  CONSTRAINT "PartnerSettlement_failure_reason_check" CHECK ("failureReason" IS NULL OR length(btrim("failureReason")) BETWEEN 3 AND 500),
  CONSTRAINT "PartnerSettlement_cancellation_reason_check" CHECK ("cancellationReason" IS NULL OR length(btrim("cancellationReason")) BETWEEN 3 AND 500),
  CONSTRAINT "PartnerSettlement_payment_reference_check" CHECK ("paymentReference" IS NULL OR length(btrim("paymentReference")) BETWEEN 3 AND 160),
  CONSTRAINT "PartnerSettlement_lifecycle_evidence_check" CHECK (
    ("status" = 'DRAFT' AND "submittedAt" IS NULL AND "approvedAt" IS NULL AND "approvedById" IS NULL AND "processingAt" IS NULL AND "failedAt" IS NULL AND "failureReason" IS NULL AND "paidAt" IS NULL AND "paymentReference" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL) OR
    ("status" = 'SUBMITTED' AND "payoutAccountId" IS NOT NULL AND "submittedAt" IS NOT NULL AND "approvedAt" IS NULL AND "approvedById" IS NULL AND "processingAt" IS NULL AND "failedAt" IS NULL AND "failureReason" IS NULL AND "paidAt" IS NULL AND "paymentReference" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL) OR
    ("status" = 'APPROVED' AND "payoutAccountId" IS NOT NULL AND "submittedAt" IS NOT NULL AND "approvedAt" IS NOT NULL AND "approvedById" IS NOT NULL AND "processingAt" IS NULL AND "failedAt" IS NULL AND "failureReason" IS NULL AND "paidAt" IS NULL AND "paymentReference" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL) OR
    ("status" = 'PROCESSING' AND "payoutAccountId" IS NOT NULL AND "submittedAt" IS NOT NULL AND "approvedAt" IS NOT NULL AND "approvedById" IS NOT NULL AND "processingAt" IS NOT NULL AND "failedAt" IS NULL AND "failureReason" IS NULL AND "paidAt" IS NULL AND "paymentReference" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL) OR
    ("status" = 'PAID' AND "payoutAccountId" IS NOT NULL AND "submittedAt" IS NOT NULL AND "approvedAt" IS NOT NULL AND "approvedById" IS NOT NULL AND "processingAt" IS NOT NULL AND "failedAt" IS NULL AND "failureReason" IS NULL AND "paidAt" IS NOT NULL AND "paymentReference" IS NOT NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL) OR
    ("status" = 'FAILED' AND "payoutAccountId" IS NOT NULL AND "submittedAt" IS NOT NULL AND "approvedAt" IS NOT NULL AND "approvedById" IS NOT NULL AND "processingAt" IS NOT NULL AND "failedAt" IS NOT NULL AND "failureReason" IS NOT NULL AND "paidAt" IS NULL AND "paymentReference" IS NULL AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL) OR
    ("status" = 'CANCELLED' AND "paidAt" IS NULL AND "paymentReference" IS NULL AND "cancelledAt" IS NOT NULL AND "cancellationReason" IS NOT NULL)
  )
);

CREATE TABLE "PartnerSettlementLine" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "commissionEntryId" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerSettlementLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerSettlementLine_amount_check" CHECK ("amount" <> 0)
);

CREATE UNIQUE INDEX "PartnerSettlement_settlementNumber_key" ON "PartnerSettlement"("settlementNumber");
CREATE UNIQUE INDEX "PartnerSettlement_paymentReference_key" ON "PartnerSettlement"("paymentReference") WHERE "paymentReference" IS NOT NULL;
CREATE INDEX "PartnerSettlement_partnerProfileId_status_idx" ON "PartnerSettlement"("partnerProfileId", "status");
CREATE INDEX "PartnerSettlement_periodStart_periodEnd_idx" ON "PartnerSettlement"("periodStart", "periodEnd");
CREATE INDEX "PartnerSettlement_payoutAccountId_status_idx" ON "PartnerSettlement"("payoutAccountId", "status");
CREATE UNIQUE INDEX "PartnerSettlementLine_commissionEntryId_key" ON "PartnerSettlementLine"("commissionEntryId");
CREATE INDEX "PartnerSettlementLine_settlementId_idx" ON "PartnerSettlementLine"("settlementId");
CREATE INDEX "PartnerPayoutAccount_partnerProfileId_status_idx" ON "PartnerPayoutAccount"("partnerProfileId", "status");
CREATE UNIQUE INDEX "PartnerPayoutAccount_default_key" ON "PartnerPayoutAccount"("partnerProfileId") WHERE "isDefault" = true;

ALTER TABLE "PartnerPayoutAccount" ADD CONSTRAINT "PartnerPayoutAccount_partnerProfileId_fkey" FOREIGN KEY ("partnerProfileId") REFERENCES "PartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerPayoutAccount" ADD CONSTRAINT "PartnerPayoutAccount_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerSettlement" ADD CONSTRAINT "PartnerSettlement_partnerProfileId_fkey" FOREIGN KEY ("partnerProfileId") REFERENCES "PartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerSettlement" ADD CONSTRAINT "PartnerSettlement_payoutAccountId_fkey" FOREIGN KEY ("payoutAccountId") REFERENCES "PartnerPayoutAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerSettlement" ADD CONSTRAINT "PartnerSettlement_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerSettlementLine" ADD CONSTRAINT "PartnerSettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "PartnerSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerSettlementLine" ADD CONSTRAINT "PartnerSettlementLine_commissionEntryId_fkey" FOREIGN KEY ("commissionEntryId") REFERENCES "CommissionEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "protect_partner_payout_account"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Payout accounts cannot be deleted; disable them instead' USING ERRCODE = '23514';
  END IF;
  IF OLD."status" = 'DISABLED' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Disabled payout accounts are immutable' USING ERRCODE = '23514';
  END IF;
  IF NOT (
    (OLD."status" = 'PENDING_VERIFICATION' AND NEW."status" IN ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'DISABLED')) OR
    (OLD."status" = 'VERIFIED' AND NEW."status" IN ('VERIFIED', 'PENDING_VERIFICATION', 'REJECTED', 'DISABLED')) OR
    (OLD."status" = 'REJECTED' AND NEW."status" IN ('REJECTED', 'PENDING_VERIFICATION', 'VERIFIED', 'DISABLED')) OR
    (OLD."status" = 'DISABLED' AND NEW."status" = 'DISABLED')
  ) THEN
    RAISE EXCEPTION 'Invalid payout account status transition' USING ERRCODE = '23514';
  END IF;
  IF (
    NEW."type" IS DISTINCT FROM OLD."type" OR NEW."accountName" IS DISTINCT FROM OLD."accountName" OR
    NEW."bankName" IS DISTINCT FROM OLD."bankName" OR NEW."branchName" IS DISTINCT FROM OLD."branchName" OR
    NEW."routingNumber" IS DISTINCT FROM OLD."routingNumber" OR NEW."providerName" IS DISTINCT FROM OLD."providerName" OR
    NEW."accountNumberEncrypted" IS DISTINCT FROM OLD."accountNumberEncrypted" OR NEW."accountNumberLast4" IS DISTINCT FROM OLD."accountNumberLast4"
  ) AND NEW."status" <> 'PENDING_VERIFICATION' THEN
    RAISE EXCEPTION 'Changed payout details require re-verification' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "PartnerSettlement"
    WHERE "payoutAccountId" = OLD."id" AND "status" IN ('SUBMITTED', 'APPROVED', 'PROCESSING')
  ) AND (NEW."status" IS DISTINCT FROM OLD."status" OR NEW."accountNumberEncrypted" IS DISTINCT FROM OLD."accountNumberEncrypted") THEN
    RAISE EXCEPTION 'Payout account is locked by an active settlement' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PartnerPayoutAccount_guard" BEFORE UPDATE OR DELETE ON "PartnerPayoutAccount" FOR EACH ROW EXECUTE FUNCTION "protect_partner_payout_account"();

CREATE FUNCTION "protect_partner_settlement"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Partner settlements cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF NEW."partnerProfileId" IS DISTINCT FROM OLD."partnerProfileId" OR
    NEW."settlementNumber" IS DISTINCT FROM OLD."settlementNumber" OR
    NEW."periodStart" IS DISTINCT FROM OLD."periodStart" OR NEW."periodEnd" IS DISTINCT FROM OLD."periodEnd" OR
    NEW."grossCommission" IS DISTINCT FROM OLD."grossCommission" OR NEW."adjustments" IS DISTINCT FROM OLD."adjustments" OR
    NEW."netPayable" IS DISTINCT FROM OLD."netPayable" OR NEW."currency" IS DISTINCT FROM OLD."currency" OR
    NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Settlement financial snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD."status" <> 'DRAFT' AND NEW."payoutAccountId" IS DISTINCT FROM OLD."payoutAccountId" THEN
    RAISE EXCEPTION 'Submitted settlement payout account is immutable' USING ERRCODE = '23514';
  END IF;
  IF NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('DRAFT', 'SUBMITTED', 'CANCELLED')) OR
    (OLD."status" = 'SUBMITTED' AND NEW."status" IN ('SUBMITTED', 'APPROVED', 'CANCELLED')) OR
    (OLD."status" = 'APPROVED' AND NEW."status" IN ('APPROVED', 'PROCESSING', 'CANCELLED')) OR
    (OLD."status" = 'PROCESSING' AND NEW."status" IN ('PROCESSING', 'PAID', 'FAILED')) OR
    (OLD."status" = 'FAILED' AND NEW."status" IN ('FAILED', 'PROCESSING', 'CANCELLED')) OR
    (OLD."status" IN ('PAID', 'CANCELLED') AND NEW."status" = OLD."status")
  ) THEN
    RAISE EXCEPTION 'Invalid partner settlement status transition' USING ERRCODE = '23514';
  END IF;
  IF NEW."status" = 'SUBMITTED' AND EXISTS (
    SELECT 1 FROM "PartnerSettlementLine" line JOIN "CommissionEntry" entry ON entry."id" = line."commissionEntryId"
    WHERE line."settlementId" = NEW."id" AND entry."status" <> 'APPROVED'
  ) THEN
    RAISE EXCEPTION 'Only approved commission entries may be submitted' USING ERRCODE = '23514';
  END IF;
  IF NEW."status" = 'PAID' AND EXISTS (
    SELECT 1 FROM "PartnerSettlementLine" line JOIN "CommissionEntry" entry ON entry."id" = line."commissionEntryId"
    WHERE line."settlementId" = NEW."id" AND entry."status" NOT IN ('PAYABLE', 'REVERSED')
  ) THEN
    RAISE EXCEPTION 'Settlement contains an entry that cannot be paid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PartnerSettlement_guard" BEFORE UPDATE OR DELETE ON "PartnerSettlement" FOR EACH ROW EXECUTE FUNCTION "protect_partner_settlement"();

CREATE FUNCTION "protect_partner_settlement_line"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE settlement_row "PartnerSettlement"%ROWTYPE;
DECLARE entry_row "CommissionEntry"%ROWTYPE;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'Settlement lines are immutable' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO settlement_row FROM "PartnerSettlement" WHERE "id" = NEW."settlementId";
  SELECT * INTO entry_row FROM "CommissionEntry" WHERE "id" = NEW."commissionEntryId";
  IF settlement_row."status" <> 'DRAFT' OR entry_row."status" <> 'APPROVED' OR
    entry_row."partnerProfileId" <> settlement_row."partnerProfileId" OR
    entry_row."currency" <> settlement_row."currency" OR entry_row."amount" <> NEW."amount" OR
    entry_row."createdAt" < settlement_row."periodStart" OR entry_row."createdAt" > settlement_row."periodEnd"
  THEN
    RAISE EXCEPTION 'Settlement line does not match an eligible approved commission entry' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PartnerSettlementLine_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PartnerSettlementLine" FOR EACH ROW EXECUTE FUNCTION "protect_partner_settlement_line"();

CREATE OR REPLACE FUNCTION "protect_commission_entry"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE settlement_status "PartnerSettlementStatus";
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
    (OLD."status" = 'PAYABLE' AND NEW."status" IN ('PAYABLE', 'PAID', 'APPROVED', 'REVERSED')) OR
    (OLD."status" = 'PAID' AND NEW."status" IN ('PAID', 'REVERSED')) OR
    (OLD."status" IN ('CANCELLED', 'REVERSED') AND NEW."status" = OLD."status")
  ) THEN
    RAISE EXCEPTION 'Invalid commission entry status transition' USING ERRCODE = '23514';
  END IF;
  IF OLD."status" IS DISTINCT FROM NEW."status" AND (OLD."status", NEW."status") IN (('APPROVED', 'PAYABLE'), ('PAYABLE', 'PAID'), ('PAYABLE', 'APPROVED')) THEN
    SELECT settlement."status" INTO settlement_status
    FROM "PartnerSettlementLine" line JOIN "PartnerSettlement" settlement ON settlement."id" = line."settlementId"
    WHERE line."commissionEntryId" = OLD."id";
    IF settlement_status IS NULL OR
       (OLD."status" = 'APPROVED' AND NEW."status" = 'PAYABLE' AND settlement_status NOT IN ('SUBMITTED', 'APPROVED')) OR
       (OLD."status" = 'PAYABLE' AND NEW."status" = 'PAID' AND settlement_status <> 'PAID') OR
       (OLD."status" = 'PAYABLE' AND NEW."status" = 'APPROVED' AND settlement_status <> 'CANCELLED')
    THEN
      RAISE EXCEPTION 'Commission settlement transition lacks matching settlement evidence' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF OLD."holdUntil" IS NOT NULL AND NEW."holdUntil" IS DISTINCT FROM OLD."holdUntil" THEN
    RAISE EXCEPTION 'Commission hold evidence is immutable once set' USING ERRCODE = '23514';
  END IF;
  IF OLD."approvedAt" IS NOT NULL AND NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt" THEN
    RAISE EXCEPTION 'Commission approval evidence is immutable once set' USING ERRCODE = '23514';
  END IF;
  IF OLD."payableAt" IS NOT NULL AND NEW."payableAt" IS DISTINCT FROM OLD."payableAt" AND NOT (
    OLD."status" = 'PAYABLE' AND NEW."status" = 'APPROVED' AND NEW."payableAt" IS NULL AND settlement_status = 'CANCELLED'
  ) THEN
    RAISE EXCEPTION 'Commission payable evidence is immutable once set' USING ERRCODE = '23514';
  END IF;
  IF OLD."paidAt" IS NOT NULL AND NEW."paidAt" IS DISTINCT FROM OLD."paidAt" THEN
    RAISE EXCEPTION 'Commission payment evidence is immutable once set' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

INSERT INTO "Permission" ("id", "key", "description", "createdAt", "updatedAt") VALUES
  ('m11_partner_settlement_view', 'partner.settlement.view', 'Read partner settlement runs, immutable line snapshots, and payment evidence.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m11_partner_settlement_create', 'partner.settlement.create', 'Create and submit partner settlement runs from approved commission entries.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m11_partner_settlement_approve', 'partner.settlement.approve', 'Approve submitted partner settlements for payout processing.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m11_partner_settlement_pay', 'partner.settlement.pay', 'Process partner payouts and record final payment reconciliation evidence.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m11_partner_payout_account_view', 'partner.payout_account.view', 'Read masked partner payout account and verification details.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m11_partner_payout_account_verify', 'partner.payout_account.verify', 'Verify or reject encrypted partner payout accounts.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "Role" AS role CROSS JOIN "Permission" AS permission
WHERE role."name" IN ('admin', 'superadmin')
  AND permission."key" IN (
    'partner.settlement.view', 'partner.settlement.create', 'partner.settlement.approve',
    'partner.settlement.pay', 'partner.payout_account.view', 'partner.payout_account.verify'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
