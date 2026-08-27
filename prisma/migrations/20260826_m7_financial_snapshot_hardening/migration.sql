-- M7 forward-only hardening: accepted quotation totals and terminal review evidence are immutable.
CREATE OR REPLACE FUNCTION "protect_corporate_order_context"() RETURNS trigger AS $$
BEGIN
  IF OLD."commercialContext" IS NOT NULL AND (
    NEW."organizationId" IS DISTINCT FROM OLD."organizationId" OR
    NEW."salesChannel" IS DISTINCT FROM OLD."salesChannel" OR
    NEW."salesQuotationVersionId" IS DISTINCT FROM OLD."salesQuotationVersionId" OR
    NEW."commercialContext" IS DISTINCT FROM OLD."commercialContext" OR
    NEW."payment_method" IS DISTINCT FROM OLD."payment_method" OR
    NEW."total" IS DISTINCT FROM OLD."total" OR
    NEW."shipping_cost" IS DISTINCT FROM OLD."shipping_cost" OR
    NEW."grand_total" IS DISTINCT FROM OLD."grand_total" OR
    NEW."currency" IS DISTINCT FROM OLD."currency" OR
    NEW."Vat_total" IS DISTINCT FROM OLD."Vat_total" OR
    NEW."discount_total" IS DISTINCT FROM OLD."discount_total" OR
    NEW."taxSnapshot" IS DISTINCT FROM OLD."taxSnapshot"
  ) THEN
    RAISE EXCEPTION 'Corporate order commercial context and totals are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "protect_customer_purchase_order_review_metadata"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'SUBMITTED' AND (
    NEW."reviewedById" IS DISTINCT FROM OLD."reviewedById" OR
    NEW."reviewedAt" IS DISTINCT FROM OLD."reviewedAt"
  ) THEN
    RAISE EXCEPTION 'Customer purchase order review metadata is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW."rejectionReason" IS DISTINCT FROM OLD."rejectionReason"
    AND NOT (OLD."status" = 'UNDER_REVIEW' AND NEW."status" = 'REJECTED') THEN
    RAISE EXCEPTION 'Customer purchase order rejection evidence is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
