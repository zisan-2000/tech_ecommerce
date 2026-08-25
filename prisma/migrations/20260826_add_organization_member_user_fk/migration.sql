-- M2: Complete the canonical User <-> OrganizationMember relationship.
-- Fail explicitly if legacy data contains an orphan instead of deleting or rewriting it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "OrganizationMember" AS member
    LEFT JOIN "User" AS app_user ON app_user."id" = member."userId"
    WHERE app_user."id" IS NULL
  ) THEN
    RAISE EXCEPTION
      'M2 migration aborted: OrganizationMember contains userId values that do not reference User.id';
  END IF;
END
$$;

ALTER TABLE "OrganizationMember"
  ADD CONSTRAINT "OrganizationMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
