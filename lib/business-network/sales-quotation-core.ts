import {
  SalesQuotationStatus,
  SalesQuotationVersionStatus,
} from "@/generated/prisma";
import { BusinessNetworkError } from "./business-error";

const SALES_QUOTATION_TRANSITIONS: Record<
  SalesQuotationStatus,
  readonly SalesQuotationStatus[]
> = {
  DRAFT: [SalesQuotationStatus.INTERNAL_REVIEW, SalesQuotationStatus.CANCELLED],
  INTERNAL_REVIEW: [SalesQuotationStatus.SENT, SalesQuotationStatus.CANCELLED],
  SENT: [
    SalesQuotationStatus.VIEWED,
    SalesQuotationStatus.REJECTED,
    SalesQuotationStatus.EXPIRED,
  ],
  VIEWED: [
    SalesQuotationStatus.ACCEPTED,
    SalesQuotationStatus.REJECTED,
    SalesQuotationStatus.EXPIRED,
  ],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export function assertSalesQuotationTransition(
  current: SalesQuotationStatus,
  next: SalesQuotationStatus,
): void {
  if (!SALES_QUOTATION_TRANSITIONS[current].includes(next)) {
    throw new BusinessNetworkError(
      409,
      "INVALID_SALES_QUOTATION_STATUS_TRANSITION",
      `Sales quotation cannot transition from ${current} to ${next}.`,
    );
  }
}

export function assertQuotationMakerCheckerSeparation(
  makerUserIds: Iterable<string | null | undefined>,
  approverUserId: string | null | undefined,
): void {
  if (!approverUserId) {
    throw new BusinessNetworkError(
      422,
      "QUOTATION_APPROVER_REQUIRED",
      "An authenticated quotation approver is required.",
    );
  }

  const makerIds = new Set(
    Array.from(makerUserIds).filter(
      (userId): userId is string => typeof userId === "string" && userId.length > 0,
    ),
  );

  if (makerIds.has(approverUserId)) {
    throw new BusinessNetworkError(
      409,
      "QUOTATION_MAKER_CHECKER_VIOLATION",
      "A quotation must be approved by a different authorized user than the user who created the quotation or its current version.",
    );
  }
}

export function assertQuotationVersionCanBeIssued(
  status: SalesQuotationVersionStatus,
  isCurrent: boolean,
): void {
  if (status !== SalesQuotationVersionStatus.DRAFT || !isCurrent) {
    throw new BusinessNetworkError(
      409,
      "QUOTATION_VERSION_NOT_ISSUABLE",
      "Only the current draft quotation version can be issued.",
    );
  }
}

export function assertQuotationCanCreateVersion(status: SalesQuotationStatus): void {
  if (
    status === SalesQuotationStatus.ACCEPTED ||
    status === SalesQuotationStatus.EXPIRED ||
    status === SalesQuotationStatus.CANCELLED
  ) {
    throw new BusinessNetworkError(
      409,
      "QUOTATION_VERSIONING_CLOSED",
      `A ${status.toLowerCase()} quotation cannot be revised.`,
    );
  }
}

export function assertQuotationValidUntil(
  validUntil: Date | null | undefined,
  now = new Date(),
  requireFuture = false,
): void {
  if (requireFuture && validUntil && validUntil <= now) {
    throw new BusinessNetworkError(
      422,
      "QUOTATION_VALIDITY_EXPIRED",
      "Quotation validity must end in the future.",
    );
  }
}

export function formatSalesQuotationNumber(
  sequence: bigint | number,
  now = new Date(),
): string {
  const value = BigInt(sequence);
  if (value <= 0n) {
    throw new BusinessNetworkError(
      422,
      "INVALID_QUOTATION_SEQUENCE",
      "Sales quotation sequence must be positive.",
    );
  }
  return `QUO-${now.getUTCFullYear()}-${value.toString().padStart(8, "0")}`;
}
