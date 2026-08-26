import { SalesRfqStatus } from "@/generated/prisma";
import { BusinessNetworkError } from "./business-error";

const SALES_RFQ_TRANSITIONS: Record<SalesRfqStatus, readonly SalesRfqStatus[]> = {
  DRAFT: [SalesRfqStatus.SUBMITTED, SalesRfqStatus.CANCELLED],
  SUBMITTED: [SalesRfqStatus.UNDER_REVIEW, SalesRfqStatus.REJECTED, SalesRfqStatus.CANCELLED],
  UNDER_REVIEW: [SalesRfqStatus.QUOTED, SalesRfqStatus.REJECTED],
  QUOTED: [SalesRfqStatus.CLOSED],
  CLOSED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function assertSalesRfqTransition(current: SalesRfqStatus, next: SalesRfqStatus): void {
  if (!SALES_RFQ_TRANSITIONS[current].includes(next)) {
    throw new BusinessNetworkError(
      409,
      "INVALID_SALES_RFQ_STATUS_TRANSITION",
      `Sales RFQ cannot transition from ${current} to ${next}.`,
    );
  }
}

export function assertSalesRfqEditable(status: SalesRfqStatus): void {
  if (status !== SalesRfqStatus.DRAFT) {
    throw new BusinessNetworkError(
      409,
      "SALES_RFQ_NOT_EDITABLE",
      "Only a draft sales RFQ can be edited or have attachments changed.",
    );
  }
}

export function validateSalesRfqDates(input: {
  requestedDelivery?: Date | null;
  quotationDueAt?: Date | null;
  now?: Date;
  requireFuture?: boolean;
}): void {
  const now = input.now ?? new Date();
  if (input.requireFuture && input.requestedDelivery && input.requestedDelivery <= now) {
    throw new BusinessNetworkError(422, "RFQ_DELIVERY_DATE_EXPIRED", "Requested delivery must be in the future.");
  }
  if (input.requireFuture && input.quotationDueAt && input.quotationDueAt <= now) {
    throw new BusinessNetworkError(422, "RFQ_QUOTATION_DUE_EXPIRED", "Quotation due date must be in the future.");
  }
  if (
    input.requestedDelivery &&
    input.quotationDueAt &&
    input.quotationDueAt > input.requestedDelivery
  ) {
    throw new BusinessNetworkError(
      422,
      "RFQ_DATE_ORDER_INVALID",
      "Quotation due date cannot be later than the requested delivery date.",
    );
  }
}

export function formatSalesRfqNumber(sequence: bigint | number, now = new Date()): string {
  const value = BigInt(sequence);
  if (value <= 0n) {
    throw new BusinessNetworkError(422, "INVALID_RFQ_SEQUENCE", "Sales RFQ sequence must be positive.");
  }
  return `RFQ-${now.getUTCFullYear()}-${value.toString().padStart(8, "0")}`;
}
