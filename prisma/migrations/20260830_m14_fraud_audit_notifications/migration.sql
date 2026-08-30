-- M14 Fraud Detection, tamper-resistant Audit, and Business Notifications.
-- This migration is additive except for hardening BusinessAuditLog against mutation.

CREATE TYPE "BusinessFraudRuleType" AS ENUM (
  'SELF_REFERRAL', 'DUPLICATE_LEAD', 'REPEATED_CANCELLED_REFERRALS',
  'REPEATED_REFUND_REFERRALS', 'SAME_ORGANIZATION', 'SAME_USER',
  'SAME_PHONE', 'SAME_EMAIL', 'SUSPICIOUS_IP', 'SUSPICIOUS_DEVICE',
  'UNUSUAL_CONVERSION_RATE', 'COMMISSION_SPIKE'
);
CREATE TYPE "BusinessRiskSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "BusinessRiskCaseStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'CONFIRMED', 'FALSE_POSITIVE', 'RESOLVED');
CREATE TYPE "BusinessNotificationCategory" AS ENUM ('ORGANIZATION', 'SALES', 'FINANCE', 'PARTNERSHIP', 'SECURITY', 'SYSTEM');
CREATE TYPE "BusinessNotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "BusinessNotificationChannel" AS ENUM ('EMAIL');
CREATE TYPE "BusinessNotificationDeliveryStatus" AS ENUM ('QUEUED', 'PROCESSING', 'DELIVERED', 'FAILED', 'SKIPPED');

ALTER TABLE "BusinessAuditLog"
  ADD COLUMN "integrityNonce" VARCHAR(80),
  ADD COLUMN "integrityHash" VARCHAR(64),
  ADD COLUMN "integrityVersion" INTEGER NOT NULL DEFAULT 1;

UPDATE "BusinessAuditLog"
SET "integrityNonce" = 'legacy-' || "id"::text,
    "integrityHash" = md5('business-audit-legacy:' || "id"::text || ':' || "createdAt"::text)
                    || md5('business-audit-legacy-v1:' || "id"::text || ':' || "action");

ALTER TABLE "BusinessAuditLog"
  ALTER COLUMN "integrityNonce" SET NOT NULL,
  ALTER COLUMN "integrityHash" SET NOT NULL,
  ADD CONSTRAINT "BusinessAuditLog_integrity_version_check" CHECK ("integrityVersion" = 1),
  ADD CONSTRAINT "BusinessAuditLog_integrity_nonce_check" CHECK (length(btrim("integrityNonce")) BETWEEN 8 AND 80),
  ADD CONSTRAINT "BusinessAuditLog_integrity_hash_check" CHECK ("integrityHash" ~ '^[a-f0-9]{64}$');

CREATE UNIQUE INDEX "BusinessAuditLog_integrityNonce_key" ON "BusinessAuditLog"("integrityNonce");
CREATE UNIQUE INDEX "BusinessAuditLog_integrityHash_key" ON "BusinessAuditLog"("integrityHash");

CREATE OR REPLACE FUNCTION prevent_business_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Business audit records are append-only and immutable' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "BusinessAuditLog_immutable"
BEFORE UPDATE OR DELETE ON "BusinessAuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_business_audit_mutation();

CREATE TABLE "BusinessFraudRule" (
  "id" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "type" "BusinessFraudRuleType" NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "severity" "BusinessRiskSeverity" NOT NULL,
  "riskScore" INTEGER NOT NULL DEFAULT 50,
  "configuration" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessFraudRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BusinessFraudRule_code_check" CHECK ("code" ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  CONSTRAINT "BusinessFraudRule_name_check" CHECK (length(btrim("name")) BETWEEN 3 AND 120),
  CONSTRAINT "BusinessFraudRule_score_check" CHECK ("riskScore" BETWEEN 1 AND 100)
);

CREATE UNIQUE INDEX "BusinessFraudRule_code_key" ON "BusinessFraudRule"("code");
CREATE INDEX "BusinessFraudRule_type_isActive_idx" ON "BusinessFraudRule"("type", "isActive");
CREATE INDEX "BusinessFraudRule_severity_isActive_idx" ON "BusinessFraudRule"("severity", "isActive");

CREATE SEQUENCE "BusinessRiskCaseNumber_seq" START 1;

CREATE TABLE "BusinessRiskCase" (
  "id" TEXT NOT NULL,
  "caseNumber" VARCHAR(32) NOT NULL,
  "ruleId" TEXT NOT NULL,
  "fingerprint" VARCHAR(64) NOT NULL,
  "organizationId" TEXT,
  "partnerProfileId" TEXT,
  "attributionId" TEXT,
  "partnerLeadId" TEXT,
  "commissionEntryId" TEXT,
  "orderId" INTEGER,
  "severity" "BusinessRiskSeverity" NOT NULL,
  "status" "BusinessRiskCaseStatus" NOT NULL DEFAULT 'OPEN',
  "riskScore" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "assignedToUserId" TEXT,
  "reviewedByUserId" TEXT,
  "resolutionNote" TEXT,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessRiskCase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BusinessRiskCase_number_check" CHECK ("caseNumber" ~ '^RISK-[0-9]{8}$'),
  CONSTRAINT "BusinessRiskCase_fingerprint_check" CHECK ("fingerprint" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "BusinessRiskCase_score_check" CHECK ("riskScore" BETWEEN 1 AND 100),
  CONSTRAINT "BusinessRiskCase_title_check" CHECK (length(btrim("title")) BETWEEN 3 AND 160),
  CONSTRAINT "BusinessRiskCase_summary_check" CHECK (length(btrim("summary")) BETWEEN 3 AND 1000),
  CONSTRAINT "BusinessRiskCase_resolution_check" CHECK (
    ("status" = 'OPEN' AND "reviewedByUserId" IS NULL AND "reviewedAt" IS NULL AND "resolvedAt" IS NULL AND "resolutionNote" IS NULL) OR
    ("status" = 'UNDER_REVIEW' AND "reviewedByUserId" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "resolvedAt" IS NULL) OR
    ("status" = 'CONFIRMED' AND "reviewedByUserId" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "resolvedAt" IS NULL AND length(btrim(COALESCE("resolutionNote", ''))) BETWEEN 3 AND 1000) OR
    ("status" IN ('FALSE_POSITIVE', 'RESOLVED') AND "reviewedByUserId" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "resolvedAt" IS NOT NULL AND length(btrim(COALESCE("resolutionNote", ''))) BETWEEN 3 AND 1000)
  )
);

CREATE UNIQUE INDEX "BusinessRiskCase_caseNumber_key" ON "BusinessRiskCase"("caseNumber");
CREATE UNIQUE INDEX "BusinessRiskCase_fingerprint_key" ON "BusinessRiskCase"("fingerprint");
CREATE INDEX "BusinessRiskCase_status_severity_detectedAt_idx" ON "BusinessRiskCase"("status", "severity", "detectedAt");
CREATE INDEX "BusinessRiskCase_organizationId_status_idx" ON "BusinessRiskCase"("organizationId", "status");
CREATE INDEX "BusinessRiskCase_partnerProfileId_status_idx" ON "BusinessRiskCase"("partnerProfileId", "status");
CREATE INDEX "BusinessRiskCase_assignedToUserId_status_idx" ON "BusinessRiskCase"("assignedToUserId", "status");
CREATE INDEX "BusinessRiskCase_orderId_idx" ON "BusinessRiskCase"("orderId");

CREATE TABLE "BusinessNotification" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "recipientUserId" TEXT NOT NULL,
  "category" "BusinessNotificationCategory" NOT NULL,
  "priority" "BusinessNotificationPriority" NOT NULL DEFAULT 'NORMAL',
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "actionUrl" TEXT,
  "entityType" TEXT,
  "entityId" TEXT,
  "dedupeKey" VARCHAR(190) NOT NULL,
  "readAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BusinessNotification_title_check" CHECK (length(btrim("title")) BETWEEN 3 AND 160),
  CONSTRAINT "BusinessNotification_body_check" CHECK (length(btrim("body")) BETWEEN 3 AND 1000),
  CONSTRAINT "BusinessNotification_action_url_check" CHECK ("actionUrl" IS NULL OR "actionUrl" ~ '^/business(/|$)'),
  CONSTRAINT "BusinessNotification_expiry_check" CHECK ("expiresAt" IS NULL OR "expiresAt" > "createdAt")
);

CREATE UNIQUE INDEX "BusinessNotification_dedupeKey_key" ON "BusinessNotification"("dedupeKey");
CREATE INDEX "BusinessNotification_memberId_archivedAt_createdAt_idx" ON "BusinessNotification"("memberId", "archivedAt", "createdAt");
CREATE INDEX "BusinessNotification_recipientUserId_readAt_createdAt_idx" ON "BusinessNotification"("recipientUserId", "readAt", "createdAt");
CREATE INDEX "BusinessNotification_organizationId_category_createdAt_idx" ON "BusinessNotification"("organizationId", "category", "createdAt");

CREATE TABLE "BusinessNotificationDelivery" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "channel" "BusinessNotificationChannel" NOT NULL,
  "status" "BusinessNotificationDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
  "recipientAddress" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessNotificationDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BusinessNotificationDelivery_attempts_check" CHECK ("attempts" BETWEEN 0 AND 5),
  CONSTRAINT "BusinessNotificationDelivery_address_check" CHECK (length(btrim("recipientAddress")) BETWEEN 3 AND 320),
  CONSTRAINT "BusinessNotificationDelivery_state_check" CHECK (
    ("status" = 'DELIVERED' AND "deliveredAt" IS NOT NULL AND "lastErrorCode" IS NULL) OR
    ("status" IN ('QUEUED', 'PROCESSING') AND "deliveredAt" IS NULL AND "lastErrorCode" IS NULL) OR
    ("status" = 'FAILED' AND "deliveredAt" IS NULL AND "lastErrorCode" IS NOT NULL) OR
    ("status" = 'SKIPPED' AND "deliveredAt" IS NULL)
  )
);

CREATE UNIQUE INDEX "BusinessNotificationDelivery_notificationId_channel_key" ON "BusinessNotificationDelivery"("notificationId", "channel");
CREATE INDEX "BusinessNotificationDelivery_status_nextAttemptAt_idx" ON "BusinessNotificationDelivery"("status", "nextAttemptAt");

CREATE TABLE "BusinessNotificationPreference" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
  "organizationEmail" BOOLEAN NOT NULL DEFAULT true,
  "salesEmail" BOOLEAN NOT NULL DEFAULT true,
  "financeEmail" BOOLEAN NOT NULL DEFAULT true,
  "partnershipEmail" BOOLEAN NOT NULL DEFAULT true,
  "securityEmail" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessNotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessNotificationPreference_memberId_key" ON "BusinessNotificationPreference"("memberId");
CREATE INDEX "BusinessNotificationPreference_organizationId_idx" ON "BusinessNotificationPreference"("organizationId");

ALTER TABLE "BusinessRiskCase" ADD CONSTRAINT "BusinessRiskCase_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "BusinessFraudRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BusinessRiskCase" ADD CONSTRAINT "BusinessRiskCase_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessRiskCase" ADD CONSTRAINT "BusinessRiskCase_partnerProfileId_fkey" FOREIGN KEY ("partnerProfileId") REFERENCES "PartnerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessRiskCase" ADD CONSTRAINT "BusinessRiskCase_attributionId_fkey" FOREIGN KEY ("attributionId") REFERENCES "PartnerAttribution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessRiskCase" ADD CONSTRAINT "BusinessRiskCase_partnerLeadId_fkey" FOREIGN KEY ("partnerLeadId") REFERENCES "PartnerLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessRiskCase" ADD CONSTRAINT "BusinessRiskCase_commissionEntryId_fkey" FOREIGN KEY ("commissionEntryId") REFERENCES "CommissionEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessRiskCase" ADD CONSTRAINT "BusinessRiskCase_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessRiskCase" ADD CONSTRAINT "BusinessRiskCase_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessRiskCase" ADD CONSTRAINT "BusinessRiskCase_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BusinessNotification" ADD CONSTRAINT "BusinessNotification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessNotification" ADD CONSTRAINT "BusinessNotification_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessNotification" ADD CONSTRAINT "BusinessNotification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessNotificationDelivery" ADD CONSTRAINT "BusinessNotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "BusinessNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessNotificationPreference" ADD CONSTRAINT "BusinessNotificationPreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessNotificationPreference" ADD CONSTRAINT "BusinessNotificationPreference_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "BusinessFraudRule" ("id", "code", "type", "name", "description", "severity", "riskScore", "configuration", "isActive", "createdAt", "updatedAt") VALUES
  ('m14_rule_self_referral', 'SELF_REFERRAL', 'SELF_REFERRAL', 'Self referral', 'Customer identity belongs to the referring partner organization.', 'CRITICAL', 95, '{"automatic":true}', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m14_rule_duplicate_lead', 'DUPLICATE_LEAD', 'DUPLICATE_LEAD', 'Duplicate lead', 'Lead identity overlaps an existing partner lead.', 'MEDIUM', 55, '{"lookbackDays":90}', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m14_rule_cancelled', 'REPEATED_CANCELLED_REFERRALS', 'REPEATED_CANCELLED_REFERRALS', 'Repeated cancelled referrals', 'Partner referrals repeatedly end in cancelled orders.', 'HIGH', 75, '{"windowDays":30,"minimumCount":3}', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m14_rule_refunds', 'REPEATED_REFUND_REFERRALS', 'REPEATED_REFUND_REFERRALS', 'Repeated refund referrals', 'Partner referrals repeatedly end in refunds.', 'HIGH', 80, '{"windowDays":30,"minimumCount":3}', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m14_rule_same_org', 'SAME_ORGANIZATION', 'SAME_ORGANIZATION', 'Same organization', 'Referral order belongs to the partner organization.', 'CRITICAL', 95, '{"automatic":true}', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m14_rule_same_user', 'SAME_USER', 'SAME_USER', 'Same user', 'Referral customer is a member of the partner organization.', 'CRITICAL', 95, '{"automatic":true}', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m14_rule_same_phone', 'SAME_PHONE', 'SAME_PHONE', 'Same phone', 'Referral order phone matches the partner organization.', 'HIGH', 80, '{"normalize":true}', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m14_rule_same_email', 'SAME_EMAIL', 'SAME_EMAIL', 'Same email', 'Referral order email matches the partner organization.', 'HIGH', 80, '{"normalize":true}', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m14_rule_ip', 'SUSPICIOUS_IP', 'SUSPICIOUS_IP', 'Suspicious IP hash', 'A hashed network identity generates unusual referral volume.', 'HIGH', 75, '{"windowHours":24,"minimumCount":10}', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m14_rule_device', 'SUSPICIOUS_DEVICE', 'SUSPICIOUS_DEVICE', 'Suspicious device hash', 'A hashed device identity generates unusual referral volume.', 'HIGH', 75, '{"windowHours":24,"minimumCount":10}', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m14_rule_conversion', 'UNUSUAL_CONVERSION_RATE', 'UNUSUAL_CONVERSION_RATE', 'Unusual conversion rate', 'Partner conversion rate exceeds a safe review threshold.', 'MEDIUM', 60, '{"windowDays":30,"minimumAttributions":5,"ratePercent":80}', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m14_rule_commission', 'COMMISSION_SPIKE', 'COMMISSION_SPIKE', 'Commission spike', 'Commission amount or velocity exceeds normal partner behavior.', 'HIGH', 85, '{"singleAmount":100000,"dailyMultiplier":3}', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name", "description" = EXCLUDED."description", "severity" = EXCLUDED."severity",
  "riskScore" = EXCLUDED."riskScore", "configuration" = EXCLUDED."configuration", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Permission" ("id", "key", "description", "createdAt", "updatedAt") VALUES
  ('m14_business_audit_view', 'business.audit.view', 'Read immutable business audit and fraud-review evidence.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m14_business_report_view', 'business.report.view', 'Read business-network operational and financial reports.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "Role" AS role CROSS JOIN "Permission" AS permission
WHERE role."name" IN ('admin', 'superadmin')
  AND permission."key" IN ('business.audit.view', 'business.report.view')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
