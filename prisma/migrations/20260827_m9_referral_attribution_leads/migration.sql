-- M9 Referral Attribution + Lead Registration.
CREATE TYPE "PartnerAssetType" AS ENUM ('REFERRAL_LINK', 'REFERRAL_CODE', 'PROMO_CODE');
CREATE TYPE "PartnerAssetStatus" AS ENUM ('ACTIVE', 'DISABLED', 'EXPIRED');
CREATE TYPE "PartnerAttributionSource" AS ENUM (
  'REFERRAL_LINK', 'REFERRAL_CODE', 'PROMO_CODE', 'REGISTERED_LEAD', 'MANUAL'
);
CREATE TYPE "PartnerAttributionStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'EXPIRED', 'REJECTED');
CREATE TYPE "PartnerLeadStatus" AS ENUM (
  'SUBMITTED', 'VALIDATING', 'ACCEPTED', 'DUPLICATE', 'ASSIGNED',
  'IN_PROGRESS', 'WON', 'LOST', 'EXPIRED', 'REJECTED'
);

CREATE SEQUENCE "PartnerLeadNumber_seq" START 1;

CREATE TABLE "PartnerAsset" (
  "id" TEXT NOT NULL,
  "partnerProfileId" TEXT NOT NULL,
  "type" "PartnerAssetType" NOT NULL,
  "status" "PartnerAssetStatus" NOT NULL DEFAULT 'ACTIVE',
  "code" VARCHAR(64) NOT NULL,
  "destinationPath" TEXT,
  "campaignName" TEXT,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerAsset_code_check" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9_-]{3,63}$'),
  CONSTRAINT "PartnerAsset_destination_check" CHECK (
    "destinationPath" IS NULL OR (
      length("destinationPath") BETWEEN 1 AND 2048
      AND left("destinationPath", 1) = '/'
      AND left("destinationPath", 2) <> '//'
      AND position(E'\\' in "destinationPath") = 0
      AND "destinationPath" !~ '[[:cntrl:]]'
    )
  ),
  CONSTRAINT "PartnerAsset_campaign_check" CHECK (
    "campaignName" IS NULL OR length(btrim("campaignName")) BETWEEN 1 AND 160
  ),
  CONSTRAINT "PartnerAsset_dates_check" CHECK (
    "endsAt" IS NULL OR "startsAt" IS NULL OR "endsAt" > "startsAt"
  )
);

CREATE TABLE "PartnerAttribution" (
  "id" TEXT NOT NULL,
  "partnerProfileId" TEXT NOT NULL,
  "agreementVersionId" TEXT,
  "assetId" TEXT,
  "source" "PartnerAttributionSource" NOT NULL,
  "status" "PartnerAttributionStatus" NOT NULL DEFAULT 'ACTIVE',
  "visitorId" TEXT,
  "sessionId" TEXT,
  "customerUserId" TEXT,
  "orderId" INTEGER,
  "ipHash" TEXT,
  "deviceHash" TEXT,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "convertedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  CONSTRAINT "PartnerAttribution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerAttribution_identity_check" CHECK (
    "visitorId" IS NOT NULL OR "sessionId" IS NOT NULL OR "customerUserId" IS NOT NULL
  ),
  CONSTRAINT "PartnerAttribution_dates_check" CHECK ("expiresAt" > "capturedAt"),
  CONSTRAINT "PartnerAttribution_lifecycle_check" CHECK (
    ("status" = 'ACTIVE' AND "orderId" IS NULL AND "convertedAt" IS NULL
      AND "rejectedAt" IS NULL AND "rejectionReason" IS NULL)
    OR ("status" = 'CONVERTED' AND "orderId" IS NOT NULL AND "convertedAt" IS NOT NULL
      AND "rejectedAt" IS NULL AND "rejectionReason" IS NULL)
    OR ("status" = 'EXPIRED' AND "orderId" IS NULL AND "convertedAt" IS NULL
      AND "rejectedAt" IS NULL AND "rejectionReason" IS NULL)
    OR ("status" = 'REJECTED' AND "orderId" IS NULL AND "convertedAt" IS NULL
      AND "rejectedAt" IS NOT NULL AND length(btrim("rejectionReason")) BETWEEN 3 AND 1000)
  )
);

CREATE TABLE "PartnerLead" (
  "id" TEXT NOT NULL,
  "partnerProfileId" TEXT NOT NULL,
  "leadNumber" TEXT NOT NULL,
  "status" "PartnerLeadStatus" NOT NULL DEFAULT 'SUBMITTED',
  "companyName" TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "requirement" TEXT,
  "estimatedValue" DECIMAL(14,2),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'BDT',
  "assignedToUserId" TEXT,
  "ownershipExpiresAt" TIMESTAMP(3),
  "wonOrderId" INTEGER,
  "duplicateOfId" TEXT,
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerLead_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerLead_number_check" CHECK ("leadNumber" ~ '^LEAD-[0-9]{8}$'),
  CONSTRAINT "PartnerLead_company_check" CHECK (length(btrim("companyName")) BETWEEN 2 AND 200),
  CONSTRAINT "PartnerLead_contact_check" CHECK (length(btrim("contactName")) BETWEEN 2 AND 160),
  CONSTRAINT "PartnerLead_contact_method_check" CHECK ("contactEmail" IS NOT NULL OR "contactPhone" IS NOT NULL),
  CONSTRAINT "PartnerLead_email_check" CHECK (
    "contactEmail" IS NULL OR (
      length("contactEmail") <= 254 AND "contactEmail" = lower("contactEmail")
      AND "contactEmail" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ),
  CONSTRAINT "PartnerLead_phone_check" CHECK (
    "contactPhone" IS NULL OR "contactPhone" ~ '^\+[1-9][0-9]{7,14}$'
  ),
  CONSTRAINT "PartnerLead_requirement_check" CHECK (
    "requirement" IS NULL OR length(btrim("requirement")) BETWEEN 3 AND 5000
  ),
  CONSTRAINT "PartnerLead_value_check" CHECK ("estimatedValue" IS NULL OR "estimatedValue" >= 0),
  CONSTRAINT "PartnerLead_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "PartnerLead_ownership_check" CHECK (
    "ownershipExpiresAt" IS NULL OR "ownershipExpiresAt" > "createdAt"
  ),
  CONSTRAINT "PartnerLead_lifecycle_check" CHECK (
    ("status" IN ('SUBMITTED', 'VALIDATING', 'ACCEPTED')
      AND "assignedToUserId" IS NULL AND "wonOrderId" IS NULL
      AND "duplicateOfId" IS NULL AND "rejectionReason" IS NULL)
    OR ("status" IN ('ASSIGNED', 'IN_PROGRESS')
      AND "assignedToUserId" IS NOT NULL AND "wonOrderId" IS NULL
      AND "duplicateOfId" IS NULL AND "rejectionReason" IS NULL)
    OR ("status" = 'WON' AND "assignedToUserId" IS NOT NULL AND "wonOrderId" IS NOT NULL
      AND "duplicateOfId" IS NULL AND "rejectionReason" IS NULL)
    OR ("status" = 'LOST' AND "assignedToUserId" IS NOT NULL AND "wonOrderId" IS NULL
      AND "duplicateOfId" IS NULL
      AND ("rejectionReason" IS NULL OR length(btrim("rejectionReason")) BETWEEN 3 AND 1000))
    OR ("status" = 'DUPLICATE' AND "duplicateOfId" IS NOT NULL
      AND "duplicateOfId" <> "id" AND "assignedToUserId" IS NULL
      AND "wonOrderId" IS NULL AND "rejectionReason" IS NULL)
    OR ("status" = 'REJECTED' AND "wonOrderId" IS NULL AND "duplicateOfId" IS NULL
      AND length(btrim("rejectionReason")) BETWEEN 3 AND 1000)
    OR ("status" = 'EXPIRED' AND "wonOrderId" IS NULL AND "duplicateOfId" IS NULL)
  )
);

CREATE UNIQUE INDEX "PartnerAsset_code_key" ON "PartnerAsset"("code");
CREATE INDEX "PartnerAsset_partnerProfileId_status_idx" ON "PartnerAsset"("partnerProfileId", "status");
CREATE UNIQUE INDEX "PartnerAttribution_orderId_key" ON "PartnerAttribution"("orderId");
CREATE INDEX "PartnerAttribution_partnerProfileId_status_idx" ON "PartnerAttribution"("partnerProfileId", "status");
CREATE INDEX "PartnerAttribution_visitorId_capturedAt_idx" ON "PartnerAttribution"("visitorId", "capturedAt");
CREATE INDEX "PartnerAttribution_customerUserId_idx" ON "PartnerAttribution"("customerUserId");
CREATE INDEX "PartnerAttribution_expiresAt_idx" ON "PartnerAttribution"("expiresAt");
CREATE UNIQUE INDEX "PartnerAttribution_one_active_visitor_idx"
  ON "PartnerAttribution"("visitorId") WHERE "status" = 'ACTIVE' AND "visitorId" IS NOT NULL;
CREATE UNIQUE INDEX "PartnerAttribution_one_active_session_idx"
  ON "PartnerAttribution"("sessionId") WHERE "status" = 'ACTIVE' AND "sessionId" IS NOT NULL;
CREATE UNIQUE INDEX "PartnerLead_leadNumber_key" ON "PartnerLead"("leadNumber");
CREATE UNIQUE INDEX "PartnerLead_wonOrderId_key" ON "PartnerLead"("wonOrderId");
CREATE INDEX "PartnerLead_partnerProfileId_status_idx" ON "PartnerLead"("partnerProfileId", "status");
CREATE INDEX "PartnerLead_contactEmail_idx" ON "PartnerLead"("contactEmail");
CREATE INDEX "PartnerLead_contactPhone_idx" ON "PartnerLead"("contactPhone");
CREATE INDEX "PartnerLead_companyName_idx" ON "PartnerLead"("companyName");

ALTER TABLE "PartnerAsset" ADD CONSTRAINT "PartnerAsset_partnerProfileId_fkey"
  FOREIGN KEY ("partnerProfileId") REFERENCES "PartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerAttribution" ADD CONSTRAINT "PartnerAttribution_partnerProfileId_fkey"
  FOREIGN KEY ("partnerProfileId") REFERENCES "PartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerAttribution" ADD CONSTRAINT "PartnerAttribution_agreementVersionId_fkey"
  FOREIGN KEY ("agreementVersionId") REFERENCES "PartnerAgreementVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerAttribution" ADD CONSTRAINT "PartnerAttribution_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "PartnerAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerAttribution" ADD CONSTRAINT "PartnerAttribution_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerLead" ADD CONSTRAINT "PartnerLead_partnerProfileId_fkey"
  FOREIGN KEY ("partnerProfileId") REFERENCES "PartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerLead" ADD CONSTRAINT "PartnerLead_assignedToUserId_fkey"
  FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerLead" ADD CONSTRAINT "PartnerLead_wonOrderId_fkey"
  FOREIGN KEY ("wonOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerLead" ADD CONSTRAINT "PartnerLead_duplicateOfId_fkey"
  FOREIGN KEY ("duplicateOfId") REFERENCES "PartnerLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION "protect_partner_asset"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM "PartnerAttribution" WHERE "assetId" = OLD."id") THEN
      RAISE EXCEPTION 'Attributed partner assets cannot be deleted' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW."partnerProfileId" IS DISTINCT FROM OLD."partnerProfileId"
    OR NEW."type" IS DISTINCT FROM OLD."type"
    OR NEW."code" IS DISTINCT FROM OLD."code"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Partner asset identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF NOT (
    (OLD."status" = 'ACTIVE' AND NEW."status" IN ('DISABLED', 'EXPIRED'))
    OR (OLD."status" = 'DISABLED' AND NEW."status" = 'ACTIVE')
    OR OLD."status" = NEW."status"
  ) THEN
    RAISE EXCEPTION 'Invalid partner asset status transition' USING ERRCODE = '23514';
  END IF;
  IF OLD."status" = 'EXPIRED' AND (
    NEW."destinationPath" IS DISTINCT FROM OLD."destinationPath"
    OR NEW."campaignName" IS DISTINCT FROM OLD."campaignName"
    OR NEW."startsAt" IS DISTINCT FROM OLD."startsAt"
    OR NEW."endsAt" IS DISTINCT FROM OLD."endsAt"
  ) THEN
    RAISE EXCEPTION 'Expired partner assets are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PartnerAsset_lifecycle_guard"
BEFORE UPDATE OR DELETE ON "PartnerAsset"
FOR EACH ROW EXECUTE FUNCTION "protect_partner_asset"();

CREATE FUNCTION "validate_partner_attribution_scope"() RETURNS trigger AS $$
DECLARE
  asset_row "PartnerAsset"%ROWTYPE;
  agreement_profile_id TEXT;
  agreement_status "PartnerAgreementStatus";
  version_status "PartnerAgreementVersionStatus";
  agreement_starts_at TIMESTAMP(3);
  agreement_ends_at TIMESTAMP(3);
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Partner attribution history cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."partnerProfileId" IS DISTINCT FROM OLD."partnerProfileId"
      OR NEW."agreementVersionId" IS DISTINCT FROM OLD."agreementVersionId"
      OR NEW."assetId" IS DISTINCT FROM OLD."assetId"
      OR NEW."source" IS DISTINCT FROM OLD."source"
      OR NEW."visitorId" IS DISTINCT FROM OLD."visitorId"
      OR NEW."sessionId" IS DISTINCT FROM OLD."sessionId"
      OR NEW."ipHash" IS DISTINCT FROM OLD."ipHash"
      OR NEW."deviceHash" IS DISTINCT FROM OLD."deviceHash"
      OR NEW."capturedAt" IS DISTINCT FROM OLD."capturedAt"
      OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt" THEN
      RAISE EXCEPTION 'Partner attribution capture data is immutable' USING ERRCODE = '23514';
    END IF;
    IF NOT (
      (OLD."status" = 'ACTIVE' AND NEW."status" IN ('CONVERTED', 'EXPIRED', 'REJECTED'))
      OR OLD."status" = NEW."status"
    ) THEN
      RAISE EXCEPTION 'Invalid partner attribution status transition' USING ERRCODE = '23514';
    END IF;
    IF OLD."status" <> 'ACTIVE' AND (
      NEW."customerUserId" IS DISTINCT FROM OLD."customerUserId"
      OR NEW."orderId" IS DISTINCT FROM OLD."orderId"
      OR NEW."convertedAt" IS DISTINCT FROM OLD."convertedAt"
      OR NEW."rejectedAt" IS DISTINCT FROM OLD."rejectedAt"
      OR NEW."rejectionReason" IS DISTINCT FROM OLD."rejectionReason"
    ) THEN
      RAISE EXCEPTION 'Terminal partner attribution evidence is immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW."customerUserId" IS DISTINCT FROM OLD."customerUserId" AND NEW."status" <> 'CONVERTED' THEN
      RAISE EXCEPTION 'Attribution customer identity may only be bound during conversion' USING ERRCODE = '23514';
    END IF;
    IF NEW."orderId" IS DISTINCT FROM OLD."orderId" AND NEW."status" <> 'CONVERTED' THEN
      RAISE EXCEPTION 'Attribution order may only be bound during conversion' USING ERRCODE = '23514';
    END IF;
    IF NEW."convertedAt" IS DISTINCT FROM OLD."convertedAt" AND NEW."status" <> 'CONVERTED' THEN
      RAISE EXCEPTION 'Attribution conversion evidence is invalid' USING ERRCODE = '23514';
    END IF;
    IF (NEW."rejectedAt" IS DISTINCT FROM OLD."rejectedAt"
      OR NEW."rejectionReason" IS DISTINCT FROM OLD."rejectionReason") AND NEW."status" <> 'REJECTED' THEN
      RAISE EXCEPTION 'Attribution rejection evidence is invalid' USING ERRCODE = '23514';
    END IF;
    IF NEW."status" = 'CONVERTED' AND NOT EXISTS (
      SELECT 1
      FROM "PartnerProfile" AS profile
      JOIN "Organization" AS organization ON organization."id" = profile."organizationId"
      JOIN "PartnerAgreementVersion" AS version ON version."id" = NEW."agreementVersionId"
      JOIN "PartnerAgreement" AS agreement ON agreement."id" = version."agreementId"
      WHERE profile."id" = NEW."partnerProfileId"
        AND profile."status" = 'ACTIVE'
        AND organization."status" = 'ACTIVE'
        AND version."status" = 'ACTIVE'
        AND agreement."status" = 'ACTIVE'
        AND agreement."partnerProfileId" = profile."id"
        AND agreement."startsAt" <= CURRENT_TIMESTAMP
        AND (agreement."endsAt" IS NULL OR agreement."endsAt" > CURRENT_TIMESTAMP)
    ) THEN
      RAISE EXCEPTION 'Inactive partner agreements cannot receive conversions' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "PartnerProfile" AS profile
    JOIN "Organization" AS organization ON organization."id" = profile."organizationId"
    WHERE profile."id" = NEW."partnerProfileId"
      AND profile."status" = 'ACTIVE'
      AND organization."status" = 'ACTIVE'
      AND EXISTS (
        SELECT 1 FROM "OrganizationCapability" AS capability
        WHERE capability."organizationId" = organization."id"
          AND capability."status" = 'ACTIVE'
          AND capability."type" IN ('AFFILIATE', 'RESELLER', 'DEALER', 'MARKETING_PARTNER', 'SERVICE_PARTNER')
      )
  ) THEN
    RAISE EXCEPTION 'Active partner capability is required for attribution capture' USING ERRCODE = '23514';
  END IF;

  IF NEW."assetId" IS NOT NULL THEN
    SELECT * INTO asset_row FROM "PartnerAsset" WHERE "id" = NEW."assetId";
    IF NOT FOUND OR asset_row."partnerProfileId" <> NEW."partnerProfileId" THEN
      RAISE EXCEPTION 'Partner attribution asset scope mismatch' USING ERRCODE = '23514';
    END IF;
    IF asset_row."status" <> 'ACTIVE'
      OR (asset_row."startsAt" IS NOT NULL AND asset_row."startsAt" > NEW."capturedAt")
      OR (asset_row."endsAt" IS NOT NULL AND asset_row."endsAt" <= NEW."capturedAt") THEN
      RAISE EXCEPTION 'Partner attribution asset is not active' USING ERRCODE = '23514';
    END IF;
    IF NEW."source"::text <> asset_row."type"::text THEN
      RAISE EXCEPTION 'Partner attribution source does not match its asset' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW."agreementVersionId" IS NOT NULL THEN
    SELECT agreement."partnerProfileId", agreement."status", version."status", agreement."startsAt", agreement."endsAt"
      INTO agreement_profile_id, agreement_status, version_status, agreement_starts_at, agreement_ends_at
    FROM "PartnerAgreementVersion" AS version
    JOIN "PartnerAgreement" AS agreement ON agreement."id" = version."agreementId"
    WHERE version."id" = NEW."agreementVersionId";
    IF agreement_profile_id IS NULL OR agreement_profile_id <> NEW."partnerProfileId" THEN
      RAISE EXCEPTION 'Partner attribution agreement scope mismatch' USING ERRCODE = '23514';
    END IF;
    IF agreement_status <> 'ACTIVE' OR version_status <> 'ACTIVE'
      OR agreement_starts_at > NEW."capturedAt"
      OR (agreement_ends_at IS NOT NULL AND agreement_ends_at <= NEW."capturedAt") THEN
      RAISE EXCEPTION 'Partner attribution agreement is not active' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW."source" IN ('REFERRAL_LINK', 'REFERRAL_CODE', 'PROMO_CODE')
    AND (NEW."assetId" IS NULL OR NEW."agreementVersionId" IS NULL) THEN
    RAISE EXCEPTION 'Referral attribution requires an asset and agreement version' USING ERRCODE = '23514';
  END IF;
  IF NEW."source" IN ('REGISTERED_LEAD', 'MANUAL') AND NEW."assetId" IS NOT NULL THEN
    RAISE EXCEPTION 'Lead and manual attribution cannot reference a referral asset' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PartnerAttribution_scope_lifecycle_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "PartnerAttribution"
FOR EACH ROW EXECUTE FUNCTION "validate_partner_attribution_scope"();

CREATE FUNCTION "protect_partner_lead"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'SUBMITTED' THEN
      RAISE EXCEPTION 'Reviewed partner leads cannot be deleted' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW."partnerProfileId" IS DISTINCT FROM OLD."partnerProfileId"
    OR NEW."leadNumber" IS DISTINCT FROM OLD."leadNumber"
    OR NEW."companyName" IS DISTINCT FROM OLD."companyName"
    OR NEW."contactName" IS DISTINCT FROM OLD."contactName"
    OR NEW."contactEmail" IS DISTINCT FROM OLD."contactEmail"
    OR NEW."contactPhone" IS DISTINCT FROM OLD."contactPhone"
    OR NEW."requirement" IS DISTINCT FROM OLD."requirement"
    OR NEW."estimatedValue" IS DISTINCT FROM OLD."estimatedValue"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Submitted partner lead source data is immutable' USING ERRCODE = '23514';
  END IF;
  IF NOT (
    (OLD."status" = 'SUBMITTED' AND NEW."status" = 'VALIDATING')
    OR (OLD."status" = 'VALIDATING' AND NEW."status" IN ('ACCEPTED', 'DUPLICATE', 'REJECTED'))
    OR (OLD."status" = 'ACCEPTED' AND NEW."status" IN ('ASSIGNED', 'EXPIRED', 'REJECTED'))
    OR (OLD."status" = 'ASSIGNED' AND NEW."status" IN ('IN_PROGRESS', 'EXPIRED', 'REJECTED'))
    OR (OLD."status" = 'IN_PROGRESS' AND NEW."status" IN ('WON', 'LOST', 'EXPIRED', 'REJECTED'))
    OR OLD."status" = NEW."status"
  ) THEN
    RAISE EXCEPTION 'Invalid partner lead status transition' USING ERRCODE = '23514';
  END IF;
  IF OLD."status" IN ('DUPLICATE', 'WON', 'LOST', 'EXPIRED', 'REJECTED') AND (
    NEW."assignedToUserId" IS DISTINCT FROM OLD."assignedToUserId"
    OR NEW."ownershipExpiresAt" IS DISTINCT FROM OLD."ownershipExpiresAt"
    OR NEW."wonOrderId" IS DISTINCT FROM OLD."wonOrderId"
    OR NEW."duplicateOfId" IS DISTINCT FROM OLD."duplicateOfId"
    OR NEW."rejectionReason" IS DISTINCT FROM OLD."rejectionReason"
  ) THEN
    RAISE EXCEPTION 'Terminal partner lead evidence is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PartnerLead_lifecycle_guard"
BEFORE UPDATE OR DELETE ON "PartnerLead"
FOR EACH ROW EXECUTE FUNCTION "protect_partner_lead"();

INSERT INTO "Permission" ("id", "key", "description", "createdAt", "updatedAt") VALUES
  ('m9_partner_lead_view', 'partner.lead.view', 'Read registered partner leads and lifecycle evidence.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m9_partner_lead_manage', 'partner.lead.manage', 'Validate and resolve registered partner leads.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('m9_partner_lead_assign', 'partner.lead.assign', 'Assign accepted partner leads and record outcomes.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt")
SELECT role."id", permission."id", CURRENT_TIMESTAMP
FROM "Role" AS role CROSS JOIN "Permission" AS permission
WHERE role."name" IN ('admin', 'superadmin')
  AND permission."key" IN ('partner.lead.view', 'partner.lead.manage', 'partner.lead.assign')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
