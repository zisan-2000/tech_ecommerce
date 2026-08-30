-- Tighten lifecycle timestamp evidence without rewriting historical financial values.
ALTER TABLE "CommissionEntry"
  DROP CONSTRAINT "CommissionEntry_lifecycle_evidence_check",
  ADD CONSTRAINT "CommissionEntry_lifecycle_evidence_check" CHECK (
    ("status" = 'PENDING' AND "holdUntil" IS NULL AND "approvedAt" IS NULL AND "payableAt" IS NULL AND "paidAt" IS NULL) OR
    ("status" = 'HOLD' AND "holdUntil" IS NOT NULL AND "approvedAt" IS NULL AND "payableAt" IS NULL AND "paidAt" IS NULL) OR
    ("status" = 'APPROVED' AND "approvedAt" IS NOT NULL AND "payableAt" IS NULL AND "paidAt" IS NULL) OR
    ("status" = 'PAYABLE' AND "approvedAt" IS NOT NULL AND "payableAt" IS NOT NULL AND "paidAt" IS NULL) OR
    ("status" = 'PAID' AND "approvedAt" IS NOT NULL AND "payableAt" IS NOT NULL AND "paidAt" IS NOT NULL) OR
    "status" IN ('CANCELLED', 'REVERSED')
  );
