-- M8 forward-only hardening for milestone boundaries and review evidence.
ALTER TABLE "PartnerAgreementVersion"
  ADD CONSTRAINT "PartnerAgreementVersion_commission_plan_m8_check"
    CHECK ("commissionPlanId" IS NULL),
  ADD CONSTRAINT "PartnerAgreementVersion_territory_rules_check"
    CHECK ("territoryRules" IS NULL OR jsonb_typeof("territoryRules") = 'object'),
  ADD CONSTRAINT "PartnerAgreementVersion_category_rules_check"
    CHECK ("categoryRules" IS NULL OR jsonb_typeof("categoryRules") = 'object'),
  ADD CONSTRAINT "PartnerAgreementVersion_commercial_terms_check"
    CHECK ("commercialTerms" IS NULL OR jsonb_typeof("commercialTerms") = 'object');

CREATE OR REPLACE FUNCTION "protect_partner_profile_lifecycle"() RETURNS trigger AS $$
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
  IF OLD."status" IN ('ACTIVE', 'SUSPENDED', 'REVOKED')
    AND NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt" THEN
    RAISE EXCEPTION 'Partner approval evidence is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD."status" = 'SUSPENDED'
    AND NEW."status" <> 'ACTIVE'
    AND NEW."suspendedAt" IS DISTINCT FROM OLD."suspendedAt" THEN
    RAISE EXCEPTION 'Partner suspension evidence is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD."status" IN ('REJECTED', 'REVOKED') AND (
    NEW."suspendedAt" IS DISTINCT FROM OLD."suspendedAt" OR
    NEW."rejectionReason" IS DISTINCT FROM OLD."rejectionReason"
  ) THEN
    RAISE EXCEPTION 'Terminal partner review evidence is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "protect_partner_agreement_version"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'Submitted partner agreement versions cannot be deleted' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF (OLD."status" <> 'DRAFT' OR NEW."status" <> 'DRAFT') AND (
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
  IF OLD."status" IN ('ACTIVE', 'SUPERSEDED') AND (
    NEW."approvedById" IS DISTINCT FROM OLD."approvedById" OR
    NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
  ) THEN
    RAISE EXCEPTION 'Partner agreement approval evidence is immutable' USING ERRCODE = '23514';
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
