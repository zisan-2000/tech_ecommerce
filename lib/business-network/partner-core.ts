import {
  PartnerAgreementStatus,
  PartnerAgreementVersionStatus,
  PartnerStatus,
} from "@/generated/prisma";
import { BusinessNetworkError } from "./business-error";

const PARTNER_TRANSITIONS: Record<PartnerStatus, readonly PartnerStatus[]> = {
  APPLIED: [PartnerStatus.UNDER_REVIEW],
  UNDER_REVIEW: [PartnerStatus.ACTIVE, PartnerStatus.REJECTED],
  ACTIVE: [PartnerStatus.SUSPENDED, PartnerStatus.REVOKED],
  SUSPENDED: [PartnerStatus.ACTIVE, PartnerStatus.REVOKED],
  REJECTED: [],
  REVOKED: [],
};

const AGREEMENT_TRANSITIONS: Record<PartnerAgreementStatus, readonly PartnerAgreementStatus[]> = {
  DRAFT: [PartnerAgreementStatus.PENDING_APPROVAL],
  PENDING_APPROVAL: [PartnerAgreementStatus.ACTIVE],
  ACTIVE: [
    PartnerAgreementStatus.SUSPENDED,
    PartnerAgreementStatus.EXPIRED,
    PartnerAgreementStatus.TERMINATED,
  ],
  SUSPENDED: [PartnerAgreementStatus.TERMINATED],
  EXPIRED: [],
  TERMINATED: [],
};

const VERSION_TRANSITIONS: Record<
  PartnerAgreementVersionStatus,
  readonly PartnerAgreementVersionStatus[]
> = {
  DRAFT: [PartnerAgreementVersionStatus.PENDING_APPROVAL],
  PENDING_APPROVAL: [
    PartnerAgreementVersionStatus.ACTIVE,
    PartnerAgreementVersionStatus.REJECTED,
  ],
  ACTIVE: [PartnerAgreementVersionStatus.SUPERSEDED],
  SUPERSEDED: [],
  REJECTED: [],
};

function assertTransition<T extends string>(input: {
  current: T;
  next: T;
  transitions: Record<T, readonly T[]>;
  code: string;
  label: string;
}) {
  if (!input.transitions[input.current].includes(input.next)) {
    throw new BusinessNetworkError(
      409,
      input.code,
      `${input.label} cannot transition from ${input.current} to ${input.next}.`,
    );
  }
}

export function assertPartnerStatusTransition(current: PartnerStatus, next: PartnerStatus): void {
  assertTransition({
    current,
    next,
    transitions: PARTNER_TRANSITIONS,
    code: "INVALID_PARTNER_STATUS_TRANSITION",
    label: "Partner profile",
  });
}

export function assertPartnerAgreementTransition(
  current: PartnerAgreementStatus,
  next: PartnerAgreementStatus,
): void {
  assertTransition({
    current,
    next,
    transitions: AGREEMENT_TRANSITIONS,
    code: "INVALID_PARTNER_AGREEMENT_STATUS_TRANSITION",
    label: "Partner agreement",
  });
}

export function assertPartnerAgreementVersionTransition(
  current: PartnerAgreementVersionStatus,
  next: PartnerAgreementVersionStatus,
): void {
  assertTransition({
    current,
    next,
    transitions: VERSION_TRANSITIONS,
    code: "INVALID_PARTNER_AGREEMENT_VERSION_TRANSITION",
    label: "Partner agreement version",
  });
}

export function assertPartnerAgreementDates(startsAt: Date, endsAt?: Date | null): void {
  if (endsAt && endsAt <= startsAt) {
    throw new BusinessNetworkError(
      422,
      "PARTNER_AGREEMENT_DATES_INVALID",
      "Agreement end date must be later than its start date.",
    );
  }
}

function formatSequence(prefix: "PAR" | "AGR", sequence: bigint | number): string {
  const value = BigInt(sequence);
  if (value <= 0n || value > 99_999_999n) {
    throw new BusinessNetworkError(503, "PARTNER_SEQUENCE_INVALID", "Partner number sequence is unavailable.");
  }
  return `${prefix}-${value.toString().padStart(8, "0")}`;
}

export const formatPartnerCode = (sequence: bigint | number) => formatSequence("PAR", sequence);
export const formatPartnerAgreementNumber = (sequence: bigint | number) => formatSequence("AGR", sequence);
