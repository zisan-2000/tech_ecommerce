import assert from "node:assert/strict";
import test from "node:test";
import {
  CommissionEntryType,
  PartnerPayoutAccountType,
  PartnerSettlementStatus,
} from "../generated/prisma";
import { BusinessNetworkError } from "../lib/business-network/business-error";
import {
  assertPartnerSettlementTransition,
  assertSettlementPeriod,
  calculateSettlementTotals,
  decryptPayoutAccountNumber,
  encryptPayoutAccountNumber,
  formatPartnerSettlementNumber,
  normalizePayoutAccountNumber,
  payoutAccountLast4,
} from "../lib/business-network/settlement-core";
import {
  createPayoutAccountSchema,
  createSettlementSchema,
  processSettlementSchema,
} from "../lib/business-network/settlement-schemas";

const encryptionSecret = "m11-test-only-encryption-secret-with-32-characters";

test("settlement lifecycle follows draft-to-paid and explicit failure retry paths", () => {
  assert.doesNotThrow(() => assertPartnerSettlementTransition(
    PartnerSettlementStatus.DRAFT,
    PartnerSettlementStatus.SUBMITTED,
  ));
  assert.doesNotThrow(() => assertPartnerSettlementTransition(
    PartnerSettlementStatus.PROCESSING,
    PartnerSettlementStatus.FAILED,
  ));
  assert.doesNotThrow(() => assertPartnerSettlementTransition(
    PartnerSettlementStatus.FAILED,
    PartnerSettlementStatus.PROCESSING,
  ));
  assert.throws(
    () => assertPartnerSettlementTransition(PartnerSettlementStatus.DRAFT, PartnerSettlementStatus.PAID),
    (error) => error instanceof BusinessNetworkError && error.code === "INVALID_PARTNER_SETTLEMENT_TRANSITION",
  );
  assert.throws(
    () => assertPartnerSettlementTransition(PartnerSettlementStatus.PAID, PartnerSettlementStatus.CANCELLED),
    (error) => error instanceof BusinessNetworkError,
  );
});

test("settlement totals preserve earning, adjustment, and reversal signs with Decimal money", () => {
  const totals = calculateSettlementTotals([
    { type: CommissionEntryType.EARNING, amount: "1250.55" },
    { type: CommissionEntryType.ADJUSTMENT, amount: "100.10" },
    { type: CommissionEntryType.REVERSAL, amount: "-250.25" },
  ]);
  assert.equal(totals.grossCommission.toFixed(2), "1250.55");
  assert.equal(totals.adjustments.toFixed(2), "-150.15");
  assert.equal(totals.netPayable.toFixed(2), "1100.40");
});

test("payout account number is normalized, masked, and authenticated-encrypted", () => {
  const normalized = normalizePayoutAccountNumber(" 01712-345 678 ");
  assert.equal(normalized, "01712345678");
  assert.equal(payoutAccountLast4(normalized), "5678");
  const first = encryptPayoutAccountNumber(normalized, encryptionSecret);
  const second = encryptPayoutAccountNumber(normalized, encryptionSecret);
  assert.match(first, /^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
  assert.notEqual(first, second);
  assert.ok(!first.includes(normalized));
  assert.equal(decryptPayoutAccountNumber(first, encryptionSecret), normalized);
  assert.throws(
    () => decryptPayoutAccountNumber(first, `${encryptionSecret}-wrong`),
    (error) => error instanceof BusinessNetworkError && error.code === "PAYOUT_DECRYPTION_FAILED",
  );
});

test("settlement identifiers and periods are deterministic and fail closed", () => {
  assert.equal(formatPartnerSettlementNumber(42), "SET-00000042");
  const now = new Date("2026-08-30T10:00:00.000Z");
  assert.doesNotThrow(() => assertSettlementPeriod(
    new Date("2026-08-01T00:00:00.000Z"),
    new Date("2026-08-29T23:59:59.000Z"),
    now,
  ));
  assert.throws(() => assertSettlementPeriod(now, now, now));
  assert.throws(() => assertSettlementPeriod(new Date("2026-08-01T00:00:00.000Z"), new Date("2026-09-01T00:00:00.000Z"), now));
});

test("M11 request schemas reject unsafe payout and settlement payloads", () => {
  const wallet = createPayoutAccountSchema.parse({
    type: PartnerPayoutAccountType.MOBILE_WALLET,
    accountName: "Demo Partner",
    providerName: "bKash",
    accountNumber: "01712345678",
  });
  assert.equal(wallet.accountNumber, "01712345678");
  assert.throws(() => createPayoutAccountSchema.parse({
    type: PartnerPayoutAccountType.BANK,
    accountName: "Demo Partner",
    accountNumber: "123456789",
  }));
  assert.throws(() => createSettlementSchema.parse({
    partnerProfileId: "partner-1",
    periodStart: "2026-08-30T00:00:00.000Z",
    periodEnd: "2026-08-01T00:00:00.000Z",
    commissionEntryIds: ["entry-1", "entry-1"],
  }));
  assert.throws(() => processSettlementSchema.parse({ outcome: "FAILED" }));
  assert.equal(processSettlementSchema.parse({}).outcome, "START");
});
