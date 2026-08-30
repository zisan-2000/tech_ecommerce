import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  CommissionEntryType,
  PartnerSettlementStatus,
  Prisma,
} from "@/generated/prisma";
import { BusinessNetworkError } from "./business-error";

const PAYOUT_CIPHER_VERSION = "v1";

const SETTLEMENT_TRANSITIONS: Readonly<
  Record<PartnerSettlementStatus, readonly PartnerSettlementStatus[]>
> = {
  DRAFT: [PartnerSettlementStatus.SUBMITTED, PartnerSettlementStatus.CANCELLED],
  SUBMITTED: [PartnerSettlementStatus.APPROVED, PartnerSettlementStatus.CANCELLED],
  APPROVED: [PartnerSettlementStatus.PROCESSING, PartnerSettlementStatus.CANCELLED],
  PROCESSING: [PartnerSettlementStatus.PAID, PartnerSettlementStatus.FAILED],
  PAID: [],
  FAILED: [PartnerSettlementStatus.PROCESSING, PartnerSettlementStatus.CANCELLED],
  CANCELLED: [],
};

export function assertPartnerSettlementTransition(
  from: PartnerSettlementStatus,
  to: PartnerSettlementStatus,
): void {
  if (!SETTLEMENT_TRANSITIONS[from].includes(to)) {
    throw new BusinessNetworkError(
      409,
      "INVALID_PARTNER_SETTLEMENT_TRANSITION",
      `Partner settlement cannot move from ${from} to ${to}.`,
    );
  }
}

export function assertSettlementPeriod(periodStart: Date, periodEnd: Date, now = new Date()): void {
  if (periodEnd <= periodStart) {
    throw new BusinessNetworkError(
      422,
      "INVALID_SETTLEMENT_PERIOD",
      "Settlement period end must be later than its start.",
    );
  }
  if (periodEnd > now) {
    throw new BusinessNetworkError(
      422,
      "FUTURE_SETTLEMENT_PERIOD",
      "Settlement period cannot end in the future.",
    );
  }
}

export function formatPartnerSettlementNumber(value: bigint | number): string {
  const normalized = typeof value === "bigint" ? value : BigInt(value);
  if (normalized < 1n || normalized > 99_999_999n) {
    throw new BusinessNetworkError(
      503,
      "PARTNER_SETTLEMENT_SEQUENCE_EXHAUSTED",
      "Partner settlement sequence is invalid.",
    );
  }
  return `SET-${normalized.toString().padStart(8, "0")}`;
}

export function calculateSettlementTotals(
  entries: readonly { type: CommissionEntryType; amount: Prisma.Decimal.Value }[],
) {
  let grossCommission = new Prisma.Decimal(0);
  let adjustments = new Prisma.Decimal(0);
  for (const entry of entries) {
    const amount = new Prisma.Decimal(entry.amount);
    if (entry.type === CommissionEntryType.EARNING) grossCommission = grossCommission.plus(amount);
    else adjustments = adjustments.plus(amount);
  }
  const netPayable = grossCommission.plus(adjustments);
  return {
    grossCommission: grossCommission.toDecimalPlaces(2),
    adjustments: adjustments.toDecimalPlaces(2),
    netPayable: netPayable.toDecimalPlaces(2),
  };
}

export function normalizePayoutAccountNumber(value: string): string {
  return value.trim().replace(/[\s()-]/g, "").toUpperCase();
}

export function payoutAccountLast4(value: string): string {
  const normalized = normalizePayoutAccountNumber(value);
  return normalized.slice(-4);
}

function resolveEncryptionKey(secret?: string): Buffer {
  const configured = secret ?? process.env.PARTNER_PAYOUT_ENCRYPTION_KEY;
  if (!configured || configured.trim().length < 32) {
    throw new BusinessNetworkError(
      503,
      "PAYOUT_ENCRYPTION_NOT_CONFIGURED",
      "Partner payout encryption is not configured.",
    );
  }
  const trimmed = configured.trim();
  if (/^[a-f\d]{64}$/i.test(trimmed)) return Buffer.from(trimmed, "hex");
  if (/^[A-Za-z0-9+/]{43}=$/.test(trimmed)) {
    const decoded = Buffer.from(trimmed, "base64");
    if (decoded.length === 32) return decoded;
  }
  return createHash("sha256").update(trimmed, "utf8").digest();
}

export function encryptPayoutAccountNumber(value: string, secret?: string): string {
  const normalized = normalizePayoutAccountNumber(value);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", resolveEncryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PAYOUT_CIPHER_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptPayoutAccountNumber(value: string, secret?: string): string {
  const [version, ivValue, tagValue, ciphertextValue, ...extra] = value.split(":");
  if (
    version !== PAYOUT_CIPHER_VERSION
    || !ivValue
    || !tagValue
    || !ciphertextValue
    || extra.length > 0
  ) {
    throw new BusinessNetworkError(422, "INVALID_PAYOUT_CIPHERTEXT", "Payout account data is malformed.");
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      resolveEncryptionKey(secret),
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new BusinessNetworkError(
      422,
      "PAYOUT_DECRYPTION_FAILED",
      "Payout account data could not be decrypted.",
    );
  }
}
