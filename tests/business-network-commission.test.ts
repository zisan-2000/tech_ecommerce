import assert from "node:assert/strict";
import test from "node:test";
import {
  CommissionBasis,
  CommissionCalculationType,
  CommissionEntryType,
  CommissionScopeType,
  CommissionStatus,
  Prisma,
  ProductType,
} from "../generated/prisma";
import { BusinessNetworkError } from "../lib/business-network/business-error";
import {
  assertCommissionEntryTransition,
  assertCorrectiveEntry,
  calculateCommissionAmount,
  normalizeCommissionTarget,
  selectCommissionRule,
  type CommissionRuleCandidate,
} from "../lib/business-network/commission-core";
import { createCommissionRuleSchema } from "../lib/business-network/commission-schemas";

function rule(overrides: Partial<CommissionRuleCandidate> & Pick<CommissionRuleCandidate, "id" | "scopeType" | "targetKey">): CommissionRuleCandidate {
  return {
    productId: null,
    variantId: null,
    categoryId: null,
    brandId: null,
    productType: null,
    calculationType: CommissionCalculationType.PERCENTAGE,
    basis: CommissionBasis.NET_ITEM,
    rate: new Prisma.Decimal(5),
    fixedAmount: null,
    minOrderAmount: null,
    minQuantity: null,
    maxCommission: null,
    priority: 100,
    isActive: true,
    ...overrides,
  };
}

const context = {
  productId: 10,
  variantId: 20,
  categoryId: 30,
  brandId: 40,
  productType: ProductType.PHYSICAL,
  quantity: 2,
  grossItemAmount: "2000.00",
  netItemAmount: "1800.00",
  orderNetAmount: "5000.00",
};

test("commission target keys are canonical and reject missing scope identifiers", () => {
  assert.equal(normalizeCommissionTarget({ scopeType: CommissionScopeType.GLOBAL }).targetKey, "GLOBAL");
  assert.equal(normalizeCommissionTarget({ scopeType: CommissionScopeType.VARIANT, variantId: 20 }).targetKey, "VARIANT:20");
  assert.equal(normalizeCommissionTarget({ scopeType: CommissionScopeType.PRODUCT_TYPE, productType: ProductType.PHYSICAL }).targetKey, "PRODUCT_TYPE:PHYSICAL");
  assert.throws(
    () => normalizeCommissionTarget({ scopeType: CommissionScopeType.PRODUCT }),
    (error) => error instanceof BusinessNetworkError && error.code === "INVALID_COMMISSION_TARGET",
  );
});

test("commission selection is deterministic: specificity, then ascending priority, then id", () => {
  const selected = selectCommissionRule([
    rule({ id: "global", scopeType: CommissionScopeType.GLOBAL, targetKey: "GLOBAL", priority: 1 }),
    rule({ id: "product-b", scopeType: CommissionScopeType.PRODUCT, targetKey: "PRODUCT:10", productId: 10, priority: 20 }),
    rule({ id: "product-a", scopeType: CommissionScopeType.PRODUCT, targetKey: "PRODUCT:10", productId: 10, priority: 10 }),
    rule({ id: "inactive-variant", scopeType: CommissionScopeType.VARIANT, targetKey: "VARIANT:20", variantId: 20, isActive: false }),
  ], context);
  assert.equal(selected?.id, "product-a");
});

test("eligible quantity tiers beat a lower tier on the same target", () => {
  const selected = selectCommissionRule([
    rule({ id: "product-1", scopeType: CommissionScopeType.PRODUCT, targetKey: "PRODUCT:10", productId: 10, minQuantity: 1 }),
    rule({ id: "product-2", scopeType: CommissionScopeType.PRODUCT, targetKey: "PRODUCT:10", productId: 10, minQuantity: 2 }),
    rule({ id: "product-3", scopeType: CommissionScopeType.PRODUCT, targetKey: "PRODUCT:10", productId: 10, minQuantity: 3 }),
  ], context);
  assert.equal(selected?.id, "product-2");
});

test("percentage and fixed calculations use Decimal rounding and maximum caps", () => {
  const percentage = calculateCommissionAmount({
    rule: rule({ id: "p", scopeType: CommissionScopeType.GLOBAL, targetKey: "GLOBAL", rate: "7.5" }),
    quantity: 2,
    grossBasisAmount: "2000",
    netBasisAmount: "1800",
  });
  assert.equal(percentage.amount.toFixed(2), "135.00");
  const fixed = calculateCommissionAmount({
    rule: rule({ id: "f", scopeType: CommissionScopeType.PRODUCT, targetKey: "PRODUCT:10", calculationType: CommissionCalculationType.FIXED_AMOUNT, rate: null, fixedAmount: "75", maxCommission: "100" }),
    quantity: 2,
    grossBasisAmount: "2000",
    netBasisAmount: "1800",
  });
  assert.equal(fixed.amount.toFixed(2), "100.00");
});

test("commission lifecycle and corrective entries fail closed", () => {
  assert.doesNotThrow(() => assertCommissionEntryTransition(CommissionStatus.PENDING, CommissionStatus.HOLD));
  assert.doesNotThrow(() => assertCommissionEntryTransition(CommissionStatus.HOLD, CommissionStatus.APPROVED));
  assert.throws(
    () => assertCommissionEntryTransition(CommissionStatus.PENDING, CommissionStatus.PAID),
    (error) => error instanceof BusinessNetworkError && error.code === "INVALID_COMMISSION_TRANSITION",
  );
  assert.equal(assertCorrectiveEntry({ type: CommissionEntryType.REVERSAL, amount: "-10", sourceEntryId: "entry-1" }).toFixed(2), "-10.00");
  assert.throws(() => assertCorrectiveEntry({ type: CommissionEntryType.REVERSAL, amount: "10", sourceEntryId: "entry-1" }));
});

test("commission rule schema enforces calculation and basis invariants", () => {
  const parsed = createCommissionRuleSchema.parse({
    name: "Lead five percent",
    scopeType: "LEAD",
    calculationType: "PERCENTAGE",
    basis: "LEAD_VALUE",
    rate: "5.0000",
  });
  assert.equal(parsed.basis, CommissionBasis.LEAD_VALUE);
  assert.throws(() => createCommissionRuleSchema.parse({
    name: "Broken fixed rule",
    scopeType: "GLOBAL",
    calculationType: "FIXED_AMOUNT",
    basis: "NET_ITEM",
    rate: "10",
  }));
});
