-- Allow deterministic quantity/threshold tiers for the same commission target.
-- Selection remains deterministic by specificity, quantity eligibility, priority, then id.
DROP INDEX "CommissionRule_commissionPlanId_targetKey_key";

CREATE INDEX "CommissionRule_commissionPlanId_targetKey_minQuantity_idx"
  ON "CommissionRule"("commissionPlanId", "targetKey", "minQuantity");
