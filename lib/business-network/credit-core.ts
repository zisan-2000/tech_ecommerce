import { CreditLedgerDirection, CreditLedgerEntryType, Prisma } from "@/generated/prisma";
import { BusinessNetworkError } from "./business-error";

export type CreditMoney = Prisma.Decimal.Value;

export function creditDirectionForType(type: CreditLedgerEntryType): CreditLedgerDirection {
  switch (type) {
    case CreditLedgerEntryType.CREDIT_DRAW:
    case CreditLedgerEntryType.DEBIT_ADJUSTMENT:
      return CreditLedgerDirection.DEBIT;
    case CreditLedgerEntryType.REPAYMENT:
    case CreditLedgerEntryType.CREDIT_NOTE:
    case CreditLedgerEntryType.CREDIT_ADJUSTMENT:
      return CreditLedgerDirection.CREDIT;
  }
}

function asNonNegativeMoney(value: CreditMoney, field: string): Prisma.Decimal {
  const decimal = new Prisma.Decimal(value);
  if (!decimal.isFinite() || decimal.isNegative()) {
    throw new BusinessNetworkError(422, "INVALID_CREDIT_AMOUNT", `${field} must be a non-negative amount.`);
  }
  return decimal.toDecimalPlaces(2);
}

export function calculateAvailableCredit(input: {
  creditLimit: CreditMoney;
  currentBalance: CreditMoney;
}): Prisma.Decimal {
  const limit = asNonNegativeMoney(input.creditLimit, "Credit limit");
  const balance = asNonNegativeMoney(input.currentBalance, "Current balance");
  return Prisma.Decimal.max(limit.minus(balance), 0).toDecimalPlaces(2);
}

export function calculateCreditMovement(input: {
  creditLimit: CreditMoney;
  currentBalance: CreditMoney;
  amount: CreditMoney;
  type: CreditLedgerEntryType;
}): {
  direction: CreditLedgerDirection;
  nextBalance: Prisma.Decimal;
  availableCredit: Prisma.Decimal;
} {
  const limit = asNonNegativeMoney(input.creditLimit, "Credit limit");
  const balance = asNonNegativeMoney(input.currentBalance, "Current balance");
  const amount = new Prisma.Decimal(input.amount).toDecimalPlaces(2);
  if (!amount.isFinite() || amount.lessThanOrEqualTo(0)) {
    throw new BusinessNetworkError(422, "INVALID_CREDIT_AMOUNT", "Credit ledger amount must be greater than zero.");
  }

  const direction = creditDirectionForType(input.type);
  const nextBalance =
    direction === CreditLedgerDirection.DEBIT
      ? balance.plus(amount).toDecimalPlaces(2)
      : balance.minus(amount).toDecimalPlaces(2);

  if (nextBalance.isNegative()) {
    throw new BusinessNetworkError(
      409,
      "CREDIT_BALANCE_UNDERFLOW",
      "This credit would reduce the outstanding balance below zero.",
    );
  }
  if (nextBalance.greaterThan(limit)) {
    throw new BusinessNetworkError(
      409,
      "CREDIT_LIMIT_EXCEEDED",
      "This debit would exceed the approved corporate credit limit.",
    );
  }

  return {
    direction,
    nextBalance,
    availableCredit: limit.minus(nextBalance).toDecimalPlaces(2),
  };
}

export function evaluateCreditAvailability(input: {
  creditLimit: CreditMoney;
  currentBalance: CreditMoney;
  requestedAmount: CreditMoney;
}): { eligible: boolean; availableCredit: Prisma.Decimal; shortfall: Prisma.Decimal } {
  const availableCredit = calculateAvailableCredit(input);
  const requested = new Prisma.Decimal(input.requestedAmount).toDecimalPlaces(2);
  if (!requested.isFinite() || requested.lessThanOrEqualTo(0)) {
    throw new BusinessNetworkError(422, "INVALID_CREDIT_AMOUNT", "Requested credit must be greater than zero.");
  }
  return {
    eligible: availableCredit.greaterThanOrEqualTo(requested),
    availableCredit,
    shortfall: Prisma.Decimal.max(requested.minus(availableCredit), 0).toDecimalPlaces(2),
  };
}
