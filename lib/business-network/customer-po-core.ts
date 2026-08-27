import { CustomerPurchaseOrderStatus, Prisma } from "@/generated/prisma";
import { BusinessNetworkError } from "./business-error";

const TRANSITIONS: Record<CustomerPurchaseOrderStatus, readonly CustomerPurchaseOrderStatus[]> = {
  SUBMITTED: [CustomerPurchaseOrderStatus.UNDER_REVIEW, CustomerPurchaseOrderStatus.CANCELLED],
  UNDER_REVIEW: [CustomerPurchaseOrderStatus.VERIFIED, CustomerPurchaseOrderStatus.REJECTED],
  VERIFIED: [CustomerPurchaseOrderStatus.CONVERTED],
  REJECTED: [],
  CONVERTED: [],
  CANCELLED: [],
};

export function assertCustomerPoTransition(
  current: CustomerPurchaseOrderStatus,
  next: CustomerPurchaseOrderStatus,
): void {
  if (!TRANSITIONS[current].includes(next)) {
    throw new BusinessNetworkError(
      409,
      "INVALID_CUSTOMER_PO_STATUS_TRANSITION",
      `Customer purchase order cannot transition from ${current} to ${next}.`,
    );
  }
}

export function assertCustomerPoMatchesQuotation(input: {
  poTotal: Prisma.Decimal | null;
  poCurrency: string;
  quotationTotal: Prisma.Decimal;
  quotationCurrency: string;
}): void {
  if (!input.poTotal || !input.poTotal.equals(input.quotationTotal)) {
    throw new BusinessNetworkError(
      422,
      "CUSTOMER_PO_TOTAL_MISMATCH",
      "The customer PO total must exactly match the accepted quotation total.",
    );
  }
  if (input.poCurrency !== input.quotationCurrency) {
    throw new BusinessNetworkError(
      422,
      "CUSTOMER_PO_CURRENCY_MISMATCH",
      "The customer PO currency must match the accepted quotation currency.",
    );
  }
}

export function customerPoBusinessDiscount(input: {
  publicUnitPrice: Prisma.Decimal | null;
  unitPrice: Prisma.Decimal;
  quantity: number;
  explicitDiscount: Prisma.Decimal;
}): Prisma.Decimal {
  const negotiated = input.publicUnitPrice
    ? Prisma.Decimal.max(input.publicUnitPrice.minus(input.unitPrice), 0).mul(input.quantity)
    : new Prisma.Decimal(0);
  return negotiated.plus(input.explicitDiscount).toDecimalPlaces(2);
}
