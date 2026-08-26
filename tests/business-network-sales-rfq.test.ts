import assert from "node:assert/strict";
import test from "node:test";
import { SalesRfqStatus } from "../generated/prisma";
import {
  assertSalesRfqEditable,
  assertSalesRfqTransition,
  formatSalesRfqNumber,
  validateSalesRfqDates,
} from "../lib/business-network/sales-rfq-core";
import { updateSalesRfqSchema } from "../lib/business-network/sales-rfq-schemas";
import { BusinessNetworkError } from "../lib/business-network/business-error";

test("Sales RFQ happy-path lifecycle follows the frozen workflow", () => {
  const transitions = [
    [SalesRfqStatus.DRAFT, SalesRfqStatus.SUBMITTED],
    [SalesRfqStatus.SUBMITTED, SalesRfqStatus.UNDER_REVIEW],
    [SalesRfqStatus.UNDER_REVIEW, SalesRfqStatus.QUOTED],
    [SalesRfqStatus.QUOTED, SalesRfqStatus.CLOSED],
  ] as const;
  for (const [current, next] of transitions) {
    assert.doesNotThrow(() => assertSalesRfqTransition(current, next));
  }
});

test("Sales RFQ alternative cancellation and rejection transitions are exact", () => {
  assert.doesNotThrow(() => assertSalesRfqTransition(SalesRfqStatus.DRAFT, SalesRfqStatus.CANCELLED));
  assert.doesNotThrow(() => assertSalesRfqTransition(SalesRfqStatus.SUBMITTED, SalesRfqStatus.CANCELLED));
  assert.doesNotThrow(() => assertSalesRfqTransition(SalesRfqStatus.SUBMITTED, SalesRfqStatus.REJECTED));
  assert.doesNotThrow(() => assertSalesRfqTransition(SalesRfqStatus.UNDER_REVIEW, SalesRfqStatus.REJECTED));
});

test("invalid and terminal Sales RFQ transitions fail closed", () => {
  for (const [current, next] of [
    [SalesRfqStatus.DRAFT, SalesRfqStatus.QUOTED],
    [SalesRfqStatus.SUBMITTED, SalesRfqStatus.CLOSED],
    [SalesRfqStatus.CLOSED, SalesRfqStatus.SUBMITTED],
    [SalesRfqStatus.REJECTED, SalesRfqStatus.DRAFT],
  ] as const) {
    assert.throws(
      () => assertSalesRfqTransition(current, next),
      (error) => error instanceof BusinessNetworkError && error.code === "INVALID_SALES_RFQ_STATUS_TRANSITION",
    );
  }
});

test("only draft Sales RFQs are editable", () => {
  assert.doesNotThrow(() => assertSalesRfqEditable(SalesRfqStatus.DRAFT));
  assert.throws(
    () => assertSalesRfqEditable(SalesRfqStatus.SUBMITTED),
    (error) => error instanceof BusinessNetworkError && error.code === "SALES_RFQ_NOT_EDITABLE",
  );
});

test("Sales RFQ date validation rejects expired and inverted dates", () => {
  const now = new Date("2026-08-26T12:00:00.000Z");
  assert.throws(
    () => validateSalesRfqDates({ quotationDueAt: new Date("2026-08-26T11:59:59.000Z"), now, requireFuture: true }),
    (error) => error instanceof BusinessNetworkError && error.code === "RFQ_QUOTATION_DUE_EXPIRED",
  );
  assert.throws(
    () => validateSalesRfqDates({ quotationDueAt: new Date("2026-09-10T00:00:00.000Z"), requestedDelivery: new Date("2026-09-01T00:00:00.000Z") }),
    (error) => error instanceof BusinessNetworkError && error.code === "RFQ_DATE_ORDER_INVALID",
  );
});

test("Sales RFQ numbers are deterministic, UTC-year based, and human readable", () => {
  assert.equal(formatSalesRfqNumber(42n, new Date("2026-12-31T23:00:00.000Z")), "RFQ-2026-00000042");
});

test("omitted RFQ text fields remain omitted during partial updates", () => {
  const result = updateSalesRfqSchema.parse({ subject: "Updated corporate workstation request" });
  assert.equal(result.subject, "Updated corporate workstation request");
  assert.equal(result.notes, undefined);
});
