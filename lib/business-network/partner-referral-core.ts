import {
  PartnerAssetStatus,
  PartnerAssetType,
  PartnerAttributionSource,
  PartnerAttributionStatus,
  PartnerLeadStatus,
} from "@/generated/prisma";
import { BusinessNetworkError } from "./business-error";

const LEAD_TRANSITIONS: Readonly<Record<PartnerLeadStatus, readonly PartnerLeadStatus[]>> = {
  SUBMITTED: [PartnerLeadStatus.VALIDATING],
  VALIDATING: [PartnerLeadStatus.ACCEPTED, PartnerLeadStatus.DUPLICATE, PartnerLeadStatus.REJECTED],
  ACCEPTED: [PartnerLeadStatus.ASSIGNED, PartnerLeadStatus.EXPIRED, PartnerLeadStatus.REJECTED],
  ASSIGNED: [PartnerLeadStatus.IN_PROGRESS, PartnerLeadStatus.EXPIRED, PartnerLeadStatus.REJECTED],
  IN_PROGRESS: [PartnerLeadStatus.WON, PartnerLeadStatus.LOST, PartnerLeadStatus.EXPIRED, PartnerLeadStatus.REJECTED],
  DUPLICATE: [],
  WON: [],
  LOST: [],
  EXPIRED: [],
  REJECTED: [],
};

const ATTRIBUTION_TRANSITIONS: Readonly<Record<PartnerAttributionStatus, readonly PartnerAttributionStatus[]>> = {
  ACTIVE: [
    PartnerAttributionStatus.CONVERTED,
    PartnerAttributionStatus.EXPIRED,
    PartnerAttributionStatus.REJECTED,
  ],
  CONVERTED: [],
  EXPIRED: [],
  REJECTED: [],
};

export function assertPartnerLeadTransition(from: PartnerLeadStatus, to: PartnerLeadStatus): void {
  if (!LEAD_TRANSITIONS[from].includes(to)) {
    throw new BusinessNetworkError(
      409,
      "INVALID_PARTNER_LEAD_TRANSITION",
      `Partner lead cannot move from ${from} to ${to}.`,
    );
  }
}

export function assertPartnerAttributionTransition(
  from: PartnerAttributionStatus,
  to: PartnerAttributionStatus,
): void {
  if (!ATTRIBUTION_TRANSITIONS[from].includes(to)) {
    throw new BusinessNetworkError(
      409,
      "INVALID_PARTNER_ATTRIBUTION_TRANSITION",
      `Partner attribution cannot move from ${from} to ${to}.`,
    );
  }
}

export function formatPartnerLeadNumber(value: bigint | number): string {
  const normalized = typeof value === "bigint" ? value : BigInt(value);
  if (normalized < 1n || normalized > 99_999_999n) {
    throw new BusinessNetworkError(503, "PARTNER_LEAD_SEQUENCE_EXHAUSTED", "Partner lead sequence is invalid.");
  }
  return `LEAD-${normalized.toString().padStart(8, "0")}`;
}

export function normalizePartnerAssetCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isSafePartnerDestinationPath(value: string): boolean {
  return value.startsWith("/")
    && !value.startsWith("//")
    && !value.includes("\\")
    && !/[\u0000-\u001f\u007f]/.test(value)
    && value.length <= 2_048;
}

export function assertPartnerAssetDates(startsAt?: Date | null, endsAt?: Date | null): void {
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw new BusinessNetworkError(
      422,
      "INVALID_PARTNER_ASSET_DATES",
      "Partner asset end date must be later than its start date.",
    );
  }
}

export function isPartnerAssetUsable(
  asset: { status: PartnerAssetStatus; startsAt: Date | null; endsAt: Date | null },
  now = new Date(),
): boolean {
  return asset.status === PartnerAssetStatus.ACTIVE
    && (!asset.startsAt || asset.startsAt <= now)
    && (!asset.endsAt || asset.endsAt > now);
}

export function sourceForPartnerAsset(type: PartnerAssetType): PartnerAttributionSource {
  if (type === PartnerAssetType.REFERRAL_LINK) return PartnerAttributionSource.REFERRAL_LINK;
  if (type === PartnerAssetType.REFERRAL_CODE) return PartnerAttributionSource.REFERRAL_CODE;
  return PartnerAttributionSource.PROMO_CODE;
}

export function attributionExpiry(capturedAt: Date, windowDays: number): Date {
  return new Date(capturedAt.getTime() + windowDays * 24 * 60 * 60 * 1_000);
}
