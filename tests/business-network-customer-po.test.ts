import assert from "node:assert/strict";
import test from "node:test";
import { CustomerPurchaseOrderStatus, Prisma } from "../generated/prisma";
import { BusinessNetworkError } from "../lib/business-network/business-error";
import {
  assertCustomerPoMatchesQuotation,
  assertCustomerPoTransition,
  customerPoBusinessDiscount,
} from "../lib/business-network/customer-po-core";
import { createCustomerPurchaseOrderSchema } from "../lib/business-network/customer-po-schemas";

test("customer PO happy path follows submitted-review-verified-converted", () => {
  for (const [current, next] of [
    [CustomerPurchaseOrderStatus.SUBMITTED, CustomerPurchaseOrderStatus.UNDER_REVIEW],
    [CustomerPurchaseOrderStatus.UNDER_REVIEW, CustomerPurchaseOrderStatus.VERIFIED],
    [CustomerPurchaseOrderStatus.VERIFIED, CustomerPurchaseOrderStatus.CONVERTED],
  ] as const) assert.doesNotThrow(() => assertCustomerPoTransition(current, next));
});

test("customer cancellation/rejection alternatives work and terminal states fail closed", () => {
  assert.doesNotThrow(() => assertCustomerPoTransition(
    CustomerPurchaseOrderStatus.SUBMITTED,
    CustomerPurchaseOrderStatus.CANCELLED,
  ));
  assert.doesNotThrow(() => assertCustomerPoTransition(
    CustomerPurchaseOrderStatus.UNDER_REVIEW,
    CustomerPurchaseOrderStatus.REJECTED,
  ));
  assert.throws(
    () => assertCustomerPoTransition(
      CustomerPurchaseOrderStatus.CONVERTED,
      CustomerPurchaseOrderStatus.CANCELLED,
    ),
    (error) => error instanceof BusinessNetworkError
      && error.code === "INVALID_CUSTOMER_PO_STATUS_TRANSITION",
  );
});

test("PO amount and currency must exactly match accepted quotation", () => {
  assert.doesNotThrow(() => assertCustomerPoMatchesQuotation({
    poTotal: new Prisma.Decimal("1000.50"),
    poCurrency: "BDT",
    quotationTotal: new Prisma.Decimal("1000.50"),
    quotationCurrency: "BDT",
  }));
  assert.throws(
    () => assertCustomerPoMatchesQuotation({
      poTotal: new Prisma.Decimal("1000.49"),
      poCurrency: "BDT",
      quotationTotal: new Prisma.Decimal("1000.50"),
      quotationCurrency: "BDT",
    }),
    (error) => error instanceof BusinessNetworkError && error.code === "CUSTOMER_PO_TOTAL_MISMATCH",
  );
});

test("business discount snapshot includes negotiated and explicit discounts", () => {
  assert.equal(customerPoBusinessDiscount({
    publicUnitPrice: new Prisma.Decimal("120"),
    unitPrice: new Prisma.Decimal("100"),
    quantity: 2,
    explicitDiscount: new Prisma.Decimal("5"),
  }).toFixed(2), "45.00");
});

test("customer PO schema normalizes currency and enforces safe documents/dates", () => {
  const parsed = createCustomerPurchaseOrderSchema.parse({
    quotationId: "quote-1",
    customerPoNumber: " PO-2026-100 ",
    fileUrl: "/upload/customer-po.pdf",
    currency: "bdt",
    poDate: "2026-08-26T00:00:00.000Z",
    expectedDeliveryAt: "2026-09-01T00:00:00.000Z",
  });
  assert.equal(parsed.customerPoNumber, "PO-2026-100");
  assert.equal(parsed.currency, "BDT");
  assert.throws(() => createCustomerPurchaseOrderSchema.parse({
    customerPoNumber: "PO-1",
    fileUrl: "http://unsafe.example/po.pdf",
  }));
});
