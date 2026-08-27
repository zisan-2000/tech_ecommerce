-- M9 forward-only identity hardening: converted customer identities must reference a real user.
ALTER TABLE "PartnerAttribution" ADD CONSTRAINT "PartnerAttribution_customerUserId_fkey"
  FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
