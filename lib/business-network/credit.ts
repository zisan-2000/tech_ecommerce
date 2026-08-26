import "server-only";

import {
  CreditLedgerEntryType,
  Prisma,
  type OrganizationCreditAccount,
} from "@/generated/prisma";
import { db } from "@/lib/db";
import type { ActiveBusinessContext } from "./types";
import { BUSINESS_AUDIT_ACTIONS, writeBusinessAudit } from "./audit";
import { BusinessNetworkError } from "./business-error";
import {
  calculateAvailableCredit,
  calculateCreditMovement,
  evaluateCreditAvailability,
  type CreditMoney,
} from "./credit-core";
import { runSerializableTransaction } from "./transaction";

const creditAccountInclude = {
  businessAccount: {
    include: {
      organization: {
        select: {
          id: true,
          code: true,
          legalName: true,
          displayName: true,
          status: true,
          currency: true,
          capabilities: {
            where: { type: "CORPORATE_BUYER" as const },
            select: { status: true },
            take: 1,
          },
        },
      },
    },
  },
} satisfies Prisma.OrganizationCreditAccountInclude;

function serializeCreditAccount<T extends OrganizationCreditAccount>(account: T) {
  const availableCredit = calculateAvailableCredit(account);
  return {
    ...account,
    creditLimit: account.creditLimit.toFixed(2),
    currentBalance: account.currentBalance.toFixed(2),
    availableCredit: availableCredit.toFixed(2),
  };
}

function assertCreditAccountOperational(account: {
  isActive: boolean;
  currency: string;
  businessAccount: {
    allowCredit: boolean;
    status: string;
    organization: { status: string; currency: string; capabilities: { status: string }[] };
  };
}) {
  if (!account.businessAccount.allowCredit) {
    throw new BusinessNetworkError(403, "BUSINESS_CREDIT_DISABLED", "Corporate credit is disabled for this business account.");
  }
  if (account.businessAccount.status !== "ACTIVE" || account.businessAccount.organization.status !== "ACTIVE") {
    throw new BusinessNetworkError(403, "BUSINESS_ACCOUNT_NOT_ACTIVE", "An active organization and business account are required for corporate credit.");
  }
  if (account.businessAccount.organization.capabilities[0]?.status !== "ACTIVE") {
    throw new BusinessNetworkError(403, "CORPORATE_CAPABILITY_REQUIRED", "An active CORPORATE_BUYER capability is required for corporate credit.");
  }
  if (!account.isActive) {
    throw new BusinessNetworkError(403, "CREDIT_ACCOUNT_INACTIVE", "The corporate credit account is inactive.");
  }
  if (account.currency !== account.businessAccount.organization.currency) {
    throw new BusinessNetworkError(409, "CREDIT_CURRENCY_MISMATCH", "Credit account currency does not match the organization currency.");
  }
}

async function findCreditAccountOrThrow(id: string, tx: Prisma.TransactionClient | typeof db = db) {
  const account = await tx.organizationCreditAccount.findUnique({
    where: { id },
    include: creditAccountInclude,
  });
  if (!account) {
    throw new BusinessNetworkError(404, "CREDIT_ACCOUNT_NOT_FOUND", "Corporate credit account not found.");
  }
  return account;
}

export async function listCreditAccounts(input: {
  page: number;
  limit: number;
  search: string;
  active?: boolean;
}) {
  const where: Prisma.OrganizationCreditAccountWhereInput = {
    ...(input.active === undefined ? {} : { isActive: input.active }),
    ...(input.search
      ? {
          OR: [
            { businessAccount: { accountNumber: { contains: input.search, mode: "insensitive" } } },
            { businessAccount: { organization: { code: { contains: input.search, mode: "insensitive" } } } },
            { businessAccount: { organization: { legalName: { contains: input.search, mode: "insensitive" } } } },
            { businessAccount: { organization: { displayName: { contains: input.search, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.organizationCreditAccount.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: creditAccountInclude,
    }),
    db.organizationCreditAccount.count({ where }),
  ]);
  return {
    items: items.map(serializeCreditAccount),
    pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) },
  };
}

export async function getCreditAccount(id: string, page = 1, limit = 25) {
  const account = await findCreditAccountOrThrow(id);
  const [entries, total] = await Promise.all([
    db.creditLedgerEntry.findMany({
      where: { creditAccountId: id },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    db.creditLedgerEntry.count({ where: { creditAccountId: id } }),
  ]);
  return {
    account: serializeCreditAccount(account),
    entries: entries.map((entry) => ({ ...entry, amount: entry.amount.toFixed(2) })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

export async function setCreditLimit(input: {
  id: string;
  data: { creditLimit: CreditMoney; paymentTermDays?: number; reviewDate?: Date | null; isActive?: boolean };
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const current = await findCreditAccountOrThrow(input.id, tx);
    const creditLimit = new Prisma.Decimal(input.data.creditLimit).toDecimalPlaces(2);
    if (!creditLimit.isFinite() || creditLimit.isNegative()) {
      throw new BusinessNetworkError(422, "INVALID_CREDIT_LIMIT", "Credit limit must be a non-negative amount.");
    }
    if (creditLimit.lessThan(current.currentBalance)) {
      throw new BusinessNetworkError(409, "CREDIT_LIMIT_BELOW_BALANCE", "Credit limit cannot be lower than the outstanding balance.");
    }
    if (input.data.isActive === true) assertCreditAccountOperational({ ...current, isActive: true });

    const updated = await tx.organizationCreditAccount.update({
      where: { id: current.id },
      data: {
        creditLimit,
        paymentTermDays: input.data.paymentTermDays,
        reviewDate: input.data.reviewDate,
        isActive: input.data.isActive,
      },
      include: creditAccountInclude,
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: current.businessAccount.organizationId,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.creditLimitSet,
      entityType: "OrganizationCreditAccount",
      entityId: current.id,
      before: current,
      after: updated,
    });
    return serializeCreditAccount(updated);
  });
}

type AdjustmentInput = {
  id: string;
  data: { adjustment: "DEBIT" | "CREDIT"; amount: CreditMoney; description: string; idempotencyKey: string };
  actorUserId: string;
  request: Request;
};

async function findIdempotentAdjustment(input: AdjustmentInput) {
  return db.creditLedgerEntry.findFirst({
    where: { creditAccountId: input.id, sourceType: "ADMIN_ADJUSTMENT", sourceId: input.data.idempotencyKey },
  });
}

function assertMatchingIdempotentAdjustment(
  input: AdjustmentInput,
  entry: { type: CreditLedgerEntryType; amount: Prisma.Decimal; description: string | null },
) {
  const expectedType = input.data.adjustment === "DEBIT"
    ? CreditLedgerEntryType.DEBIT_ADJUSTMENT
    : CreditLedgerEntryType.CREDIT_ADJUSTMENT;
  const expectedAmount = new Prisma.Decimal(input.data.amount).toDecimalPlaces(2);
  if (
    entry.type !== expectedType ||
    !entry.amount.equals(expectedAmount) ||
    entry.description !== input.data.description
  ) {
    throw new BusinessNetworkError(
      409,
      "CREDIT_IDEMPOTENCY_CONFLICT",
      "This idempotency key was already used for a different credit adjustment.",
    );
  }
}

export async function adjustCredit(input: AdjustmentInput) {
  const existing = await findIdempotentAdjustment(input);
  if (existing) {
    assertMatchingIdempotentAdjustment(input, existing);
    return { entry: { ...existing, amount: existing.amount.toFixed(2) }, idempotent: true };
  }

  try {
    return await runSerializableTransaction(async (tx) => {
      const account = await findCreditAccountOrThrow(input.id, tx);
      assertCreditAccountOperational(account);
      const type = input.data.adjustment === "DEBIT"
        ? CreditLedgerEntryType.DEBIT_ADJUSTMENT
        : CreditLedgerEntryType.CREDIT_ADJUSTMENT;
      const movement = calculateCreditMovement({
        creditLimit: account.creditLimit,
        currentBalance: account.currentBalance,
        amount: input.data.amount,
        type,
      });
      await tx.organizationCreditAccount.update({
        where: { id: account.id },
        data: { currentBalance: movement.nextBalance },
      });
      const entry = await tx.creditLedgerEntry.create({
        data: {
          creditAccountId: account.id,
          type,
          direction: movement.direction,
          amount: new Prisma.Decimal(input.data.amount).toDecimalPlaces(2),
          currency: account.currency,
          sourceType: "ADMIN_ADJUSTMENT",
          sourceId: input.data.idempotencyKey,
          description: input.data.description,
          createdById: input.actorUserId,
        },
      });
      await writeBusinessAudit({
        tx,
        request: input.request,
        organizationId: account.businessAccount.organizationId,
        actorUserId: input.actorUserId,
        action: BUSINESS_AUDIT_ACTIONS.creditLedgerAdjusted,
        entityType: "CreditLedgerEntry",
        entityId: entry.id,
        before: { currentBalance: account.currentBalance },
        after: { entry, currentBalance: movement.nextBalance, availableCredit: movement.availableCredit },
      });
      return { entry: { ...entry, amount: entry.amount.toFixed(2) }, idempotent: false };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await findIdempotentAdjustment(input);
      if (raced) {
        assertMatchingIdempotentAdjustment(input, raced);
        return { entry: { ...raced, amount: raced.amount.toFixed(2) }, idempotent: true };
      }
    }
    throw error;
  }
}

async function findPortalCreditAccount(context: ActiveBusinessContext) {
  const account = await db.organizationCreditAccount.findFirst({
    where: { businessAccount: { organizationId: context.activeMembership.organization.id } },
    include: creditAccountInclude,
  });
  if (!account) {
    throw new BusinessNetworkError(404, "CREDIT_ACCOUNT_NOT_FOUND", "No corporate credit account is configured for this organization.");
  }
  return account;
}

export async function getPortalCredit(context: ActiveBusinessContext) {
  const account = await findPortalCreditAccount(context);
  return serializeCreditAccount(account);
}

export async function getPortalCreditLedger(context: ActiveBusinessContext, page: number, limit: number) {
  const account = await findPortalCreditAccount(context);
  const [entries, total] = await Promise.all([
    db.creditLedgerEntry.findMany({
      where: { creditAccountId: account.id },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    db.creditLedgerEntry.count({ where: { creditAccountId: account.id } }),
  ]);
  return {
    entries: entries.map((entry) => ({ ...entry, amount: entry.amount.toFixed(2) })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

export async function validatePortalCredit(input: {
  context: ActiveBusinessContext;
  amount: CreditMoney;
  currency: string;
}) {
  const account = await findPortalCreditAccount(input.context);
  assertCreditAccountOperational(account);
  if (input.currency !== account.currency) {
    throw new BusinessNetworkError(409, "CREDIT_CURRENCY_MISMATCH", "Requested currency does not match the corporate credit account.");
  }
  const result = evaluateCreditAvailability({
    creditLimit: account.creditLimit,
    currentBalance: account.currentBalance,
    requestedAmount: input.amount,
  });
  return {
    eligible: result.eligible,
    requestedAmount: new Prisma.Decimal(input.amount).toFixed(2),
    currency: account.currency,
    creditLimit: account.creditLimit.toFixed(2),
    currentBalance: account.currentBalance.toFixed(2),
    availableCredit: result.availableCredit.toFixed(2),
    shortfall: result.shortfall.toFixed(2),
    paymentTermDays: account.paymentTermDays,
    reviewDate: account.reviewDate,
  };
}
