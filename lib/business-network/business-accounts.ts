import "server-only";

import type { BusinessAccountStatus, Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { BUSINESS_AUDIT_ACTIONS, writeBusinessAudit } from "./audit";
import { BusinessNetworkError } from "./business-error";
import { runSerializableTransaction } from "./transaction";

type CreateAccountInput = {
  organizationId: string;
  accountNumber: string;
  status: BusinessAccountStatus;
  pricingTierId?: string | null;
  accountManagerId?: string | null;
  paymentTermDays: number;
  allowCredit: boolean;
  allowCoupons: boolean;
  requirePo: boolean;
  notes?: string | null;
};

type UpdateAccountInput = Partial<Omit<CreateAccountInput, "organizationId" | "accountNumber">>;

const ACCOUNT_STATUS_TRANSITIONS: Record<BusinessAccountStatus, readonly BusinessAccountStatus[]> = {
  PENDING: ["ACTIVE", "SUSPENDED", "CLOSED"],
  ACTIVE: ["SUSPENDED", "CLOSED"],
  SUSPENDED: ["ACTIVE", "CLOSED"],
  CLOSED: [],
};

async function assertAccountDependencies(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    status: BusinessAccountStatus;
    pricingTierId?: string | null;
    accountManagerId?: string | null;
  },
) {
  const organization = await tx.organization.findUnique({
    where: { id: input.organizationId },
    select: {
      id: true,
      status: true,
      capabilities: {
        where: { type: "CORPORATE_BUYER" },
        select: { status: true },
        take: 1,
      },
    },
  });
  if (!organization) {
    throw new BusinessNetworkError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  }
  const capabilityStatus = organization.capabilities[0]?.status;
  if (!capabilityStatus || capabilityStatus === "REVOKED") {
    throw new BusinessNetworkError(
      422,
      "CORPORATE_CAPABILITY_REQUIRED",
      "The organization must have a non-revoked CORPORATE_BUYER capability.",
    );
  }
  if (
    input.status === "ACTIVE" &&
    (organization.status !== "ACTIVE" || capabilityStatus !== "ACTIVE")
  ) {
    throw new BusinessNetworkError(
      422,
      "BUSINESS_ACCOUNT_ACTIVATION_BLOCKED",
      "An active organization and active CORPORATE_BUYER capability are required.",
    );
  }
  if (input.pricingTierId) {
    const tier = await tx.businessPricingTier.findUnique({
      where: { id: input.pricingTierId },
      select: { id: true },
    });
    if (!tier) {
      throw new BusinessNetworkError(404, "PRICING_TIER_NOT_FOUND", "Pricing tier not found.");
    }
  }
  if (input.accountManagerId) {
    const manager = await tx.user.findUnique({
      where: { id: input.accountManagerId },
      select: { id: true },
    });
    if (!manager) {
      throw new BusinessNetworkError(404, "ACCOUNT_MANAGER_NOT_FOUND", "Account manager not found.");
    }
  }
}

function assertStatusTransition(current: BusinessAccountStatus, next: BusinessAccountStatus) {
  if (current === next) return;
  if (!ACCOUNT_STATUS_TRANSITIONS[current].includes(next)) {
    throw new BusinessNetworkError(
      422,
      "INVALID_BUSINESS_ACCOUNT_STATUS_TRANSITION",
      `Business account cannot transition from ${current} to ${next}.`,
    );
  }
}

export async function listBusinessAccounts(input: {
  page: number;
  limit: number;
  search: string;
  status?: BusinessAccountStatus | null;
}) {
  const where: Prisma.BusinessAccountWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.search
      ? {
          OR: [
            { accountNumber: { contains: input.search, mode: "insensitive" } },
            { organization: { legalName: { contains: input.search, mode: "insensitive" } } },
            { organization: { displayName: { contains: input.search, mode: "insensitive" } } },
            { organization: { code: { contains: input.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.businessAccount.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        organization: { select: { id: true, code: true, legalName: true, displayName: true, status: true, currency: true } },
        pricingTier: { select: { id: true, code: true, name: true, isActive: true } },
        _count: { select: { contractPrices: true } },
      },
    }),
    db.businessAccount.count({ where }),
  ]);
  return { items, pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) } };
}

export async function getBusinessAccount(id: string) {
  const account = await db.businessAccount.findUnique({
    where: { id },
    include: {
      organization: {
        include: {
          capabilities: { orderBy: { type: "asc" }, select: { type: true, status: true } },
        },
      },
      pricingTier: true,
      contractPrices: { orderBy: [{ isActive: "desc" }, { startsAt: "desc" }, { id: "asc" }] },
    },
  });
  if (!account) {
    throw new BusinessNetworkError(404, "BUSINESS_ACCOUNT_NOT_FOUND", "Business account not found.");
  }
  return account;
}

export async function createBusinessAccount(input: {
  data: CreateAccountInput;
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    await assertAccountDependencies(tx, input.data);
    const now = new Date();
    const account = await tx.businessAccount.create({
      data: {
        ...input.data,
        pricingTierId: input.data.pricingTierId ?? null,
        accountManagerId: input.data.accountManagerId ?? null,
        notes: input.data.notes ?? null,
        activatedAt: input.data.status === "ACTIVE" ? now : null,
        suspendedAt: input.data.status === "SUSPENDED" ? now : null,
      },
      include: { organization: true, pricingTier: true },
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: account.organizationId,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.businessAccountCreated,
      entityType: "BusinessAccount",
      entityId: account.id,
      after: account,
    });
    return account;
  });
}

export async function updateBusinessAccount(input: {
  id: string;
  data: UpdateAccountInput;
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const current = await tx.businessAccount.findUnique({ where: { id: input.id } });
    if (!current) {
      throw new BusinessNetworkError(404, "BUSINESS_ACCOUNT_NOT_FOUND", "Business account not found.");
    }
    const nextStatus = input.data.status ?? current.status;
    assertStatusTransition(current.status, nextStatus);
    await assertAccountDependencies(tx, {
      organizationId: current.organizationId,
      status: nextStatus,
      pricingTierId: input.data.pricingTierId === undefined ? current.pricingTierId : input.data.pricingTierId,
      accountManagerId:
        input.data.accountManagerId === undefined ? current.accountManagerId : input.data.accountManagerId,
    });
    const now = new Date();
    const account = await tx.businessAccount.update({
      where: { id: current.id },
      data: {
        ...input.data,
        ...(input.data.status === "ACTIVE"
          ? { activatedAt: current.activatedAt ?? now, suspendedAt: null }
          : {}),
        ...(input.data.status === "SUSPENDED" ? { suspendedAt: now } : {}),
      },
      include: { organization: true, pricingTier: true },
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: current.organizationId,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.businessAccountUpdated,
      entityType: "BusinessAccount",
      entityId: current.id,
      before: current,
      after: account,
    });
    return account;
  });
}
