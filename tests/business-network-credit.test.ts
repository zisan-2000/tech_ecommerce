import assert from "node:assert/strict";
import test from "node:test";
import { CreditLedgerDirection, CreditLedgerEntryType } from "../generated/prisma";
import {
  calculateAvailableCredit,
  calculateCreditMovement,
  creditDirectionForType,
  evaluateCreditAvailability,
} from "../lib/business-network/credit-core";
import { BusinessNetworkError } from "../lib/business-network/business-error";

test("available credit is limit minus outstanding balance using Decimal money", () => {
  assert.equal(
    calculateAvailableCredit({ creditLimit: "100000.10", currentBalance: "25000.05" }).toFixed(2),
    "75000.05",
  );
});

test("ledger types have server-derived debit and credit directions", () => {
  for (const type of [CreditLedgerEntryType.CREDIT_DRAW, CreditLedgerEntryType.DEBIT_ADJUSTMENT]) {
    assert.equal(creditDirectionForType(type), CreditLedgerDirection.DEBIT);
  }
  for (const type of [
    CreditLedgerEntryType.REPAYMENT,
    CreditLedgerEntryType.CREDIT_NOTE,
    CreditLedgerEntryType.CREDIT_ADJUSTMENT,
  ]) {
    assert.equal(creditDirectionForType(type), CreditLedgerDirection.CREDIT);
  }
});

test("debits increase balance and credits reduce balance", () => {
  const debit = calculateCreditMovement({
    creditLimit: "1000",
    currentBalance: "250",
    amount: "125.55",
    type: CreditLedgerEntryType.DEBIT_ADJUSTMENT,
  });
  assert.equal(debit.nextBalance.toFixed(2), "375.55");
  assert.equal(debit.availableCredit.toFixed(2), "624.45");

  const credit = calculateCreditMovement({
    creditLimit: "1000",
    currentBalance: debit.nextBalance,
    amount: "75.55",
    type: CreditLedgerEntryType.CREDIT_ADJUSTMENT,
  });
  assert.equal(credit.nextBalance.toFixed(2), "300.00");
});

test("credit movements fail closed on limit overflow and balance underflow", () => {
  assert.throws(
    () => calculateCreditMovement({ creditLimit: "100", currentBalance: "90", amount: "10.01", type: CreditLedgerEntryType.CREDIT_DRAW }),
    (error) => error instanceof BusinessNetworkError && error.code === "CREDIT_LIMIT_EXCEEDED",
  );
  assert.throws(
    () => calculateCreditMovement({ creditLimit: "100", currentBalance: "10", amount: "10.01", type: CreditLedgerEntryType.REPAYMENT }),
    (error) => error instanceof BusinessNetworkError && error.code === "CREDIT_BALANCE_UNDERFLOW",
  );
});

test("credit precheck reports eligibility and exact shortfall without mutating balance", () => {
  const eligible = evaluateCreditAvailability({ creditLimit: "500", currentBalance: "125", requestedAmount: "375" });
  assert.equal(eligible.eligible, true);
  assert.equal(eligible.shortfall.toFixed(2), "0.00");

  const blocked = evaluateCreditAvailability({ creditLimit: "500", currentBalance: "125", requestedAmount: "400" });
  assert.equal(blocked.eligible, false);
  assert.equal(blocked.availableCredit.toFixed(2), "375.00");
  assert.equal(blocked.shortfall.toFixed(2), "25.00");
});
