import assert from "node:assert/strict";
import test from "node:test";
import {
  BusinessPriceAdjustmentType,
  BusinessPriceScopeType,
  BusinessPriceSource,
} from "../generated/prisma";
import {
  normalizePriceTarget,
  resolvePricePrecedence,
  type ContractCandidate,
  type TierRuleCandidate,
} from "../lib/business-network/pricing-core";
import { BusinessNetworkError } from "../lib/business-network/business-error";

const now = new Date("2026-08-26T12:00:00.000Z");
const context = { productId: 10, variantId: 20, categoryId: 30, brandId: 40 };

function contract(overrides: Partial<ContractCandidate> = {}): ContractCandidate {
  return {
    id: "contract-global",
    ...normalizePriceTarget({ scopeType: BusinessPriceScopeType.GLOBAL }),
    minQuantity: 1,
    unitPrice: "900.00",
    currency: "BDT",
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: null,
    isActive: true,
    ...overrides,
  };
}

function rule(overrides: Partial<TierRuleCandidate> = {}): TierRuleCandidate {
  return {
    id: "rule-global",
    ...normalizePriceTarget({ scopeType: BusinessPriceScopeType.GLOBAL }),
    minQuantity: 1,
    adjustmentType: BusinessPriceAdjustmentType.PERCENT_DISCOUNT,
    value: "10",
    startsAt: null,
    endsAt: null,
    isActive: true,
    priority: 100,
    ...overrides,
  };
}

test("target keys are canonical and irrelevant IDs are discarded", () => {
  assert.deepEqual(
    normalizePriceTarget({
      scopeType: BusinessPriceScopeType.PRODUCT,
      productId: 10,
      variantId: 999,
    }),
    {
      scopeType: BusinessPriceScopeType.PRODUCT,
      targetKey: "PRODUCT:10",
      productId: 10,
      variantId: null,
      categoryId: null,
      brandId: null,
    },
  );
});

test("frozen precedence is quotation, contract, tier, then public", () => {
  const common = {
    publicUnitPrice: "1000",
    currency: "BDT",
    quantity: 1,
    context,
    contracts: [contract()],
    tierRules: [rule()],
    now,
  };
  assert.equal(resolvePricePrecedence({ ...common, quotationUnitPrice: "800" }).source, BusinessPriceSource.QUOTATION);
  assert.equal(resolvePricePrecedence(common).source, BusinessPriceSource.CONTRACT);
  assert.equal(resolvePricePrecedence({ ...common, contracts: [] }).source, BusinessPriceSource.TIER);
  assert.equal(resolvePricePrecedence({ ...common, contracts: [], tierRules: [] }).source, BusinessPriceSource.PUBLIC);
});

test("specific target and largest eligible quantity win deterministically", () => {
  const productTarget = normalizePriceTarget({ scopeType: BusinessPriceScopeType.PRODUCT, productId: 10 });
  const variantTarget = normalizePriceTarget({ scopeType: BusinessPriceScopeType.VARIANT, variantId: 20 });
  const result = resolvePricePrecedence({
    publicUnitPrice: "1000",
    currency: "BDT",
    quantity: 12,
    context,
    now,
    contracts: [
      contract({ id: "global", unitPrice: "850" }),
      contract({ id: "product", ...productTarget, minQuantity: 10, unitPrice: "800" }),
      contract({ id: "variant", ...variantTarget, minQuantity: 5, unitPrice: "750" }),
    ],
  });
  assert.equal(result.referenceId, "variant");
  assert.equal(result.unitPrice.toFixed(2), "750.00");
});

test("tier percentage, amount, and fixed adjustments use Decimal money", () => {
  const values = [
    rule({ adjustmentType: BusinessPriceAdjustmentType.PERCENT_DISCOUNT, value: "12.5" }),
    rule({ adjustmentType: BusinessPriceAdjustmentType.AMOUNT_DISCOUNT, value: "125" }),
    rule({ adjustmentType: BusinessPriceAdjustmentType.FIXED_PRICE, value: "875" }),
  ];
  for (const candidate of values) {
    const result = resolvePricePrecedence({
      publicUnitPrice: "1000",
      currency: "BDT",
      quantity: 1,
      context,
      tierRules: [candidate],
      now,
    });
    assert.equal(result.unitPrice.toFixed(2), "875.00");
  }
});

test("expired, future, wrong-currency, and insufficient-quantity contracts are ignored", () => {
  const result = resolvePricePrecedence({
    publicUnitPrice: "1000",
    currency: "BDT",
    quantity: 2,
    context,
    now,
    contracts: [
      contract({ id: "expired", endsAt: new Date("2026-01-02T00:00:00.000Z") }),
      contract({ id: "future", startsAt: new Date("2027-01-01T00:00:00.000Z") }),
      contract({ id: "currency", currency: "USD" }),
      contract({ id: "quantity", minQuantity: 3 }),
    ],
  });
  assert.equal(result.source, BusinessPriceSource.PUBLIC);
});

test("invalid quotation currency and non-positive effective tier prices fail closed", () => {
  assert.throws(
    () => resolvePricePrecedence({ publicUnitPrice: "1000", currency: "BDT", quantity: 1, context, quotationUnitPrice: "5", quotationCurrency: "USD" }),
    (error) => error instanceof BusinessNetworkError && error.code === "PRICE_CURRENCY_MISMATCH",
  );
  assert.throws(
    () => resolvePricePrecedence({ publicUnitPrice: "100", currency: "BDT", quantity: 1, context, tierRules: [rule({ adjustmentType: BusinessPriceAdjustmentType.AMOUNT_DISCOUNT, value: "100" })] }),
    (error) => error instanceof BusinessNetworkError && error.code === "INVALID_EFFECTIVE_PRICE",
  );
});
