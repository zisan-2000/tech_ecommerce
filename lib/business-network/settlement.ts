import "server-only";

import {
  CommissionEntryType,
  CommissionStatus,
  PartnerPayoutAccountStatus,
  PartnerPayoutAccountType,
  PartnerSettlementStatus,
  PartnerStatus,
  Prisma,
} from "@/generated/prisma";
import { db } from "@/lib/db";
import type { ActiveBusinessContext } from "./types";
import { BUSINESS_AUDIT_ACTIONS, writeBusinessAudit } from "./audit";
import { BusinessNetworkError } from "./business-error";
import {
  assertPartnerSettlementTransition,
  assertSettlementPeriod,
  calculateSettlementTotals,
  decryptPayoutAccountNumber,
  encryptPayoutAccountNumber,
  formatPartnerSettlementNumber,
  payoutAccountLast4,
} from "./settlement-core";
import type {
  CreatePayoutAccountInput,
  CreateSettlementInput,
  PayoutAccountListInput,
  ProcessSettlementInput,
  SettlementListInput,
  UpdatePayoutAccountInput,
} from "./settlement-schemas";
import { runSerializableTransaction } from "./transaction";

type DatabaseClient = Prisma.TransactionClient | typeof db;

const payoutAccountPublicSelect = {
  id: true,
  partnerProfileId: true,
  type: true,
  status: true,
  accountName: true,
  bankName: true,
  branchName: true,
  routingNumber: true,
  providerName: true,
  accountNumberLast4: true,
  isDefault: true,
  verifiedAt: true,
  verifiedById: true,
  rejectionReason: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PartnerPayoutAccountSelect;

const settlementDetailInclude = {
  partnerProfile: {
    select: {
      id: true,
      partnerCode: true,
      status: true,
      organization: { select: { id: true, legalName: true, displayName: true } },
    },
  },
  payoutAccount: { select: payoutAccountPublicSelect },
  approvedBy: { select: { id: true, name: true, email: true } },
  lines: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
    include: {
      commissionEntry: {
        select: {
          id: true,
          type: true,
          status: true,
          orderId: true,
          orderItemId: true,
          partnerLeadId: true,
          agreementVersionId: true,
          amount: true,
          currency: true,
          approvedAt: true,
          payableAt: true,
          paidAt: true,
          createdAt: true,
        },
      },
    },
  },
} satisfies Prisma.PartnerSettlementInclude;

type SettlementDetail = Prisma.PartnerSettlementGetPayload<{
  include: typeof settlementDetailInclude;
}>;

function serializeSettlement(settlement: SettlementDetail) {
  return {
    ...settlement,
    grossCommission: settlement.grossCommission.toFixed(2),
    adjustments: settlement.adjustments.toFixed(2),
    netPayable: settlement.netPayable.toFixed(2),
    lines: settlement.lines.map((line) => ({
      ...line,
      amount: line.amount.toFixed(2),
      commissionEntry: {
        ...line.commissionEntry,
        amount: line.commissionEntry.amount.toFixed(2),
      },
    })),
  };
}

async function findSettlement(client: DatabaseClient, id: string): Promise<SettlementDetail> {
  const settlement = await client.partnerSettlement.findUnique({
    where: { id },
    include: settlementDetailInclude,
  });
  if (!settlement) {
    throw new BusinessNetworkError(404, "PARTNER_SETTLEMENT_NOT_FOUND", "Partner settlement not found.");
  }
  return settlement;
}

async function portalPartnerProfile(context: ActiveBusinessContext) {
  const profile = await db.partnerProfile.findUnique({
    where: { organizationId: context.activeMembership.organization.id },
    select: { id: true, organizationId: true, status: true },
  });
  if (!profile) {
    throw new BusinessNetworkError(404, "PARTNER_PROFILE_NOT_FOUND", "Partner profile not found.");
  }
  return profile;
}

async function assertActivePartner(client: DatabaseClient, partnerProfileId: string) {
  const profile = await client.partnerProfile.findUnique({
    where: { id: partnerProfileId },
    select: { id: true, organizationId: true, status: true },
  });
  if (!profile) {
    throw new BusinessNetworkError(404, "PARTNER_PROFILE_NOT_FOUND", "Partner profile not found.");
  }
  if (profile.status !== PartnerStatus.ACTIVE) {
    throw new BusinessNetworkError(409, "PARTNER_NOT_ACTIVE", "Only an active partner can receive settlements.");
  }
  return profile;
}

function validateAccountNumber(type: PartnerPayoutAccountType, accountNumber: string): void {
  if (type === PartnerPayoutAccountType.MOBILE_WALLET && !/^\+?\d{10,15}$/.test(accountNumber)) {
    throw new BusinessNetworkError(422, "INVALID_MOBILE_WALLET_NUMBER", "Mobile wallet number is invalid.");
  }
  if (type === PartnerPayoutAccountType.BANK && !/^[A-Z0-9]{6,34}$/.test(accountNumber)) {
    throw new BusinessNetworkError(422, "INVALID_BANK_ACCOUNT_NUMBER", "Bank account number is invalid.");
  }
}

export async function listPortalPayoutAccounts(
  context: ActiveBusinessContext,
  input: PayoutAccountListInput,
) {
  const profile = await portalPartnerProfile(context);
  return listPayoutAccounts(input, profile.id);
}

export async function listAdminPayoutAccounts(input: PayoutAccountListInput) {
  return listPayoutAccounts(input);
}

async function listPayoutAccounts(input: PayoutAccountListInput, scopedPartnerProfileId?: string) {
  const where: Prisma.PartnerPayoutAccountWhereInput = {
    partnerProfileId: scopedPartnerProfileId ?? input.partnerProfileId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.type ? { type: input.type } : {}),
  };
  const [items, total] = await Promise.all([
    db.partnerPayoutAccount.findMany({
      where,
      select: payoutAccountPublicSelect,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    }),
    db.partnerPayoutAccount.count({ where }),
  ]);
  return {
    items,
    pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) },
  };
}

export async function createPortalPayoutAccount(input: {
  context: ActiveBusinessContext;
  data: CreatePayoutAccountInput;
  request: Request;
}) {
  const profile = await portalPartnerProfile(input.context);
  if (profile.status !== PartnerStatus.ACTIVE) {
    throw new BusinessNetworkError(409, "PARTNER_NOT_ACTIVE", "Only an active partner can configure payout accounts.");
  }
  if (input.data.isDefault) {
    throw new BusinessNetworkError(409, "PAYOUT_ACCOUNT_NOT_VERIFIED", "A payout account can become default only after verification.");
  }
  validateAccountNumber(input.data.type, input.data.accountNumber);
  return runSerializableTransaction(async (tx) => {
    const account = await tx.partnerPayoutAccount.create({
      data: {
        partnerProfileId: profile.id,
        type: input.data.type,
        accountName: input.data.accountName,
        bankName: input.data.type === PartnerPayoutAccountType.BANK ? input.data.bankName : null,
        branchName: input.data.type === PartnerPayoutAccountType.BANK ? input.data.branchName : null,
        routingNumber: input.data.type === PartnerPayoutAccountType.BANK ? input.data.routingNumber : null,
        providerName: input.data.type === PartnerPayoutAccountType.MOBILE_WALLET ? input.data.providerName : null,
        accountNumberEncrypted: encryptPayoutAccountNumber(input.data.accountNumber),
        accountNumberLast4: payoutAccountLast4(input.data.accountNumber),
      },
      select: payoutAccountPublicSelect,
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: profile.organizationId,
      memberId: input.context.activeMembership.memberId,
      actorUserId: input.context.user.id,
      action: BUSINESS_AUDIT_ACTIONS.partnerPayoutAccountCreated,
      entityType: "PartnerPayoutAccount",
      entityId: account.id,
      after: account,
    });
    return account;
  });
}

export async function updatePortalPayoutAccount(input: {
  context: ActiveBusinessContext;
  id: string;
  data: UpdatePayoutAccountInput;
  request: Request;
}) {
  const profile = await portalPartnerProfile(input.context);
  return runSerializableTransaction(async (tx) => {
    const before = await tx.partnerPayoutAccount.findFirst({
      where: { id: input.id, partnerProfileId: profile.id },
    });
    if (!before) throw new BusinessNetworkError(404, "PAYOUT_ACCOUNT_NOT_FOUND", "Payout account not found.");
    if (before.status === PartnerPayoutAccountStatus.DISABLED) {
      throw new BusinessNetworkError(409, "PAYOUT_ACCOUNT_DISABLED", "A disabled payout account cannot be changed.");
    }
    if (input.data.accountNumber) validateAccountNumber(before.type, input.data.accountNumber);
    const nextBankName = input.data.bankName === undefined ? before.bankName : input.data.bankName;
    const nextProviderName = input.data.providerName === undefined ? before.providerName : input.data.providerName;
    if (before.type === PartnerPayoutAccountType.BANK && !nextBankName) {
      throw new BusinessNetworkError(422, "BANK_NAME_REQUIRED", "Bank name is required for a bank payout account.");
    }
    if (before.type === PartnerPayoutAccountType.MOBILE_WALLET && !nextProviderName) {
      throw new BusinessNetworkError(422, "WALLET_PROVIDER_REQUIRED", "Provider name is required for a mobile-wallet payout account.");
    }
    const sensitiveChange = input.data.accountName !== undefined
      || input.data.bankName !== undefined
      || input.data.branchName !== undefined
      || input.data.routingNumber !== undefined
      || input.data.providerName !== undefined
      || input.data.accountNumber !== undefined;
    if (input.data.isDefault && (sensitiveChange || before.status !== PartnerPayoutAccountStatus.VERIFIED)) {
      throw new BusinessNetworkError(409, "PAYOUT_ACCOUNT_NOT_VERIFIED", "Only an unchanged verified payout account can become default.");
    }
    if (input.data.isDefault) {
      await tx.partnerPayoutAccount.updateMany({
        where: { partnerProfileId: profile.id, isDefault: true, id: { not: before.id } },
        data: { isDefault: false },
      });
    }
    const updated = await tx.partnerPayoutAccount.update({
      where: { id: before.id },
      data: {
        ...(input.data.accountName !== undefined ? { accountName: input.data.accountName } : {}),
        ...(input.data.bankName !== undefined ? { bankName: before.type === PartnerPayoutAccountType.BANK ? input.data.bankName : null } : {}),
        ...(input.data.branchName !== undefined ? { branchName: before.type === PartnerPayoutAccountType.BANK ? input.data.branchName : null } : {}),
        ...(input.data.routingNumber !== undefined ? { routingNumber: before.type === PartnerPayoutAccountType.BANK ? input.data.routingNumber : null } : {}),
        ...(input.data.providerName !== undefined ? { providerName: before.type === PartnerPayoutAccountType.MOBILE_WALLET ? input.data.providerName : null } : {}),
        ...(input.data.accountNumber !== undefined ? {
          accountNumberEncrypted: encryptPayoutAccountNumber(input.data.accountNumber),
          accountNumberLast4: payoutAccountLast4(input.data.accountNumber),
        } : {}),
        ...(input.data.isDefault !== undefined ? { isDefault: input.data.isDefault } : {}),
        ...(sensitiveChange ? {
          status: PartnerPayoutAccountStatus.PENDING_VERIFICATION,
          isDefault: false,
          verifiedAt: null,
          verifiedById: null,
          rejectionReason: null,
        } : {}),
      },
      select: payoutAccountPublicSelect,
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: profile.organizationId,
      memberId: input.context.activeMembership.memberId,
      actorUserId: input.context.user.id,
      action: BUSINESS_AUDIT_ACTIONS.partnerPayoutAccountUpdated,
      entityType: "PartnerPayoutAccount",
      entityId: before.id,
      before,
      after: updated,
    });
    return updated;
  });
}

export async function disablePortalPayoutAccount(input: {
  context: ActiveBusinessContext;
  id: string;
  request: Request;
}) {
  const profile = await portalPartnerProfile(input.context);
  return runSerializableTransaction(async (tx) => {
    const before = await tx.partnerPayoutAccount.findFirst({
      where: { id: input.id, partnerProfileId: profile.id },
      select: payoutAccountPublicSelect,
    });
    if (!before) throw new BusinessNetworkError(404, "PAYOUT_ACCOUNT_NOT_FOUND", "Payout account not found.");
    if (before.status === PartnerPayoutAccountStatus.DISABLED) return before;
    const activeSettlement = await tx.partnerSettlement.findFirst({
      where: {
        payoutAccountId: before.id,
        status: { in: [PartnerSettlementStatus.SUBMITTED, PartnerSettlementStatus.APPROVED, PartnerSettlementStatus.PROCESSING] },
      },
      select: { id: true },
    });
    if (activeSettlement) {
      throw new BusinessNetworkError(409, "PAYOUT_ACCOUNT_IN_USE", "This payout account is used by an active settlement.");
    }
    const updated = await tx.partnerPayoutAccount.update({
      where: { id: before.id },
      data: { status: PartnerPayoutAccountStatus.DISABLED, isDefault: false },
      select: payoutAccountPublicSelect,
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: profile.organizationId,
      memberId: input.context.activeMembership.memberId,
      actorUserId: input.context.user.id,
      action: BUSINESS_AUDIT_ACTIONS.partnerPayoutAccountDisabled,
      entityType: "PartnerPayoutAccount",
      entityId: before.id,
      before,
      after: updated,
    });
    return updated;
  });
}

export async function verifyPayoutAccount(input: { id: string; actorUserId: string; request: Request }) {
  return reviewPayoutAccount({ ...input, action: "verify" });
}

export async function rejectPayoutAccount(input: { id: string; reason: string; actorUserId: string; request: Request }) {
  return reviewPayoutAccount({ ...input, action: "reject" });
}

async function reviewPayoutAccount(input: {
  id: string;
  actorUserId: string;
  request: Request;
  action: "verify" | "reject";
  reason?: string;
}) {
  return runSerializableTransaction(async (tx) => {
    const before = await tx.partnerPayoutAccount.findUnique({
      where: { id: input.id },
      include: { partnerProfile: { select: { organizationId: true } } },
    });
    if (!before) throw new BusinessNetworkError(404, "PAYOUT_ACCOUNT_NOT_FOUND", "Payout account not found.");
    if (before.status === PartnerPayoutAccountStatus.DISABLED) {
      throw new BusinessNetworkError(409, "PAYOUT_ACCOUNT_DISABLED", "A disabled payout account cannot be reviewed.");
    }
    if (input.action === "verify" && before.status === PartnerPayoutAccountStatus.VERIFIED) {
      return tx.partnerPayoutAccount.findUniqueOrThrow({ where: { id: before.id }, select: payoutAccountPublicSelect });
    }
    if (input.action === "verify") decryptPayoutAccountNumber(before.accountNumberEncrypted);
    const makeDefault = input.action === "verify" && !(await tx.partnerPayoutAccount.findFirst({
      where: { partnerProfileId: before.partnerProfileId, status: PartnerPayoutAccountStatus.VERIFIED, isDefault: true },
      select: { id: true },
    }));
    const updated = await tx.partnerPayoutAccount.update({
      where: { id: before.id },
      data: input.action === "verify" ? {
        status: PartnerPayoutAccountStatus.VERIFIED,
        verifiedAt: new Date(),
        verifiedById: input.actorUserId,
        rejectionReason: null,
        isDefault: makeDefault || before.isDefault,
      } : {
        status: PartnerPayoutAccountStatus.REJECTED,
        verifiedAt: null,
        verifiedById: null,
        rejectionReason: input.reason,
        isDefault: false,
      },
      select: payoutAccountPublicSelect,
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: before.partnerProfile.organizationId,
      actorUserId: input.actorUserId,
      action: input.action === "verify"
        ? BUSINESS_AUDIT_ACTIONS.partnerPayoutAccountVerified
        : BUSINESS_AUDIT_ACTIONS.partnerPayoutAccountRejected,
      entityType: "PartnerPayoutAccount",
      entityId: before.id,
      before,
      after: updated,
    });
    return updated;
  });
}

function settlementWhere(input: SettlementListInput, partnerProfileId?: string): Prisma.PartnerSettlementWhereInput {
  return {
    partnerProfileId: partnerProfileId ?? input.partnerProfileId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.currency ? { currency: input.currency } : {}),
    ...(input.periodFrom || input.periodTo ? {
      periodEnd: {
        ...(input.periodFrom ? { gte: input.periodFrom } : {}),
        ...(input.periodTo ? { lte: input.periodTo } : {}),
      },
    } : {}),
    ...(input.search ? { settlementNumber: { contains: input.search, mode: "insensitive" } } : {}),
  };
}

async function listSettlements(input: SettlementListInput, partnerProfileId?: string) {
  const where = settlementWhere(input, partnerProfileId);
  const [items, total, totals] = await Promise.all([
    db.partnerSettlement.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: settlementDetailInclude,
    }),
    db.partnerSettlement.count({ where }),
    db.partnerSettlement.groupBy({ by: ["status", "currency"], where, _sum: { netPayable: true } }),
  ]);
  return {
    items: items.map(serializeSettlement),
    totals: totals.map((item) => ({
      status: item.status,
      currency: item.currency,
      netPayable: item._sum.netPayable?.toFixed(2) ?? "0.00",
    })),
    pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) },
  };
}

export const listAdminSettlements = (input: SettlementListInput) => listSettlements(input);

export async function listPortalSettlements(context: ActiveBusinessContext, input: SettlementListInput) {
  const profile = await portalPartnerProfile(context);
  return listSettlements(input, profile.id);
}

export async function getAdminSettlement(id: string) {
  return serializeSettlement(await findSettlement(db, id));
}

export async function getPortalSettlement(context: ActiveBusinessContext, id: string) {
  const profile = await portalPartnerProfile(context);
  const settlement = await findSettlement(db, id);
  if (settlement.partnerProfileId !== profile.id) {
    throw new BusinessNetworkError(404, "PARTNER_SETTLEMENT_NOT_FOUND", "Partner settlement not found.");
  }
  return serializeSettlement(settlement);
}

async function nextSettlementNumber(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('"PartnerSettlementNumber_seq"') AS value`;
  const value = rows[0]?.value;
  if (value === undefined) {
    throw new BusinessNetworkError(503, "PARTNER_SETTLEMENT_SEQUENCE_UNAVAILABLE", "Partner settlement sequence is unavailable.");
  }
  return formatPartnerSettlementNumber(value);
}

export async function createPartnerSettlement(input: {
  data: CreateSettlementInput;
  actorUserId: string;
  request: Request;
}) {
  assertSettlementPeriod(input.data.periodStart, input.data.periodEnd);
  return runSerializableTransaction(async (tx) => {
    const profile = await assertActivePartner(tx, input.data.partnerProfileId);
    const payoutAccount = input.data.payoutAccountId
      ? await tx.partnerPayoutAccount.findFirst({
        where: {
          id: input.data.payoutAccountId,
          partnerProfileId: profile.id,
          status: PartnerPayoutAccountStatus.VERIFIED,
        },
        select: { id: true },
      })
      : await tx.partnerPayoutAccount.findFirst({
        where: {
          partnerProfileId: profile.id,
          status: PartnerPayoutAccountStatus.VERIFIED,
          isDefault: true,
        },
        select: { id: true },
      });
    if (input.data.payoutAccountId && !payoutAccount) {
      throw new BusinessNetworkError(409, "PAYOUT_ACCOUNT_NOT_VERIFIED", "Selected payout account is not verified for this partner.");
    }
    const entries = await tx.commissionEntry.findMany({
      where: {
        partnerProfileId: profile.id,
        status: CommissionStatus.APPROVED,
        currency: input.data.currency,
        createdAt: { gte: input.data.periodStart, lte: input.data.periodEnd },
        settlementLine: null,
        ...(input.data.commissionEntryIds ? { id: { in: input.data.commissionEntryIds } } : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, type: true, amount: true },
    });
    if (input.data.commissionEntryIds && entries.length !== input.data.commissionEntryIds.length) {
      throw new BusinessNetworkError(409, "COMMISSION_ENTRY_NOT_SETTLEABLE", "One or more selected commission entries are unavailable or ineligible.");
    }
    if (!entries.length) {
      throw new BusinessNetworkError(409, "NO_SETTLEABLE_COMMISSION", "No approved commission entries are available for this settlement period.");
    }
    const totals = calculateSettlementTotals(entries);
    if (totals.netPayable.lte(0)) {
      throw new BusinessNetworkError(409, "NON_POSITIVE_SETTLEMENT", "Settlement net payable must be greater than zero.");
    }
    const settlement = await tx.partnerSettlement.create({
      data: {
        settlementNumber: await nextSettlementNumber(tx),
        partnerProfileId: profile.id,
        periodStart: input.data.periodStart,
        periodEnd: input.data.periodEnd,
        grossCommission: totals.grossCommission,
        adjustments: totals.adjustments,
        netPayable: totals.netPayable,
        currency: input.data.currency,
        payoutAccountId: payoutAccount?.id ?? null,
        lines: {
          create: entries.map((entry) => ({ commissionEntryId: entry.id, amount: entry.amount })),
        },
      },
      include: settlementDetailInclude,
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: profile.organizationId,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.partnerSettlementCreated,
      entityType: "PartnerSettlement",
      entityId: settlement.id,
      after: settlement,
    });
    return serializeSettlement(settlement);
  });
}

async function settlementMinimum(client: DatabaseClient, settlement: SettlementDetail): Promise<Prisma.Decimal> {
  const versionIds = [...new Set(settlement.lines
    .map((line) => line.commissionEntry.agreementVersionId)
    .filter((value): value is string => Boolean(value)))];
  if (!versionIds.length) return new Prisma.Decimal(0);
  const versions = await client.partnerAgreementVersion.findMany({
    where: { id: { in: versionIds } },
    select: { id: true, minimumSettlement: true, currency: true },
  });
  if (versions.length !== versionIds.length || versions.some((version) => version.currency !== settlement.currency)) {
    throw new BusinessNetworkError(409, "SETTLEMENT_AGREEMENT_MISMATCH", "Settlement entries do not share a valid agreement currency.");
  }
  return versions.reduce(
    (maximum, version) => Prisma.Decimal.max(maximum, version.minimumSettlement),
    new Prisma.Decimal(0),
  );
}

async function assertVerifiedSettlementAccount(
  tx: Prisma.TransactionClient,
  settlement: SettlementDetail,
) {
  const account = settlement.payoutAccountId
    ? await tx.partnerPayoutAccount.findFirst({
      where: {
        id: settlement.payoutAccountId,
        partnerProfileId: settlement.partnerProfileId,
        status: PartnerPayoutAccountStatus.VERIFIED,
      },
      select: { id: true, accountNumberEncrypted: true },
    })
    : await tx.partnerPayoutAccount.findFirst({
      where: {
        partnerProfileId: settlement.partnerProfileId,
        status: PartnerPayoutAccountStatus.VERIFIED,
        isDefault: true,
      },
      select: { id: true, accountNumberEncrypted: true },
    });
  if (!account) {
    throw new BusinessNetworkError(409, "VERIFIED_PAYOUT_ACCOUNT_REQUIRED", "A verified payout account is required.");
  }
  decryptPayoutAccountNumber(account.accountNumberEncrypted);
  return account;
}

export async function submitPartnerSettlement(input: { id: string; actorUserId: string; request: Request }) {
  return runSerializableTransaction(async (tx) => {
    const before = await findSettlement(tx, input.id);
    if (before.status === PartnerSettlementStatus.SUBMITTED) return serializeSettlement(before);
    assertPartnerSettlementTransition(before.status, PartnerSettlementStatus.SUBMITTED);
    await assertActivePartner(tx, before.partnerProfileId);
    const payoutAccount = await assertVerifiedSettlementAccount(tx, before);
    if (!before.lines.length || before.lines.some((line) =>
      line.commissionEntry.status !== CommissionStatus.APPROVED
      || !line.commissionEntry.amount.equals(line.amount)
      || line.commissionEntry.currency !== before.currency)) {
      throw new BusinessNetworkError(409, "SETTLEMENT_LINES_STALE", "Settlement commission lines are no longer eligible.");
    }
    const minimum = await settlementMinimum(tx, before);
    if (before.netPayable.lt(minimum)) {
      throw new BusinessNetworkError(
        409,
        "MINIMUM_SETTLEMENT_NOT_REACHED",
        `Net payable must reach ${minimum.toFixed(2)} ${before.currency} before submission.`,
      );
    }
    const now = new Date();
    await tx.partnerSettlement.update({
      where: { id: before.id },
      data: {
        status: PartnerSettlementStatus.SUBMITTED,
        submittedAt: now,
        payoutAccountId: payoutAccount.id,
      },
    });
    const moved = await tx.commissionEntry.updateMany({
      where: { id: { in: before.lines.map((line) => line.commissionEntryId) }, status: CommissionStatus.APPROVED },
      data: { status: CommissionStatus.PAYABLE, payableAt: now },
    });
    if (moved.count !== before.lines.length) {
      throw new BusinessNetworkError(409, "SETTLEMENT_LINES_STALE", "Settlement commission lines changed during submission.");
    }
    const updated = await findSettlement(tx, before.id);
    await writeSettlementAudit(tx, input.request, input.actorUserId, before, updated, BUSINESS_AUDIT_ACTIONS.partnerSettlementSubmitted);
    return serializeSettlement(updated);
  });
}

export async function approvePartnerSettlement(input: { id: string; actorUserId: string; request: Request }) {
  return runSerializableTransaction(async (tx) => {
    const before = await findSettlement(tx, input.id);
    if (before.status === PartnerSettlementStatus.APPROVED) return serializeSettlement(before);
    assertPartnerSettlementTransition(before.status, PartnerSettlementStatus.APPROVED);
    const updated = await tx.partnerSettlement.update({
      where: { id: before.id },
      data: { status: PartnerSettlementStatus.APPROVED, approvedAt: new Date(), approvedById: input.actorUserId },
      include: settlementDetailInclude,
    });
    await writeSettlementAudit(tx, input.request, input.actorUserId, before, updated, BUSINESS_AUDIT_ACTIONS.partnerSettlementApproved);
    return serializeSettlement(updated);
  });
}

export async function processPartnerSettlement(input: {
  id: string;
  data: ProcessSettlementInput;
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const before = await findSettlement(tx, input.id);
    if (input.data.outcome === "FAILED") {
      assertPartnerSettlementTransition(before.status, PartnerSettlementStatus.FAILED);
      const updated = await tx.partnerSettlement.update({
        where: { id: before.id },
        data: {
          status: PartnerSettlementStatus.FAILED,
          failedAt: new Date(),
          failureReason: input.data.failureReason,
        },
        include: settlementDetailInclude,
      });
      await writeSettlementAudit(tx, input.request, input.actorUserId, before, updated, BUSINESS_AUDIT_ACTIONS.partnerSettlementFailed);
      return serializeSettlement(updated);
    }
    if (before.status === PartnerSettlementStatus.PROCESSING) return serializeSettlement(before);
    assertPartnerSettlementTransition(before.status, PartnerSettlementStatus.PROCESSING);
    await assertActivePartner(tx, before.partnerProfileId);
    await assertVerifiedSettlementAccount(tx, before);
    const updated = await tx.partnerSettlement.update({
      where: { id: before.id },
      data: {
        status: PartnerSettlementStatus.PROCESSING,
        processingAt: new Date(),
        failedAt: null,
        failureReason: null,
      },
      include: settlementDetailInclude,
    });
    await writeSettlementAudit(tx, input.request, input.actorUserId, before, updated, BUSINESS_AUDIT_ACTIONS.partnerSettlementProcessing);
    return serializeSettlement(updated);
  });
}

export async function markPartnerSettlementPaid(input: {
  id: string;
  paymentReference: string;
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const before = await findSettlement(tx, input.id);
    if (before.status === PartnerSettlementStatus.PAID) {
      if (before.paymentReference !== input.paymentReference) {
        throw new BusinessNetworkError(409, "PAYMENT_REFERENCE_CONFLICT", "Settlement is already paid with a different reference.");
      }
      return serializeSettlement(before);
    }
    assertPartnerSettlementTransition(before.status, PartnerSettlementStatus.PAID);
    await assertVerifiedSettlementAccount(tx, before);
    if (before.lines.some((line) =>
      line.commissionEntry.status !== CommissionStatus.PAYABLE
      && line.commissionEntry.status !== CommissionStatus.REVERSED)) {
      throw new BusinessNetworkError(409, "SETTLEMENT_LINES_STALE", "Settlement contains a commission entry that cannot be paid.");
    }
    const now = new Date();
    await tx.partnerSettlement.update({
      where: { id: before.id },
      data: {
        status: PartnerSettlementStatus.PAID,
        paidAt: now,
        paymentReference: input.paymentReference,
      },
    });
    await tx.commissionEntry.updateMany({
      where: { id: { in: before.lines.map((line) => line.commissionEntryId) }, status: CommissionStatus.PAYABLE },
      data: { status: CommissionStatus.PAID, paidAt: now },
    });
    const updated = await findSettlement(tx, before.id);
    await writeSettlementAudit(tx, input.request, input.actorUserId, before, updated, BUSINESS_AUDIT_ACTIONS.partnerSettlementPaid);
    return serializeSettlement(updated);
  });
}

async function cancelSettlementInTransaction(input: {
  tx: Prisma.TransactionClient;
  settlement: SettlementDetail;
  reason: string;
  actorUserId: string | null;
  request?: Request | null;
}) {
  const before = input.settlement;
  if (before.status === PartnerSettlementStatus.CANCELLED) return before;
  assertPartnerSettlementTransition(before.status, PartnerSettlementStatus.CANCELLED);
  await input.tx.partnerSettlement.update({
    where: { id: before.id },
    data: {
      status: PartnerSettlementStatus.CANCELLED,
      cancelledAt: new Date(),
      cancellationReason: input.reason,
    },
  });
  await input.tx.commissionEntry.updateMany({
    where: { id: { in: before.lines.map((line) => line.commissionEntryId) }, status: CommissionStatus.PAYABLE },
    data: { status: CommissionStatus.APPROVED, payableAt: null },
  });
  const reversedSourceIds = before.lines
    .filter((line) => line.commissionEntry.status === CommissionStatus.REVERSED)
    .map((line) => line.commissionEntryId);
  if (reversedSourceIds.length) {
    const unpaidReversals = await input.tx.commissionEntry.findMany({
      where: {
        sourceEntryId: { in: reversedSourceIds },
        type: CommissionEntryType.REVERSAL,
        status: CommissionStatus.APPROVED,
      },
      select: {
        id: true,
        partnerProfileId: true,
        agreementVersionId: true,
        commissionRuleId: true,
        orderId: true,
        orderItemId: true,
        partnerLeadId: true,
        amount: true,
        currency: true,
      },
    });
    for (const reversal of unpaidReversals) {
      const compensation = await input.tx.commissionEntry.create({
        data: {
          partnerProfileId: reversal.partnerProfileId,
          agreementVersionId: reversal.agreementVersionId,
          commissionRuleId: reversal.commissionRuleId,
          type: CommissionEntryType.ADJUSTMENT,
          status: CommissionStatus.APPROVED,
          orderId: reversal.orderId,
          orderItemId: reversal.orderItemId,
          partnerLeadId: reversal.partnerLeadId,
          grossBasisAmount: 0,
          netBasisAmount: 0,
          amount: reversal.amount.negated(),
          currency: reversal.currency,
          sourceEntryId: reversal.id,
          approvedAt: new Date(),
          reason: `Compensation for unpaid reversal released from cancelled settlement ${before.settlementNumber}.`,
          createdById: input.actorUserId,
        },
      });
      await writeBusinessAudit({
        tx: input.tx,
        request: input.request,
        organizationId: before.partnerProfile.organization.id,
        actorUserId: input.actorUserId,
        action: BUSINESS_AUDIT_ACTIONS.commissionAdjusted,
        entityType: "CommissionEntry",
        entityId: compensation.id,
        after: compensation,
      });
    }
  }
  const updated = await findSettlement(input.tx, before.id);
  await writeSettlementAudit(
    input.tx,
    input.request,
    input.actorUserId,
    before,
    updated,
    BUSINESS_AUDIT_ACTIONS.partnerSettlementCancelled,
  );
  return updated;
}

export async function cancelPartnerSettlement(input: {
  id: string;
  reason: string;
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => serializeSettlement(await cancelSettlementInTransaction({
    tx,
    settlement: await findSettlement(tx, input.id),
    reason: input.reason,
    actorUserId: input.actorUserId,
    request: input.request,
  })));
}

export async function cancelOpenSettlementForCommissionEntry(input: {
  tx: Prisma.TransactionClient;
  commissionEntryId: string;
  reason: string;
  actorUserId: string | null;
  request?: Request | null;
}) {
  const line = await input.tx.partnerSettlementLine.findUnique({
    where: { commissionEntryId: input.commissionEntryId },
    include: { settlement: { include: settlementDetailInclude } },
  });
  if (!line
    || line.settlement.status === PartnerSettlementStatus.PROCESSING
    || line.settlement.status === PartnerSettlementStatus.PAID
    || line.settlement.status === PartnerSettlementStatus.CANCELLED) {
    return null;
  }
  return cancelSettlementInTransaction({
    tx: input.tx,
    settlement: line.settlement,
    reason: input.reason,
    actorUserId: input.actorUserId,
    request: input.request,
  });
}

async function writeSettlementAudit(
  tx: Prisma.TransactionClient,
  request: Request | null | undefined,
  actorUserId: string | null,
  before: SettlementDetail,
  after: SettlementDetail,
  action:
    | typeof BUSINESS_AUDIT_ACTIONS.partnerSettlementSubmitted
    | typeof BUSINESS_AUDIT_ACTIONS.partnerSettlementApproved
    | typeof BUSINESS_AUDIT_ACTIONS.partnerSettlementProcessing
    | typeof BUSINESS_AUDIT_ACTIONS.partnerSettlementFailed
    | typeof BUSINESS_AUDIT_ACTIONS.partnerSettlementPaid
    | typeof BUSINESS_AUDIT_ACTIONS.partnerSettlementCancelled,
) {
  await writeBusinessAudit({
    tx,
    request,
    organizationId: before.partnerProfile.organization.id,
    actorUserId,
    action,
    entityType: "PartnerSettlement",
    entityId: before.id,
    before,
    after,
  });
}
