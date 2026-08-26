import {
  BusinessPriceAdjustmentType,
  BusinessPriceScopeType,
  BusinessPriceSource,
  Prisma,
} from "@/generated/prisma";
import { BusinessNetworkError } from "./business-error";

export type PriceTargetInput = {
  scopeType: BusinessPriceScopeType;
  productId?: number | null;
  variantId?: number | null;
  categoryId?: number | null;
  brandId?: number | null;
};

export type NormalizedPriceTarget = PriceTargetInput & {
  targetKey: string;
  productId: number | null;
  variantId: number | null;
  categoryId: number | null;
  brandId: number | null;
};

type PriceContext = {
  productId: number;
  variantId: number | null;
  categoryId: number;
  brandId: number | null;
};

export type ContractCandidate = NormalizedPriceTarget & {
  id: string;
  minQuantity: number;
  unitPrice: Prisma.Decimal.Value;
  currency: string;
  startsAt: Date;
  endsAt: Date | null;
  isActive: boolean;
};

export type TierRuleCandidate = NormalizedPriceTarget & {
  id: string;
  minQuantity: number;
  adjustmentType: BusinessPriceAdjustmentType;
  value: Prisma.Decimal.Value;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
  priority: number;
};

const SCOPE_SPECIFICITY: Record<BusinessPriceScopeType, number> = {
  GLOBAL: 0,
  BRAND: 1,
  CATEGORY: 2,
  PRODUCT: 3,
  VARIANT: 4,
};

function requirePositiveId(value: number | null | undefined, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new BusinessNetworkError(422, "INVALID_PRICE_TARGET", `${field} is required for this scope.`);
  }
  return Number(value);
}

export function normalizePriceTarget(input: PriceTargetInput): NormalizedPriceTarget {
  const empty = { productId: null, variantId: null, categoryId: null, brandId: null };
  switch (input.scopeType) {
    case BusinessPriceScopeType.GLOBAL:
      return { scopeType: input.scopeType, targetKey: "GLOBAL", ...empty };
    case BusinessPriceScopeType.PRODUCT: {
      const productId = requirePositiveId(input.productId, "productId");
      return { scopeType: input.scopeType, targetKey: `PRODUCT:${productId}`, ...empty, productId };
    }
    case BusinessPriceScopeType.VARIANT: {
      const variantId = requirePositiveId(input.variantId, "variantId");
      return { scopeType: input.scopeType, targetKey: `VARIANT:${variantId}`, ...empty, variantId };
    }
    case BusinessPriceScopeType.CATEGORY: {
      const categoryId = requirePositiveId(input.categoryId, "categoryId");
      return { scopeType: input.scopeType, targetKey: `CATEGORY:${categoryId}`, ...empty, categoryId };
    }
    case BusinessPriceScopeType.BRAND: {
      const brandId = requirePositiveId(input.brandId, "brandId");
      return { scopeType: input.scopeType, targetKey: `BRAND:${brandId}`, ...empty, brandId };
    }
  }
}

function expectedTargetKeys(context: PriceContext): Set<string> {
  return new Set([
    "GLOBAL",
    `PRODUCT:${context.productId}`,
    `CATEGORY:${context.categoryId}`,
    ...(context.variantId ? [`VARIANT:${context.variantId}`] : []),
    ...(context.brandId ? [`BRAND:${context.brandId}`] : []),
  ]);
}

function isActiveWindow(
  candidate: { isActive: boolean; startsAt: Date | null; endsAt: Date | null },
  now: Date,
) {
  return (
    candidate.isActive &&
    (!candidate.startsAt || candidate.startsAt <= now) &&
    (!candidate.endsAt || candidate.endsAt > now)
  );
}

function selectCandidate<T extends {
  id: string;
  scopeType: BusinessPriceScopeType;
  targetKey: string;
  minQuantity: number;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
  priority?: number;
}>(candidates: readonly T[], context: PriceContext, quantity: number, now: Date): T | null {
  const keys = expectedTargetKeys(context);
  return [...candidates]
    .filter(
      (candidate) =>
        keys.has(candidate.targetKey) &&
        candidate.minQuantity <= quantity &&
        isActiveWindow(candidate, now),
    )
    .sort((left, right) => {
      const specificity = SCOPE_SPECIFICITY[right.scopeType] - SCOPE_SPECIFICITY[left.scopeType];
      if (specificity !== 0) return specificity;
      if (right.minQuantity !== left.minQuantity) return right.minQuantity - left.minQuantity;
      const priority = (left.priority ?? 100) - (right.priority ?? 100);
      if (priority !== 0) return priority;
      const date = (right.startsAt?.getTime() ?? 0) - (left.startsAt?.getTime() ?? 0);
      if (date !== 0) return date;
      return left.id.localeCompare(right.id);
    })[0] ?? null;
}

function positiveMoney(value: Prisma.Decimal.Value, code: string): Prisma.Decimal {
  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(value);
  } catch {
    throw new BusinessNetworkError(422, code, "Price must be a valid decimal amount.");
  }
  if (!amount.isFinite() || amount.lte(0)) {
    throw new BusinessNetworkError(422, code, "Price must be greater than zero.");
  }
  return amount;
}

function applyTierRule(publicPrice: Prisma.Decimal, rule: TierRuleCandidate) {
  const value = positiveMoney(rule.value, "INVALID_PRICING_RULE_VALUE");
  let unitPrice: Prisma.Decimal;
  if (rule.adjustmentType === BusinessPriceAdjustmentType.FIXED_PRICE) {
    unitPrice = value;
  } else if (rule.adjustmentType === BusinessPriceAdjustmentType.AMOUNT_DISCOUNT) {
    unitPrice = publicPrice.minus(value);
  } else {
    if (value.gt(100)) {
      throw new BusinessNetworkError(
        422,
        "INVALID_PRICING_RULE_VALUE",
        "Percentage discount cannot exceed 100.",
      );
    }
    unitPrice = publicPrice.mul(new Prisma.Decimal(100).minus(value)).div(100);
  }
  if (unitPrice.lte(0)) {
    throw new BusinessNetworkError(
      422,
      "INVALID_EFFECTIVE_PRICE",
      "The selected pricing rule produces a non-positive unit price.",
    );
  }
  return unitPrice.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function resolvePricePrecedence(input: {
  publicUnitPrice: Prisma.Decimal.Value;
  currency: string;
  quantity: number;
  context: PriceContext;
  quotationUnitPrice?: Prisma.Decimal.Value | null;
  quotationCurrency?: string | null;
  contracts?: readonly ContractCandidate[];
  tierRules?: readonly TierRuleCandidate[];
  now?: Date;
}) {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new BusinessNetworkError(422, "INVALID_QUANTITY", "Quantity must be a positive integer.");
  }
  const currency = input.currency.trim().toUpperCase();
  const publicUnitPrice = positiveMoney(input.publicUnitPrice, "INVALID_PUBLIC_PRICE")
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  if (input.quotationUnitPrice !== undefined && input.quotationUnitPrice !== null) {
    if ((input.quotationCurrency ?? currency).trim().toUpperCase() !== currency) {
      throw new BusinessNetworkError(422, "PRICE_CURRENCY_MISMATCH", "Quotation currency does not match the public price currency.");
    }
    return priceResult(BusinessPriceSource.QUOTATION, positiveMoney(input.quotationUnitPrice, "INVALID_QUOTATION_PRICE"), publicUnitPrice, currency, null);
  }

  const now = input.now ?? new Date();
  const contract = selectCandidate(
    (input.contracts ?? []).filter((candidate) => candidate.currency.toUpperCase() === currency),
    input.context,
    input.quantity,
    now,
  );
  if (contract) {
    return priceResult(BusinessPriceSource.CONTRACT, positiveMoney(contract.unitPrice, "INVALID_CONTRACT_PRICE"), publicUnitPrice, currency, contract.id);
  }

  const tierRule = selectCandidate(input.tierRules ?? [], input.context, input.quantity, now);
  if (tierRule) {
    return priceResult(BusinessPriceSource.TIER, applyTierRule(publicUnitPrice, tierRule), publicUnitPrice, currency, tierRule.id);
  }

  return priceResult(BusinessPriceSource.PUBLIC, publicUnitPrice, publicUnitPrice, currency, null);
}

function priceResult(
  source: BusinessPriceSource,
  unitPriceInput: Prisma.Decimal,
  publicUnitPrice: Prisma.Decimal,
  currency: string,
  referenceId: string | null,
) {
  const unitPrice = unitPriceInput.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const discountAmount = Prisma.Decimal.max(0, publicUnitPrice.minus(unitPrice)).toDecimalPlaces(2);
  return { source, unitPrice, publicUnitPrice, discountAmount, currency, referenceId };
}
