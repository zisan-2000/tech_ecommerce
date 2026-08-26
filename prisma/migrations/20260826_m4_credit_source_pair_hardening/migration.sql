-- PostgreSQL CHECK constraints accept NULL results; require an explicit complete source pair.
ALTER TABLE "CreditLedgerEntry"
  DROP CONSTRAINT "CreditLedgerEntry_source_pair_check";

ALTER TABLE "CreditLedgerEntry"
  ADD CONSTRAINT "CreditLedgerEntry_source_pair_check"
  CHECK (
    ("sourceType" IS NULL AND "sourceId" IS NULL) OR
    (
      "sourceType" IS NOT NULL
      AND "sourceId" IS NOT NULL
      AND length(btrim("sourceType")) > 0
      AND length(btrim("sourceId")) > 0
    )
  );
