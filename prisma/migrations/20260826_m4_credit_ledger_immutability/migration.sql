-- Keep financial ledger rows append-only while preserving the frozen Order ON DELETE SET NULL relation.
CREATE FUNCTION "prevent_credit_ledger_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CreditLedgerEntry rows are append-only and cannot be deleted.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."creditAccountId" IS DISTINCT FROM OLD."creditAccountId"
    OR NEW."type" IS DISTINCT FROM OLD."type"
    OR NEW."direction" IS DISTINCT FROM OLD."direction"
    OR NEW."amount" IS DISTINCT FROM OLD."amount"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."sourceType" IS DISTINCT FROM OLD."sourceType"
    OR NEW."sourceId" IS DISTINCT FROM OLD."sourceId"
    OR NEW."description" IS DISTINCT FROM OLD."description"
    OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR (
      NEW."orderId" IS DISTINCT FROM OLD."orderId"
      AND NOT (OLD."orderId" IS NOT NULL AND NEW."orderId" IS NULL)
    )
  THEN
    RAISE EXCEPTION 'CreditLedgerEntry financial data is immutable.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "CreditLedgerEntry_immutable_trigger"
BEFORE UPDATE OR DELETE ON "CreditLedgerEntry"
FOR EACH ROW EXECUTE FUNCTION "prevent_credit_ledger_mutation"();
