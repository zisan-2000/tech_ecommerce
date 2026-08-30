import {
  CommissionBasis,
  CommissionCalculationType,
  CommissionEntryType,
  CommissionPlanStatus,
  CommissionScopeType,
  CommissionStatus,
  Prisma,
  ProductType,
} from "@/generated/prisma";
import { BusinessNetworkError } from "./business-error";

export type CommissionTargetInput = {
  scopeType: CommissionScopeType;
  productId?: number | null;
  variantId?: number | null;
  categoryId?: number | null;
  brandId?: number | null;
  productType?: ProductType | null;
};

export type CommissionRuleCandidate = {
  id: string;
  scopeType: CommissionScopeType;
  targetKey: string;
  productId: number | null;
  variantId: number | null;
  categoryId: number | null;
  brandId: number | null;
  productType: ProductType | null;
  calculationType: CommissionCalculationType;
  basis: CommissionBasis;
  rate: Prisma.Decimal.Value | null;
  fixedAmount: Prisma.Decimal.Value | null;
  minOrderAmount: Prisma.Decimal.Value | null;
  minQuantity: number | null;
  maxCommission: Prisma.Decimal.Value | null;
  priority: number;
  isActive: boolean;
};

export type CommissionItemContext = {
  productId: number;
  variantId: number | null;
  categoryId: number;
  brandId: number | null;
  productType: ProductType;
  quantity: number;
  grossItemAmount: Prisma.Decimal.Value;
  netItemAmount: Prisma.Decimal.Value;
  orderNetAmount: Prisma.Decimal.Value;
};

const SCOPE_SPECIFICITY: Record<CommissionScopeType, number> = {
  GLOBAL: 0,
  PRODUCT_TYPE: 1,
  BRAND: 2,
  CATEGORY: 3,
  PRODUCT: 4,
  VARIANT: 5,
  LEAD: 6,
};

function positiveId(value: number | null | undefined, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new BusinessNetworkError(422, "INVALID_COMMISSION_TARGET", `${field} is required for this scope.`);
  }
  return Number(value);
}

export function normalizeCommissionPlanCode(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeCommissionTarget(input: CommissionTargetInput) {
  const empty = { productId: null, variantId: null, categoryId: null, brandId: null, productType: null };
  switch (input.scopeType) {
    case CommissionScopeType.GLOBAL:
      return { scopeType: input.scopeType, targetKey: "GLOBAL", ...empty };
    case CommissionScopeType.PRODUCT: {
      const productId = positiveId(input.productId, "productId");
      return { scopeType: input.scopeType, targetKey: `PRODUCT:${productId}`, ...empty, productId };
    }
    case CommissionScopeType.VARIANT: {
      const variantId = positiveId(input.variantId, "variantId");
      return { scopeType: input.scopeType, targetKey: `VARIANT:${variantId}`, ...empty, variantId };
    }
    case CommissionScopeType.CATEGORY: {
      const categoryId = positiveId(input.categoryId, "categoryId");
      return { scopeType: input.scopeType, targetKey: `CATEGORY:${categoryId}`, ...empty, categoryId };
    }
    case CommissionScopeType.BRAND: {
      const brandId = positiveId(input.brandId, "brandId");
      return { scopeType: input.scopeType, targetKey: `BRAND:${brandId}`, ...empty, brandId };
    }
    case CommissionScopeType.PRODUCT_TYPE: {
      if (!input.productType) {
        throw new BusinessNetworkError(422, "INVALID_COMMISSION_TARGET", "productType is required for this scope.");
      }
      return { scopeType: input.scopeType, targetKey: `PRODUCT_TYPE:${input.productType}`, ...empty, productType: input.productType };
    }
    case CommissionScopeType.LEAD:
      return { scopeType: input.scopeType, targetKey: "LEAD", ...empty };
  }
}

export function assertCommissionPlanDates(startsAt?: Date | null, endsAt?: Date | null): void {
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw new BusinessNetworkError(422, "INVALID_COMMISSION_PLAN_DATES", "Plan end date must be later than its start date.");
  }
}

export function isCommissionPlanEffective(plan: {
  status: CommissionPlanStatus;
  startsAt: Date | null;
  endsAt: Date | null;
}, now = new Date()): boolean {
  return plan.status === CommissionPlanStatus.ACTIVE
    && (!plan.startsAt || plan.startsAt <= now)
    && (!plan.endsAt || plan.endsAt > now);
}

function money(value: Prisma.Decimal.Value, field: string, allowZero = true): Prisma.Decimal {
  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(value);
  } catch {
    throw new BusinessNetworkError(422, "INVALID_COMMISSION_AMOUNT", `${field} must be a valid decimal amount.`);
  }
  if (!amount.isFinite() || amount.isNegative() || (!allowZero && amount.isZero())) {
    throw new BusinessNetworkError(422, "INVALID_COMMISSION_AMOUNT", `${field} must be ${allowZero ? "non-negative" : "greater than zero"}.`);
  }
  return amount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function expectedTargetKeys(context: CommissionItemContext): Set<string> {
  return new Set([
    "GLOBAL",
    `PRODUCT:${context.productId}`,
    `CATEGORY:${context.categoryId}`,
    `PRODUCT_TYPE:${context.productType}`,
    ...(context.variantId ? [`VARIANT:${context.variantId}`] : []),
    ...(context.brandId ? [`BRAND:${context.brandId}`] : []),
  ]);
}

export function selectCommissionRule(
  candidates: readonly CommissionRuleCandidate[],
  context: CommissionItemContext,
): CommissionRuleCandidate | null {
  if (!Number.isInteger(context.quantity) || context.quantity < 1) {
    throw new BusinessNetworkError(422, "INVALID_COMMISSION_QUANTITY", "Commission quantity must be a positive integer.");
  }
  const orderNet = money(context.orderNetAmount, "Order net amount");
  const keys = expectedTargetKeys(context);
  return [...candidates]
    .filter((candidate) => candidate.isActive
      && candidate.scopeType !== CommissionScopeType.LEAD
      && keys.has(candidate.targetKey)
      && (candidate.minQuantity === null || candidate.minQuantity <= context.quantity)
      && (candidate.minOrderAmount === null || orderNet.gte(candidate.minOrderAmount)))
    .sort((left, right) => {
      const specificity = SCOPE_SPECIFICITY[right.scopeType] - SCOPE_SPECIFICITY[left.scopeType];
      if (specificity !== 0) return specificity;
      const quantityTier = (right.minQuantity ?? 0) - (left.minQuantity ?? 0);
      if (quantityTier !== 0) return quantityTier;
      const amountTier = new Prisma.Decimal(right.minOrderAmount ?? 0).cmp(left.minOrderAmount ?? 0);
      if (amountTier !== 0) return amountTier;
      if (left.priority !== right.priority) return left.priority - right.priority;
      return left.id.localeCompare(right.id);
    })[0] ?? null;
}

export function calculateCommissionAmount(input: {
  rule: Pick<CommissionRuleCandidate, "calculationType" | "basis" | "rate" | "fixedAmount" | "maxCommission">;
  quantity: number;
  grossBasisAmount: Prisma.Decimal.Value;
  netBasisAmount: Prisma.Decimal.Value;
  orderNetAmount?: Prisma.Decimal.Value;
  leadValue?: Prisma.Decimal.Value;
}): { amount: Prisma.Decimal; rate: Prisma.Decimal | null; basisAmount: Prisma.Decimal } {
  const gross = money(input.grossBasisAmount, "Gross basis amount");
  const net = money(input.netBasisAmount, "Net basis amount");
  const basisAmount = input.rule.basis === CommissionBasis.GROSS_ITEM
    ? gross
    : input.rule.basis === CommissionBasis.NET_ITEM
      ? net
      : input.rule.basis === CommissionBasis.ORDER_NET
        ? money(input.orderNetAmount ?? 0, "Order net amount")
        : money(input.leadValue ?? 0, "Lead value");
  let rate: Prisma.Decimal | null = null;
  let amount: Prisma.Decimal;
  if (input.rule.calculationType === CommissionCalculationType.PERCENTAGE) {
    rate = money(input.rule.rate ?? 0, "Commission rate", false);
    if (rate.gt(100)) throw new BusinessNetworkError(422, "INVALID_COMMISSION_RATE", "Commission rate cannot exceed 100 percent.");
    amount = basisAmount.mul(rate).div(100);
  } else {
    const fixed = money(input.rule.fixedAmount ?? 0, "Fixed commission", false);
    amount = fixed.mul(Math.max(1, input.quantity));
  }
  if (input.rule.maxCommission !== null) {
    amount = Prisma.Decimal.min(amount, money(input.rule.maxCommission, "Maximum commission", false));
  }
  return { amount: amount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP), rate, basisAmount };
}

const ENTRY_TRANSITIONS: Readonly<Record<CommissionStatus, readonly CommissionStatus[]>> = {
  PENDING: [CommissionStatus.HOLD, CommissionStatus.CANCELLED, CommissionStatus.REVERSED],
  HOLD: [CommissionStatus.APPROVED, CommissionStatus.CANCELLED, CommissionStatus.REVERSED],
  APPROVED: [CommissionStatus.PAYABLE, CommissionStatus.REVERSED],
  PAYABLE: [CommissionStatus.PAID, CommissionStatus.REVERSED],
  PAID: [CommissionStatus.REVERSED],
  CANCELLED: [],
  REVERSED: [],
};

export function assertCommissionEntryTransition(from: CommissionStatus, to: CommissionStatus): void {
  if (from === to) return;
  if (!ENTRY_TRANSITIONS[from].includes(to)) {
    throw new BusinessNetworkError(409, "INVALID_COMMISSION_TRANSITION", `Commission entry cannot move from ${from} to ${to}.`);
  }
}

export function assertCorrectiveEntry(input: {
  type: CommissionEntryType;
  amount: Prisma.Decimal.Value;
  sourceEntryId?: string | null;
}): Prisma.Decimal {
  const amount = new Prisma.Decimal(input.amount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (!amount.isFinite() || amount.isZero()) {
    throw new BusinessNetworkError(422, "INVALID_COMMISSION_AMOUNT", "Corrective commission amount cannot be zero.");
  }
  if (input.type === CommissionEntryType.REVERSAL && (!input.sourceEntryId || !amount.isNegative())) {
    throw new BusinessNetworkError(422, "INVALID_COMMISSION_REVERSAL", "A reversal requires a source entry and a negative amount.");
  }
  return amount;
}
