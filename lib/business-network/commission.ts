import "server-only";

import {
  CommissionBasis,
  CommissionEntryType,
  CommissionPlanStatus,
  CommissionScopeType,
  CommissionStatus,
  OrderStatus,
  PartnerAgreementStatus,
  PartnerAgreementVersionStatus,
  PartnerStatus,
  Prisma,
} from "@/generated/prisma";
import { db } from "@/lib/db";
import type { ActiveBusinessContext } from "./types";
import { BUSINESS_AUDIT_ACTIONS, writeBusinessAudit } from "./audit";
import { BusinessNetworkError } from "./business-error";
import {
  assertCommissionEntryTransition,
  assertCommissionPlanDates,
  calculateCommissionAmount,
  isCommissionPlanEffective,
  normalizeCommissionTarget,
  selectCommissionRule,
  type CommissionItemContext,
  type CommissionRuleCandidate,
} from "./commission-core";
import {
  createCommissionRuleSchema,
  type CommissionEntryListInput,
  type CommissionPlanListInput,
  type CreateCommissionAdjustmentInput,
  type CreateCommissionPlanInput,
  type CreateCommissionRuleInput,
  type UpdateCommissionPlanInput,
  type UpdateCommissionRuleInput,
} from "./commission-schemas";
import { runSerializableTransaction } from "./transaction";
import { cancelOpenSettlementForCommissionEntry } from "./settlement";

type DatabaseClient = Prisma.TransactionClient | typeof db;

const planDetailInclude = {
  rules: { orderBy: [{ priority: "asc" as const }, { targetKey: "asc" as const }] },
  _count: { select: { agreementVersions: true } },
} satisfies Prisma.CommissionPlanInclude;

const entryInclude = {
  partnerProfile: {
    select: {
      id: true,
      partnerCode: true,
      organization: { select: { id: true, legalName: true, displayName: true } },
    },
  },
  commissionRule: { select: { id: true, name: true, scopeType: true, targetKey: true } },
  order: { select: { id: true, status: true, order_date: true, grand_total: true } },
  orderItem: { select: { id: true, productId: true, variantId: true, quantity: true } },
  partnerLead: { select: { id: true, leadNumber: true, companyName: true, status: true } },
  sourceEntry: { select: { id: true, type: true, status: true, amount: true } },
} satisfies Prisma.CommissionEntryInclude;

function decimal(value: Prisma.Decimal.Value | null) {
  return value === null ? null : new Prisma.Decimal(value).toFixed(2);
}

function serializeRule<T extends {
  rate: Prisma.Decimal | null;
  fixedAmount: Prisma.Decimal | null;
  minOrderAmount: Prisma.Decimal | null;
  maxCommission: Prisma.Decimal | null;
}>(rule: T) {
  return {
    ...rule,
    rate: rule.rate?.toFixed(4) ?? null,
    fixedAmount: decimal(rule.fixedAmount),
    minOrderAmount: decimal(rule.minOrderAmount),
    maxCommission: decimal(rule.maxCommission),
  };
}

function serializePlan<T extends Prisma.CommissionPlanGetPayload<{ include: typeof planDetailInclude }>>(plan: T) {
  return { ...plan, rules: plan.rules.map(serializeRule) };
}

function serializeEntry<T extends {
  grossBasisAmount: Prisma.Decimal;
  netBasisAmount: Prisma.Decimal;
  rate: Prisma.Decimal | null;
  amount: Prisma.Decimal;
}>(entry: T) {
  return {
    ...entry,
    grossBasisAmount: entry.grossBasisAmount.toFixed(2),
    netBasisAmount: entry.netBasisAmount.toFixed(2),
    rate: entry.rate?.toFixed(4) ?? null,
    amount: entry.amount.toFixed(2),
  };
}

async function findPlan(client: DatabaseClient, id: string) {
  const plan = await client.commissionPlan.findUnique({ where: { id }, include: planDetailInclude });
  if (!plan) throw new BusinessNetworkError(404, "COMMISSION_PLAN_NOT_FOUND", "Commission plan not found.");
  return plan;
}

async function findEntry(client: DatabaseClient, id: string) {
  const entry = await client.commissionEntry.findUnique({ where: { id }, include: entryInclude });
  if (!entry) throw new BusinessNetworkError(404, "COMMISSION_ENTRY_NOT_FOUND", "Commission entry not found.");
  return entry;
}

export async function listCommissionPlans(input: CommissionPlanListInput) {
  const where: Prisma.CommissionPlanWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.search ? {
      OR: [
        { code: { contains: input.search, mode: "insensitive" } },
        { name: { contains: input.search, mode: "insensitive" } },
      ],
    } : {}),
  };
  const [items, total] = await Promise.all([
    db.commissionPlan.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: planDetailInclude,
    }),
    db.commissionPlan.count({ where }),
  ]);
  return {
    items: items.map(serializePlan),
    pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) },
  };
}

export async function getCommissionPlan(id: string) {
  return serializePlan(await findPlan(db, id));
}

export async function createCommissionPlan(input: {
  data: CreateCommissionPlanInput;
  actorUserId: string;
  request: Request;
}) {
  assertCommissionPlanDates(input.data.startsAt, input.data.endsAt);
  return runSerializableTransaction(async (tx) => {
    const plan = await tx.commissionPlan.create({
      data: {
        code: input.data.code,
        name: input.data.name,
        description: input.data.description ?? null,
        currency: input.data.currency,
        startsAt: input.data.startsAt ?? null,
        endsAt: input.data.endsAt ?? null,
      },
      include: planDetailInclude,
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.commissionPlanCreated,
      entityType: "CommissionPlan",
      entityId: plan.id,
      after: plan,
    });
    return serializePlan(plan);
  });
}

export async function updateCommissionPlan(input: {
  id: string;
  data: UpdateCommissionPlanInput;
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const before = await findPlan(tx, input.id);
    const startsAt = input.data.startsAt === undefined ? before.startsAt : input.data.startsAt;
    const endsAt = input.data.endsAt === undefined ? before.endsAt : input.data.endsAt;
    assertCommissionPlanDates(startsAt, endsAt);
    if (before.status !== CommissionPlanStatus.DRAFT
      && (input.data.startsAt !== undefined || input.data.endsAt !== undefined)) {
      throw new BusinessNetworkError(409, "COMMISSION_PLAN_TERMS_LOCKED", "Activated plan dates cannot be changed.");
    }
    if (input.data.status === CommissionPlanStatus.ACTIVE && !before.rules.some((rule) => rule.isActive)) {
      throw new BusinessNetworkError(409, "COMMISSION_RULE_REQUIRED", "At least one active rule is required before plan activation.");
    }
    const allowed: Record<CommissionPlanStatus, readonly CommissionPlanStatus[]> = {
      DRAFT: [CommissionPlanStatus.ACTIVE, CommissionPlanStatus.ARCHIVED],
      ACTIVE: [CommissionPlanStatus.INACTIVE],
      INACTIVE: [CommissionPlanStatus.ACTIVE, CommissionPlanStatus.ARCHIVED],
      ARCHIVED: [],
    };
    if (input.data.status && input.data.status !== before.status && !allowed[before.status].includes(input.data.status)) {
      throw new BusinessNetworkError(409, "INVALID_COMMISSION_PLAN_TRANSITION", `Commission plan cannot move from ${before.status} to ${input.data.status}.`);
    }
    const updated = await tx.commissionPlan.update({
      where: { id: before.id },
      data: {
        ...(input.data.name !== undefined ? { name: input.data.name } : {}),
        ...(input.data.description !== undefined ? { description: input.data.description } : {}),
        ...(input.data.status !== undefined ? { status: input.data.status } : {}),
        ...(input.data.startsAt !== undefined ? { startsAt: input.data.startsAt } : {}),
        ...(input.data.endsAt !== undefined ? { endsAt: input.data.endsAt } : {}),
      },
      include: planDetailInclude,
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.commissionPlanUpdated,
      entityType: "CommissionPlan",
      entityId: before.id,
      before,
      after: updated,
    });
    return serializePlan(updated);
  });
}

async function assertCommissionTargetExists(tx: Prisma.TransactionClient, target: ReturnType<typeof normalizeCommissionTarget>) {
  const exists = target.productId
    ? await tx.product.findUnique({ where: { id: target.productId }, select: { id: true } })
    : target.variantId
      ? await tx.productVariant.findUnique({ where: { id: target.variantId }, select: { id: true } })
      : target.categoryId
        ? await tx.category.findUnique({ where: { id: target.categoryId }, select: { id: true } })
        : target.brandId
          ? await tx.brand.findUnique({ where: { id: target.brandId }, select: { id: true } })
          : { id: true };
  if (!exists) throw new BusinessNetworkError(404, "COMMISSION_TARGET_NOT_FOUND", "Commission rule target not found.");
}

function ruleData(data: CreateCommissionRuleInput) {
  const target = normalizeCommissionTarget(data);
  return {
    name: data.name,
    ...target,
    calculationType: data.calculationType,
    basis: data.basis,
    rate: data.rate == null ? null : new Prisma.Decimal(data.rate).toDecimalPlaces(4),
    fixedAmount: data.fixedAmount == null ? null : new Prisma.Decimal(data.fixedAmount).toDecimalPlaces(2),
    minOrderAmount: data.minOrderAmount == null ? null : new Prisma.Decimal(data.minOrderAmount).toDecimalPlaces(2),
    minQuantity: data.minQuantity ?? null,
    maxCommission: data.maxCommission == null ? null : new Prisma.Decimal(data.maxCommission).toDecimalPlaces(2),
    priority: data.priority,
    isActive: data.isActive,
  };
}

export async function createCommissionRule(input: {
  commissionPlanId: string;
  data: CreateCommissionRuleInput;
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const plan = await findPlan(tx, input.commissionPlanId);
    if (plan.status !== CommissionPlanStatus.DRAFT) {
      throw new BusinessNetworkError(409, "COMMISSION_PLAN_NOT_DRAFT", "Rules can only be added to a draft plan.");
    }
    const data = ruleData(input.data);
    await assertCommissionTargetExists(tx, data);
    const rule = await tx.commissionRule.create({ data: { commissionPlanId: plan.id, ...data } });
    await writeBusinessAudit({
      tx,
      request: input.request,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.commissionRuleCreated,
      entityType: "CommissionRule",
      entityId: rule.id,
      after: rule,
    });
    return serializeRule(rule);
  });
}

export async function updateCommissionRule(input: {
  id: string;
  data: UpdateCommissionRuleInput;
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const before = await tx.commissionRule.findUnique({ where: { id: input.id }, include: { commissionPlan: true } });
    if (!before) throw new BusinessNetworkError(404, "COMMISSION_RULE_NOT_FOUND", "Commission rule not found.");
    if (before.commissionPlan.status !== CommissionPlanStatus.DRAFT) {
      throw new BusinessNetworkError(409, "COMMISSION_PLAN_NOT_DRAFT", "Rules can only be changed on a draft plan.");
    }
    const merged = createCommissionRuleSchema.parse({
      name: input.data.name ?? before.name,
      scopeType: input.data.scopeType ?? before.scopeType,
      productId: input.data.productId === undefined ? before.productId : input.data.productId,
      variantId: input.data.variantId === undefined ? before.variantId : input.data.variantId,
      categoryId: input.data.categoryId === undefined ? before.categoryId : input.data.categoryId,
      brandId: input.data.brandId === undefined ? before.brandId : input.data.brandId,
      productType: input.data.productType === undefined ? before.productType : input.data.productType,
      calculationType: input.data.calculationType ?? before.calculationType,
      basis: input.data.basis ?? before.basis,
      rate: input.data.rate === undefined ? before.rate?.toString() ?? null : input.data.rate,
      fixedAmount: input.data.fixedAmount === undefined ? before.fixedAmount?.toString() ?? null : input.data.fixedAmount,
      minOrderAmount: input.data.minOrderAmount === undefined ? before.minOrderAmount?.toString() ?? null : input.data.minOrderAmount,
      minQuantity: input.data.minQuantity === undefined ? before.minQuantity : input.data.minQuantity,
      maxCommission: input.data.maxCommission === undefined ? before.maxCommission?.toString() ?? null : input.data.maxCommission,
      priority: input.data.priority ?? before.priority,
      isActive: input.data.isActive ?? before.isActive,
    });
    const data = ruleData(merged);
    await assertCommissionTargetExists(tx, data);
    const updated = await tx.commissionRule.update({ where: { id: before.id }, data });
    await writeBusinessAudit({
      tx,
      request: input.request,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.commissionRuleUpdated,
      entityType: "CommissionRule",
      entityId: before.id,
      before,
      after: updated,
    });
    return serializeRule(updated);
  });
}

export async function deleteCommissionRule(input: { id: string; actorUserId: string; request: Request }) {
  return runSerializableTransaction(async (tx) => {
    const before = await tx.commissionRule.findUnique({ where: { id: input.id }, include: { commissionPlan: true } });
    if (!before) throw new BusinessNetworkError(404, "COMMISSION_RULE_NOT_FOUND", "Commission rule not found.");
    if (before.commissionPlan.status !== CommissionPlanStatus.DRAFT) {
      throw new BusinessNetworkError(409, "COMMISSION_PLAN_NOT_DRAFT", "Rules can only be removed from a draft plan.");
    }
    await tx.commissionRule.delete({ where: { id: before.id } });
    await writeBusinessAudit({
      tx,
      request: input.request,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.commissionRuleRemoved,
      entityType: "CommissionRule",
      entityId: before.id,
      before,
    });
    return { removed: true };
  });
}

function commissionWhere(input: CommissionEntryListInput, partnerProfileId?: string): Prisma.CommissionEntryWhereInput {
  return {
    ...(partnerProfileId ? { partnerProfileId } : input.partnerProfileId ? { partnerProfileId: input.partnerProfileId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.orderId ? { orderId: input.orderId } : {}),
    ...(input.partnerLeadId ? { partnerLeadId: input.partnerLeadId } : {}),
    ...(input.createdFrom || input.createdTo ? {
      createdAt: { ...(input.createdFrom ? { gte: input.createdFrom } : {}), ...(input.createdTo ? { lte: input.createdTo } : {}) },
    } : {}),
  };
}

async function listEntries(input: CommissionEntryListInput, partnerProfileId?: string) {
  const where = commissionWhere(input, partnerProfileId);
  const [items, total, balances] = await Promise.all([
    db.commissionEntry.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: entryInclude,
    }),
    db.commissionEntry.count({ where }),
    db.commissionEntry.groupBy({ by: ["status", "currency"], where, _sum: { amount: true } }),
  ]);
  return {
    items: items.map(serializeEntry),
    balances: balances.map((balance) => ({ status: balance.status, currency: balance.currency, amount: balance._sum.amount?.toFixed(2) ?? "0.00" })),
    pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) },
  };
}

export const listAdminCommissionEntries = (input: CommissionEntryListInput) => listEntries(input);

export async function listPortalCommissionEntries(context: ActiveBusinessContext, input: CommissionEntryListInput) {
  const profile = await db.partnerProfile.findUnique({
    where: { organizationId: context.activeMembership.organization.id },
    select: { id: true },
  });
  if (!profile) throw new BusinessNetworkError(404, "PARTNER_PROFILE_NOT_FOUND", "Partner profile not found.");
  return listEntries(input, profile.id);
}

function asRuleCandidate(rule: Prisma.CommissionRuleGetPayload<Record<string, never>>): CommissionRuleCandidate {
  return { ...rule, ...normalizeCommissionTarget(rule) };
}

export async function calculateOrderCommissions(input: {
  tx: Prisma.TransactionClient;
  orderId: number;
  actorUserId?: string | null;
  request?: Request | null;
}) {
  const attribution = await input.tx.partnerAttribution.findUnique({
    where: { orderId: input.orderId },
    include: {
      partnerProfile: { select: { id: true, organizationId: true, status: true } },
      agreementVersion: {
        include: {
          agreement: true,
          commissionPlan: { include: { rules: { where: { isActive: true } } } },
        },
      },
    },
  });
  if (!attribution || attribution.status !== "CONVERTED" || !attribution.agreementVersion) return [];
  const version = attribution.agreementVersion;
  const plan = version.commissionPlan;
  if (!plan) return [];
  if (attribution.partnerProfile.status !== PartnerStatus.ACTIVE
    || version.status !== PartnerAgreementVersionStatus.ACTIVE
    || version.agreement.status !== PartnerAgreementStatus.ACTIVE
    || !isCommissionPlanEffective(plan)) return [];
  const order = await input.tx.order.findUnique({
    where: { id: input.orderId },
    include: { orderItems: { include: { product: { select: { categoryId: true, brandId: true, type: true } } } } },
  });
  if (!order || order.currency !== plan.currency) return [];
  const candidates = plan.rules.map(asRuleCandidate);
  const created = [];
  const orderNet = Prisma.Decimal.max(0, order.grand_total.minus(order.shipping_cost));
  let orderRuleConsumed = false;
  for (const item of order.orderItems) {
    const gross = (item.publicUnitPriceSnapshot ?? item.price).mul(item.quantity);
    const itemDiscount = item.discountAmount ?? item.businessDiscountSnapshot ?? new Prisma.Decimal(0);
    const net = Prisma.Decimal.max(0, item.price.mul(item.quantity).minus(itemDiscount));
    const context: CommissionItemContext = {
      productId: item.productId,
      variantId: item.variantId,
      categoryId: item.product.categoryId,
      brandId: item.product.brandId,
      productType: item.product.type,
      quantity: item.quantity,
      grossItemAmount: gross,
      netItemAmount: net,
      orderNetAmount: orderNet,
    };
    const rule = selectCommissionRule(candidates, context);
    if (!rule || (rule.basis === CommissionBasis.ORDER_NET && orderRuleConsumed)) continue;
    const calculation = calculateCommissionAmount({
      rule,
      quantity: rule.basis === CommissionBasis.ORDER_NET ? 1 : item.quantity,
      grossBasisAmount: gross,
      netBasisAmount: net,
      orderNetAmount: orderNet,
    });
    if (calculation.amount.lte(0)) continue;
    const entry = await input.tx.commissionEntry.create({
      data: {
        partnerProfileId: attribution.partnerProfileId,
        agreementVersionId: version.id,
        commissionRuleId: rule.id,
        type: CommissionEntryType.EARNING,
        orderId: order.id,
        orderItemId: rule.basis === CommissionBasis.ORDER_NET ? null : item.id,
        grossBasisAmount: rule.basis === CommissionBasis.ORDER_NET ? orderNet : gross,
        netBasisAmount: rule.basis === CommissionBasis.ORDER_NET ? orderNet : net,
        rate: calculation.rate,
        amount: calculation.amount,
        currency: plan.currency,
        createdById: input.actorUserId ?? null,
      },
      include: entryInclude,
    });
    created.push(entry);
    if (rule.basis === CommissionBasis.ORDER_NET) orderRuleConsumed = true;
    await writeBusinessAudit({
      tx: input.tx,
      request: input.request,
      organizationId: attribution.partnerProfile.organizationId,
      actorUserId: input.actorUserId ?? null,
      action: BUSINESS_AUDIT_ACTIONS.commissionCalculated,
      entityType: "CommissionEntry",
      entityId: entry.id,
      after: entry,
    });
  }
  return created.map(serializeEntry);
}

export async function calculateLeadCommission(input: {
  tx: Prisma.TransactionClient;
  partnerLeadId: string;
  actorUserId?: string | null;
  request?: Request | null;
}) {
  const lead = await input.tx.partnerLead.findUnique({
    where: { id: input.partnerLeadId },
    include: {
      partnerProfile: {
        include: {
          agreements: {
            where: { status: PartnerAgreementStatus.ACTIVE },
            orderBy: { startsAt: "desc" },
            include: {
              versions: {
                where: { status: PartnerAgreementVersionStatus.ACTIVE },
                orderBy: { versionNumber: "desc" },
                include: { commissionPlan: { include: { rules: { where: { isActive: true, scopeType: CommissionScopeType.LEAD } } } } },
              },
            },
          },
        },
      },
    },
  });
  if (!lead || lead.status !== "WON" || !lead.estimatedValue || lead.estimatedValue.lte(0)) return null;
  const now = new Date();
  const agreement = lead.partnerProfile.agreements.find((candidate) => candidate.startsAt <= now && (!candidate.endsAt || candidate.endsAt > now));
  const version = agreement?.versions[0];
  const plan = version?.commissionPlan;
  const rule = plan?.rules.sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))[0];
  if (!agreement || !version || !plan || !rule || plan.currency !== lead.currency || !isCommissionPlanEffective(plan, now)) return null;
  const calculation = calculateCommissionAmount({
    rule: asRuleCandidate(rule),
    quantity: 1,
    grossBasisAmount: lead.estimatedValue,
    netBasisAmount: lead.estimatedValue,
    leadValue: lead.estimatedValue,
  });
  const entry = await input.tx.commissionEntry.create({
    data: {
      partnerProfileId: lead.partnerProfileId,
      agreementVersionId: version.id,
      commissionRuleId: rule.id,
      type: CommissionEntryType.EARNING,
      partnerLeadId: lead.id,
      grossBasisAmount: lead.estimatedValue,
      netBasisAmount: lead.estimatedValue,
      rate: calculation.rate,
      amount: calculation.amount,
      currency: plan.currency,
      createdById: input.actorUserId ?? null,
    },
    include: entryInclude,
  });
  await writeBusinessAudit({
    tx: input.tx,
    request: input.request,
    organizationId: lead.partnerProfile.organizationId,
    actorUserId: input.actorUserId ?? null,
    action: BUSINESS_AUDIT_ACTIONS.commissionCalculated,
    entityType: "CommissionEntry",
    entityId: entry.id,
    after: entry,
  });
  return serializeEntry(entry);
}

function returnWindowDays(): number {
  const configured = Number(process.env.PARTNER_COMMISSION_RETURN_WINDOW_DAYS ?? "7");
  return Number.isInteger(configured) && configured >= 0 && configured <= 365 ? configured : 7;
}

export async function syncCommissionEntriesForOrderStatus(input: {
  tx: Prisma.TransactionClient;
  orderId: number;
  orderStatus: OrderStatus;
  actorUserId?: string | null;
  request?: Request | null;
}) {
  const entries = await input.tx.commissionEntry.findMany({
    where: { orderId: input.orderId, type: CommissionEntryType.EARNING },
    include: entryInclude,
  });
  const now = new Date();
  const results = [];
  for (const entry of entries) {
    if (input.orderStatus === OrderStatus.DELIVERED && entry.status === CommissionStatus.PENDING) {
      assertCommissionEntryTransition(entry.status, CommissionStatus.HOLD);
      const updated = await input.tx.commissionEntry.update({
        where: { id: entry.id },
        data: { status: CommissionStatus.HOLD, holdUntil: new Date(now.getTime() + returnWindowDays() * 86_400_000) },
        include: entryInclude,
      });
      results.push(updated);
    } else if ((input.orderStatus === OrderStatus.CANCELLED || input.orderStatus === OrderStatus.FAILED)
      && (entry.status === CommissionStatus.PENDING || entry.status === CommissionStatus.HOLD)) {
      assertCommissionEntryTransition(entry.status, CommissionStatus.CANCELLED);
      results.push(await input.tx.commissionEntry.update({ where: { id: entry.id }, data: { status: CommissionStatus.CANCELLED }, include: entryInclude }));
    } else if (input.orderStatus === OrderStatus.RETURNED && entry.status !== CommissionStatus.CANCELLED && entry.status !== CommissionStatus.REVERSED) {
      if (entry.status === CommissionStatus.PENDING || entry.status === CommissionStatus.HOLD) {
        assertCommissionEntryTransition(entry.status, CommissionStatus.CANCELLED);
        results.push(await input.tx.commissionEntry.update({ where: { id: entry.id }, data: { status: CommissionStatus.CANCELLED }, include: entryInclude }));
      } else {
        results.push(await reverseEntryInTransaction({ tx: input.tx, entry, reason: `Order #${input.orderId} was returned.`, actorUserId: input.actorUserId ?? null, request: input.request }));
      }
    }
  }
  return results.map(serializeEntry);
}

export async function approveCommissionEntry(input: { id: string; actorUserId: string; request: Request }) {
  return runSerializableTransaction(async (tx) => {
    const before = await findEntry(tx, input.id);
    if (before.status === CommissionStatus.APPROVED) return serializeEntry(before);
    assertCommissionEntryTransition(before.status, CommissionStatus.APPROVED);
    const now = new Date();
    if (!before.holdUntil || before.holdUntil > now) {
      throw new BusinessNetworkError(409, "COMMISSION_HOLD_ACTIVE", "Commission cannot be approved before its return hold window finishes.");
    }
    const updated = await tx.commissionEntry.update({ where: { id: before.id }, data: { status: CommissionStatus.APPROVED, approvedAt: now }, include: entryInclude });
    await writeEntryAudit(tx, input.request, input.actorUserId, before, updated, BUSINESS_AUDIT_ACTIONS.commissionApproved);
    return serializeEntry(updated);
  });
}

export async function cancelCommissionEntry(input: { id: string; reason: string; actorUserId: string; request: Request }) {
  return runSerializableTransaction(async (tx) => {
    const before = await findEntry(tx, input.id);
    if (before.status === CommissionStatus.CANCELLED) return serializeEntry(before);
    assertCommissionEntryTransition(before.status, CommissionStatus.CANCELLED);
    const updated = await tx.commissionEntry.update({ where: { id: before.id }, data: { status: CommissionStatus.CANCELLED }, include: entryInclude });
    await writeEntryAudit(tx, input.request, input.actorUserId, before, { ...updated, cancellationReason: input.reason }, BUSINESS_AUDIT_ACTIONS.commissionCancelled);
    return serializeEntry(updated);
  });
}

async function reverseEntryInTransaction(input: {
  tx: Prisma.TransactionClient;
  entry: Awaited<ReturnType<typeof findEntry>>;
  reason: string;
  actorUserId: string | null;
  request?: Request | null;
}) {
  if (input.entry.status === CommissionStatus.REVERSED) return input.entry;
  if (input.entry.status === CommissionStatus.CANCELLED) {
    throw new BusinessNetworkError(409, "COMMISSION_NOT_REVERSIBLE", "A cancelled commission cannot be reversed.");
  }
  const existing = await input.tx.commissionEntry.findFirst({ where: { sourceEntryId: input.entry.id, type: CommissionEntryType.REVERSAL }, include: entryInclude });
  if (existing) return existing;
  await cancelOpenSettlementForCommissionEntry({
    tx: input.tx,
    commissionEntryId: input.entry.id,
    reason: `Settlement released because commission was reversed: ${input.reason}`,
    actorUserId: input.actorUserId,
    request: input.request,
  });
  assertCommissionEntryTransition(input.entry.status, CommissionStatus.REVERSED);
  const now = new Date();
  const matured = input.entry.status === CommissionStatus.APPROVED
    || input.entry.status === CommissionStatus.PAYABLE
    || input.entry.status === CommissionStatus.PAID;
  const reversal = await input.tx.commissionEntry.create({
    data: {
      partnerProfileId: input.entry.partnerProfileId,
      agreementVersionId: input.entry.agreementVersionId,
      commissionRuleId: input.entry.commissionRuleId,
      type: CommissionEntryType.REVERSAL,
      status: matured ? CommissionStatus.APPROVED : CommissionStatus.HOLD,
      orderId: input.entry.orderId,
      orderItemId: input.entry.orderItemId,
      partnerLeadId: input.entry.partnerLeadId,
      grossBasisAmount: input.entry.grossBasisAmount,
      netBasisAmount: input.entry.netBasisAmount,
      rate: input.entry.rate,
      amount: input.entry.amount.negated(),
      currency: input.entry.currency,
      sourceEntryId: input.entry.id,
      holdUntil: matured ? null : now,
      approvedAt: matured ? now : null,
      reason: input.reason,
      createdById: input.actorUserId,
    },
    include: entryInclude,
  });
  await input.tx.commissionEntry.update({ where: { id: input.entry.id }, data: { status: CommissionStatus.REVERSED } });
  await writeEntryAudit(input.tx, input.request, input.actorUserId, input.entry, reversal, BUSINESS_AUDIT_ACTIONS.commissionReversed);
  return reversal;
}

export async function reverseCommissionEntry(input: { id: string; reason: string; actorUserId: string; request: Request }) {
  return runSerializableTransaction(async (tx) => serializeEntry(await reverseEntryInTransaction({
    tx,
    entry: await findEntry(tx, input.id),
    reason: input.reason,
    actorUserId: input.actorUserId,
    request: input.request,
  })));
}

export async function createCommissionAdjustment(input: {
  data: CreateCommissionAdjustmentInput;
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const partner = await tx.partnerProfile.findUnique({ where: { id: input.data.partnerProfileId }, select: { id: true, organizationId: true } });
    if (!partner) throw new BusinessNetworkError(404, "PARTNER_PROFILE_NOT_FOUND", "Partner profile not found.");
    const source = input.data.sourceEntryId ? await findEntry(tx, input.data.sourceEntryId) : null;
    if (source && (source.partnerProfileId !== partner.id || source.currency !== input.data.currency)) {
      throw new BusinessNetworkError(422, "COMMISSION_ADJUSTMENT_SCOPE_MISMATCH", "Adjustment source must belong to the same partner and currency.");
    }
    const entry = await tx.commissionEntry.create({
      data: {
        partnerProfileId: partner.id,
        agreementVersionId: source?.agreementVersionId ?? null,
        commissionRuleId: source?.commissionRuleId ?? null,
        type: CommissionEntryType.ADJUSTMENT,
        status: CommissionStatus.HOLD,
        orderId: source?.orderId ?? null,
        orderItemId: source?.orderItemId ?? null,
        partnerLeadId: source?.partnerLeadId ?? null,
        grossBasisAmount: 0,
        netBasisAmount: 0,
        amount: new Prisma.Decimal(input.data.amount).toDecimalPlaces(2),
        currency: input.data.currency,
        sourceEntryId: source?.id ?? null,
        holdUntil: new Date(),
        reason: input.data.reason,
        createdById: input.actorUserId,
      },
      include: entryInclude,
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: partner.organizationId,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.commissionAdjusted,
      entityType: "CommissionEntry",
      entityId: entry.id,
      after: entry,
    });
    return serializeEntry(entry);
  });
}

async function writeEntryAudit(
  tx: Prisma.TransactionClient,
  request: Request | null | undefined,
  actorUserId: string | null,
  before: Awaited<ReturnType<typeof findEntry>>,
  after: unknown,
  action: typeof BUSINESS_AUDIT_ACTIONS.commissionApproved
    | typeof BUSINESS_AUDIT_ACTIONS.commissionCancelled
    | typeof BUSINESS_AUDIT_ACTIONS.commissionReversed,
) {
  await writeBusinessAudit({
    tx,
    request,
    organizationId: before.partnerProfile.organization.id,
    actorUserId,
    action,
    entityType: "CommissionEntry",
    entityId: before.id,
    before,
    after,
  });
}
