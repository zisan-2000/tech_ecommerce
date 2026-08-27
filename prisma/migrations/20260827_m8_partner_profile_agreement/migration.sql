-- M8 Partner Profile + versioned Partner Agreement foundation.
CREATE TYPE "PartnerStatus" AS ENUM (
  'APPLIED', 'UNDER_REVIEW', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'REVOKED'
);
CREATE TYPE "PartnerAgreementStatus" AS ENUM (
  'DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'TERMINATED'
);
CREATE TYPE "PartnerAgreementVersionStatus" AS ENUM (
  'DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'SUPERSEDED', 'REJECTED'
);
CREATE TYPE "PartnerAttributionModel" AS ENUM ('FIRST_CLICK', 'LAST_CLICK', 'LEAD_OWNER');

CREATE SEQUENCE "PartnerProfileCode_seq" START 1;
CREATE SEQUENCE "PartnerAgreementNumber_seq" START 1;

CREATE TABLE "PartnerProfile" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "partnerCode" VARCHAR(32) NOT NULL,
  "status" "PartnerStatus" NOT NULL DEFAULT 'APPLIED',
  "accountManagerId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "suspendedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerProfile_code_check" CHECK ("partnerCode" ~ '^PAR-[0-9]{8}$'),
  CONSTRAINT "PartnerProfile_lifecycle_check" CHECK (
    ("status" IN ('APPLIED', 'UNDER_REVIEW')
      AND "approvedAt" IS NULL AND "suspendedAt" IS NULL AND "rejectionReason" IS NULL)
    OR ("status" = 'ACTIVE'
      AND "approvedAt" IS NOT NULL AND "suspendedAt" IS NULL AND "rejectionReason" IS NULL)
    OR ("status" = 'SUSPENDED'
      AND "approvedAt" IS NOT NULL AND "suspendedAt" IS NOT NULL AND "rejectionReason" IS NULL)
    OR ("status" = 'REJECTED'
      AND "approvedAt" IS NULL AND "suspendedAt" IS NULL
      AND length(btrim("rejectionReason")) BETWEEN 3 AND 1000)
    OR ("status" = 'REVOKED'
      AND "approvedAt" IS NOT NULL AND "rejectionReason" IS NULL)
  )
);

CREATE TABLE "PartnerAgreement" (
  "id" TEXT NOT NULL,
  "agreementNumber" TEXT NOT NULL,
  "partnerProfileId" TEXT NOT NULL,
  "status" "PartnerAgreementStatus" NOT NULL DEFAULT 'DRAFT',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerAgreement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerAgreement_number_check" CHECK ("agreementNumber" ~ '^AGR-[0-9]{8}$'),
  CONSTRAINT "PartnerAgreement_dates_check" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt")
);

CREATE TABLE "PartnerAgreementVersion" (
  "id" TEXT NOT NULL,
  "agreementId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "status" "PartnerAgreementVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "commissionPlanId" TEXT,
  "attributionModel" "PartnerAttributionModel" NOT NULL DEFAULT 'LAST_CLICK',
  "attributionWindowDays" INTEGER NOT NULL DEFAULT 30,
  "allowSelfReferral" BOOLEAN NOT NULL DEFAULT false,
  "minimumSettlement" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'BDT',
  "territoryRules" JSONB,
  "categoryRules" JSONB,
  "commercialTerms" JSONB,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerAgreementVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerAgreementVersion_number_check" CHECK ("versionNumber" > 0),
  CONSTRAINT "PartnerAgreementVersion_window_check" CHECK ("attributionWindowDays" BETWEEN 1 AND 3650),
  CONSTRAINT "PartnerAgreementVersion_settlement_check" CHECK ("minimumSettlement" >= 0),
  CONSTRAINT "PartnerAgreementVersion_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "PartnerAgreementVersion_lifecycle_check" CHECK (
    ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'REJECTED')
      AND "approvedById" IS NULL AND "approvedAt" IS NULL)
    OR ("status" IN ('ACTIVE', 'SUPERSEDED')
      AND "approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "PartnerProfile_organizationId_key" ON "PartnerProfile"("organizationId");
CREATE UNIQUE INDEX "PartnerProfile_partnerCode_key" ON "PartnerProfile"("partnerCode");
CREATE INDEX "PartnerProfile_status_idx" ON "PartnerProfile"("status");
CREATE INDEX "PartnerProfile_accountManagerId_idx" ON "PartnerProfile"("accountManagerId");
CREATE UNIQUE INDEX "PartnerAgreement_agreementNumber_key" ON "PartnerAgreement"("agreementNumber");
CREATE INDEX "PartnerAgreement_partnerProfileId_status_idx" ON "PartnerAgreement"("partnerProfileId", "status");
CREATE INDEX "PartnerAgreement_startsAt_endsAt_idx" ON "PartnerAgreement"("startsAt", "endsAt");
CREATE UNIQUE INDEX "PartnerAgreementVersion_agreementId_versionNumber_key"
  ON "PartnerAgreementVersion"("agreementId", "versionNumber");
CREATE INDEX "PartnerAgreementVersion_agreementId_status_idx"
  ON "PartnerAgreementVersion"("agreementId", "status");
CREATE UNIQUE INDEX "PartnerAgreementVersion_one_active_idx"
  ON "PartnerAgreementVersion"("agreementId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "PartnerAgreementVersion_one_open_idx"
  ON "PartnerAgreementVersion"("agreementId") WHERE "status" IN ('DRAFT', 'PENDING_APPROVAL');
CREATE UNIQUE INDEX "PartnerAgreement_one_live_profile_idx"
  ON "PartnerAgreement"("partnerProfileId")
  WHERE "status" IN ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED');

ALTER TABLE "PartnerProfile" ADD CONSTRAINT "PartnerProfile_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerAgreement" ADD CONSTRAINT "PartnerAgreement_partnerProfileId_fkey"
  FOREIGN KEY ("partnerProfileId") REFERENCES "PartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerAgreementVersion" ADD CONSTRAINT "PartnerAgreementVersion_agreementId_fkey"
  FOREIGN KEY ("agreementId") REFERENCES "PartnerAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION "protect_partner_profile_lifecycle"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'APPLIED' THEN
      RAISE EXCEPTION 'Reviewed partner profiles cannot be deleted' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
    OR NEW."partnerCode" IS DISTINCT FROM OLD."partnerCode" THEN
    RAISE EXCEPTION 'Partner identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF NOT (
    (OLD."status" = 'APPLIED' AND NEW."status" = 'UNDER_REVIEW')
    OR (OLD."status" = 'UNDER_REVIEW' AND NEW."status" IN ('ACTIVE', 'REJECTED'))
    OR (OLD."status" = 'ACTIVE' AND NEW."status" IN ('SUSPENDED', 'REVOKED'))
    OR (OLD."status" = 'SUSPENDED' AND NEW."status" IN ('ACTIVE', 'REVOKED'))
    OR OLD."status" = NEW."status"
  ) THEN
    RAISE EXCEPTION 'Invalid partner profile status transition' USING ERRCODE = '23514';
  END IF;
  IF OLD."status" IN ('REJECTED', 'REVOKED') AND (
    NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt" OR
    NEW."suspendedAt" IS DISTINCT FROM OLD."suspendedAt" OR
    NEW."rejectionReason" IS DISTINCT FROM OLD."rejectionReason"
  ) THEN
    RAISE EXCEPTION 'Terminal partner review evidence is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PartnerProfile_lifecycle_guard"
BEFORE UPDATE OR DELETE ON "PartnerProfile"
FOR EACH ROW EXECUTE FUNCTION "protect_partner_profile_lifecycle"();

CREATE FUNCTION "protect_partner_agreement_lifecycle"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'Submitted partner agreements cannot be deleted' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW."agreementNumber" IS DISTINCT FROM OLD."agreementNumber"
    OR NEW."partnerProfileId" IS DISTINCT FROM OLD."partnerProfileId"
    OR NEW."startsAt" IS DISTINCT FROM OLD."startsAt"
    OR NEW."endsAt" IS DISTINCT FROM OLD."endsAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Partner agreement source data is immutable' USING ERRCODE = '23514';
  END IF;
  IF NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" = 'PENDING_APPROVAL')
    OR (OLD."status" = 'PENDING_APPROVAL' AND NEW."status" = 'ACTIVE')
    OR (OLD."status" = 'ACTIVE' AND NEW."status" IN ('SUSPENDED', 'EXPIRED', 'TERMINATED'))
    OR (OLD."status" = 'SUSPENDED' AND NEW."status" = 'TERMINATED')
    OR OLD."status" = NEW."status"
  ) THEN
    RAISE EXCEPTION 'Invalid partner agreement status transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PartnerAgreement_lifecycle_guard"
BEFORE UPDATE OR DELETE ON "PartnerAgreement"
FOR EACH ROW EXECUTE FUNCTION "protect_partner_agreement_lifecycle"();

CREATE FUNCTION "protect_partner_agreement_version"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'Submitted partner agreement versions cannot be deleted' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" <> 'DRAFT' AND (
    NEW."agreementId" IS DISTINCT FROM OLD."agreementId" OR
    NEW."versionNumber" IS DISTINCT FROM OLD."versionNumber" OR
    NEW."commissionPlanId" IS DISTINCT FROM OLD."commissionPlanId" OR
    NEW."attributionModel" IS DISTINCT FROM OLD."attributionModel" OR
    NEW."attributionWindowDays" IS DISTINCT FROM OLD."attributionWindowDays" OR
    NEW."allowSelfReferral" IS DISTINCT FROM OLD."allowSelfReferral" OR
    NEW."minimumSettlement" IS DISTINCT FROM OLD."minimumSettlement" OR
    NEW."currency" IS DISTINCT FROM OLD."currency" OR
    NEW."territoryRules" IS DISTINCT FROM OLD."territoryRules" OR
    NEW."categoryRules" IS DISTINCT FROM OLD."categoryRules" OR
    NEW."commercialTerms" IS DISTINCT FROM OLD."commercialTerms" OR
    NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'Submitted partner agreement commercial terms are immutable' USING ERRCODE = '23514';
  END IF;
  IF NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" = 'PENDING_APPROVAL')
    OR (OLD."status" = 'PENDING_APPROVAL' AND NEW."status" IN ('ACTIVE', 'REJECTED'))
    OR (OLD."status" = 'ACTIVE' AND NEW."status" = 'SUPERSEDED')
    OR OLD."status" = NEW."status"
  ) THEN
    RAISE EXCEPTION 'Invalid partner agreement version status transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PartnerAgreementVersion_immutable_guard"
BEFORE UPDATE OR DELETE ON "PartnerAgreementVersion"
FOR EACH ROW EXECUTE FUNCTION "protect_partner_agreement_version"();

INSERT INTO "Permission" ("id", "key", "description", "createdAt", "updatedAt") VALUES
  ('m8_partner_profile_view', 'partner.profile.view', 'Read partner profiles and organization eligibility.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m8_partner_profile_manage', 'partner.profile.manage', 'Manage partner profile ownership and review workflow.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m8_partner_profile_approve', 'partner.profile.approve', 'Approve or reject reviewed partner applications.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m8_partner_profile_suspend', 'partner.profile.suspend', 'Suspend or reactivate active partner profiles.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m8_partner_agreement_view', 'partner.agreement.view', 'Read partner agreements and immutable version history.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m8_partner_agreement_manage', 'partner.agreement.manage', 'Create, version, submit, suspend, and terminate partner agreements.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m8_partner_agreement_approve', 'partner.agreement.approve', 'Approve pending partner agreement versions.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "Role" AS role CROSS JOIN "Permission" AS permission
WHERE role."name" IN ('admin', 'superadmin')
  AND permission."key" IN (
    'partner.profile.view', 'partner.profile.manage', 'partner.profile.approve',
    'partner.profile.suspend', 'partner.agreement.view', 'partner.agreement.manage',
    'partner.agreement.approve'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
