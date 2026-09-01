import assert from "node:assert/strict";
import test from "node:test";
import {
  SalesQuotationStatus,
  SalesQuotationVersionStatus,
} from "../generated/prisma";
import {
  assertQuotationCanCreateVersion,
  assertQuotationMakerCheckerSeparation,
  assertQuotationValidUntil,
  assertQuotationVersionCanBeIssued,
  assertSalesQuotationTransition,
  formatSalesQuotationNumber,
} from "../lib/business-network/sales-quotation-core";
import { BusinessNetworkError } from "../lib/business-network/business-error";
import { createSalesQuotationSchema } from "../lib/business-network/sales-quotation-schemas";

test("quotation happy-path lifecycle follows the frozen workflow", () => {
  for (const [current, next] of [
    [SalesQuotationStatus.DRAFT, SalesQuotationStatus.INTERNAL_REVIEW],
    [SalesQuotationStatus.INTERNAL_REVIEW, SalesQuotationStatus.SENT],
    [SalesQuotationStatus.SENT, SalesQuotationStatus.VIEWED],
    [SalesQuotationStatus.VIEWED, SalesQuotationStatus.ACCEPTED],
  ] as const) assert.doesNotThrow(() => assertSalesQuotationTransition(current, next));
});

test("quotation rejection, expiry, and cancellation alternatives are exact", () => {
  assert.doesNotThrow(() => assertSalesQuotationTransition(SalesQuotationStatus.SENT, SalesQuotationStatus.REJECTED));
  assert.doesNotThrow(() => assertSalesQuotationTransition(SalesQuotationStatus.VIEWED, SalesQuotationStatus.EXPIRED));
  assert.doesNotThrow(() => assertSalesQuotationTransition(SalesQuotationStatus.DRAFT, SalesQuotationStatus.CANCELLED));
  assert.doesNotThrow(() => assertSalesQuotationTransition(SalesQuotationStatus.INTERNAL_REVIEW, SalesQuotationStatus.CANCELLED));
});

test("invalid and terminal quotation transitions fail closed", () => {
  for (const [current, next] of [
    [SalesQuotationStatus.DRAFT, SalesQuotationStatus.SENT],
    [SalesQuotationStatus.SENT, SalesQuotationStatus.ACCEPTED],
    [SalesQuotationStatus.ACCEPTED, SalesQuotationStatus.DRAFT],
  ] as const) {
    assert.throws(
      () => assertSalesQuotationTransition(current, next),
      (error) => error instanceof BusinessNetworkError && error.code === "INVALID_SALES_QUOTATION_STATUS_TRANSITION",
    );
  }
});

test("quotation maker and checker must be different users", () => {
  assert.doesNotThrow(() =>
    assertQuotationMakerCheckerSeparation(["quotation-maker", "version-maker"], "checker-user"),
  );

  assert.throws(
    () => assertQuotationMakerCheckerSeparation(["quotation-maker", "version-maker"], "quotation-maker"),
    (error) => error instanceof BusinessNetworkError && error.code === "QUOTATION_MAKER_CHECKER_VIOLATION",
  );

  assert.throws(
    () => assertQuotationMakerCheckerSeparation(["quotation-maker", "version-maker"], "version-maker"),
    (error) => error instanceof BusinessNetworkError && error.code === "QUOTATION_MAKER_CHECKER_VIOLATION",
  );
});

test("only the current draft quotation version can be issued", () => {
  assert.doesNotThrow(() => assertQuotationVersionCanBeIssued(SalesQuotationVersionStatus.DRAFT, true));
  assert.throws(
    () => assertQuotationVersionCanBeIssued(SalesQuotationVersionStatus.ISSUED, true),
    (error) => error instanceof BusinessNetworkError && error.code === "QUOTATION_VERSION_NOT_ISSUABLE",
  );
});

test("accepted, expired, and cancelled quotations cannot be versioned", () => {
  assert.doesNotThrow(() => assertQuotationCanCreateVersion(SalesQuotationStatus.VIEWED));
  for (const status of [SalesQuotationStatus.ACCEPTED, SalesQuotationStatus.EXPIRED, SalesQuotationStatus.CANCELLED]) {
    assert.throws(
      () => assertQuotationCanCreateVersion(status),
      (error) => error instanceof BusinessNetworkError && error.code === "QUOTATION_VERSIONING_CLOSED",
    );
  }
});

test("validity checks and human quotation number are deterministic", () => {
  const now = new Date("2026-08-26T12:00:00.000Z");
  assert.throws(
    () => assertQuotationValidUntil(new Date("2026-08-26T11:59:59.000Z"), now, true),
    (error) => error instanceof BusinessNetworkError && error.code === "QUOTATION_VALIDITY_EXPIRED",
  );
  assert.equal(formatSalesQuotationNumber(17n, now), "QUO-2026-00000017");
});

test("quotation request schema requires a priced item and normalizes currency", () => {
  const result = createSalesQuotationSchema.parse({
    organizationId: "org-1",
    version: {
      items: [{ productName: "Custom workstation", quantity: 2, unitPrice: "1000.00" }],
      currency: "bdt",
    },
  });
  assert.equal(result.version.currency, "BDT");
  assert.equal(result.version.items.length, 1);
});
