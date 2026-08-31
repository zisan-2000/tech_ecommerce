-- M1 hardening: canonical organization identity duplicate prevention.
-- Existing duplicate rows are intentionally preserved for administrative
-- remediation. Every new identity write is protected at database level.

CREATE INDEX "Organization_tradeLicenseNo_normalized_idx"
  ON "Organization" ((NULLIF(regexp_replace(upper(btrim("tradeLicenseNo")), '[^A-Z0-9]', '', 'g'), '')))
  WHERE "tradeLicenseNo" IS NOT NULL;

CREATE INDEX "Organization_tin_normalized_idx"
  ON "Organization" ((NULLIF(regexp_replace(upper(btrim("tin")), '[^A-Z0-9]', '', 'g'), '')))
  WHERE "tin" IS NOT NULL;

CREATE INDEX "Organization_bin_normalized_idx"
  ON "Organization" ((NULLIF(regexp_replace(upper(btrim("bin")), '[^A-Z0-9]', '', 'g'), '')))
  WHERE "bin" IS NOT NULL;

CREATE OR REPLACE FUNCTION "enforce_organization_identifier_uniqueness"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_value text;
  conflicting_id text;
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW."tradeLicenseNo" IS DISTINCT FROM OLD."tradeLicenseNo") THEN
    normalized_value := NULLIF(regexp_replace(upper(btrim(NEW."tradeLicenseNo")), '[^A-Z0-9]', '', 'g'), '');
    IF normalized_value IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('organization:trade-license:' || normalized_value, 0));
      SELECT "id" INTO conflicting_id
      FROM "Organization"
      WHERE "id" <> NEW."id"
        AND NULLIF(regexp_replace(upper(btrim("tradeLicenseNo")), '[^A-Z0-9]', '', 'g'), '') = normalized_value
      LIMIT 1;
      IF conflicting_id IS NOT NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = '23505',
          CONSTRAINT = 'Organization_tradeLicenseNo_identity_key',
          MESSAGE = 'An organization with this Trade License, TIN, or BIN already exists.';
      END IF;
    END IF;
  END IF;

  conflicting_id := NULL;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW."tin" IS DISTINCT FROM OLD."tin") THEN
    normalized_value := NULLIF(regexp_replace(upper(btrim(NEW."tin")), '[^A-Z0-9]', '', 'g'), '');
    IF normalized_value IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('organization:tin:' || normalized_value, 0));
      SELECT "id" INTO conflicting_id
      FROM "Organization"
      WHERE "id" <> NEW."id"
        AND NULLIF(regexp_replace(upper(btrim("tin")), '[^A-Z0-9]', '', 'g'), '') = normalized_value
      LIMIT 1;
      IF conflicting_id IS NOT NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = '23505',
          CONSTRAINT = 'Organization_tin_identity_key',
          MESSAGE = 'An organization with this Trade License, TIN, or BIN already exists.';
      END IF;
    END IF;
  END IF;

  conflicting_id := NULL;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW."bin" IS DISTINCT FROM OLD."bin") THEN
    normalized_value := NULLIF(regexp_replace(upper(btrim(NEW."bin")), '[^A-Z0-9]', '', 'g'), '');
    IF normalized_value IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('organization:bin:' || normalized_value, 0));
      SELECT "id" INTO conflicting_id
      FROM "Organization"
      WHERE "id" <> NEW."id"
        AND NULLIF(regexp_replace(upper(btrim("bin")), '[^A-Z0-9]', '', 'g'), '') = normalized_value
      LIMIT 1;
      IF conflicting_id IS NOT NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = '23505',
          CONSTRAINT = 'Organization_bin_identity_key',
          MESSAGE = 'An organization with this Trade License, TIN, or BIN already exists.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Organization_identifier_uniqueness_trigger"
BEFORE INSERT OR UPDATE OF "tradeLicenseNo", "tin", "bin"
ON "Organization"
FOR EACH ROW
EXECUTE FUNCTION "enforce_organization_identifier_uniqueness"();
