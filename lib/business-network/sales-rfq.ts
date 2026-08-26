import "server-only";

import { Prisma, SalesRfqStatus } from "@/generated/prisma";
import { db } from "@/lib/db";
import type { ActiveBusinessContext } from "./types";
import { BUSINESS_AUDIT_ACTIONS, writeBusinessAudit } from "./audit";
import { BusinessNetworkError } from "./business-error";
import {
  assertSalesRfqEditable,
  assertSalesRfqTransition,
  formatSalesRfqNumber,
  validateSalesRfqDates,
} from "./sales-rfq-core";
import type {
  createSalesRfqSchema,
  salesRfqAttachmentSchema,
  salesRfqItemSchema,
  updateSalesRfqSchema,
} from "./sales-rfq-schemas";
import { runSerializableTransaction } from "./transaction";
import type { z } from "zod";

type SalesRfqItemInput = z.infer<typeof salesRfqItemSchema>;
type CreateSalesRfqInput = z.infer<typeof createSalesRfqSchema>;
type UpdateSalesRfqInput = z.infer<typeof updateSalesRfqSchema>;
type SalesRfqAttachmentInput = z.infer<typeof salesRfqAttachmentSchema>;

const salesRfqDetailInclude = {
  organization: {
    select: { id: true, code: true, legalName: true, displayName: true, status: true, currency: true },
  },
  requestedBy: {
    select: {
      id: true,
      userId: true,
      title: true,
      department: true,
      user: { select: { id: true, name: true, email: true } },
    },
  },
  items: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
  attachments: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
} satisfies Prisma.SalesRfqInclude;

function serializeSalesRfq<T extends { items?: Array<{ targetUnitPrice: Prisma.Decimal | null }> }>(rfq: T) {
  return {
    ...rfq,
    ...(rfq.items
      ? {
          items: rfq.items.map((item) => ({
            ...item,
            targetUnitPrice: item.targetUnitPrice?.toFixed(2) ?? null,
          })),
        }
      : {}),
  };
}

async function assertActiveCorporateAccount(
  organizationId: string,
  tx: Prisma.TransactionClient | typeof db = db,
) {
  const account = await tx.businessAccount.findUnique({
    where: { organizationId },
    select: {
      id: true,
      status: true,
      organization: {
        select: {
          status: true,
          capabilities: {
            where: { type: "CORPORATE_BUYER" },
            select: { status: true },
            take: 1,
          },
        },
      },
    },
  });
  if (
    !account ||
    account.status !== "ACTIVE" ||
    account.organization.status !== "ACTIVE" ||
    account.organization.capabilities[0]?.status !== "ACTIVE"
  ) {
    throw new BusinessNetworkError(
      403,
      "ACTIVE_BUSINESS_ACCOUNT_REQUIRED",
      "An active business account and CORPORATE_BUYER capability are required for sales RFQs.",
    );
  }
  return account;
}

async function snapshotSalesRfqItems(tx: Prisma.TransactionClient, items: SalesRfqItemInput[]) {
  const productIds = [...new Set(items.flatMap((item) => item.productId ? [item.productId] : []))];
  const variantIds = [...new Set(items.flatMap((item) => item.variantId ? [item.variantId] : []))];
  const [products, variants] = await Promise.all([
    productIds.length
      ? tx.product.findMany({
          where: { id: { in: productIds }, deleted: false },
          select: { id: true, name: true, sku: true },
        })
      : [],
    variantIds.length
      ? tx.productVariant.findMany({
          where: { id: { in: variantIds }, active: true, product: { deleted: false } },
          select: { id: true, productId: true, sku: true, product: { select: { name: true } } },
        })
      : [],
  ]);
  const productMap = new Map(products.map((product) => [product.id, product]));
  const variantMap = new Map(variants.map((variant) => [variant.id, variant]));
  const linkedKeys = new Set<string>();

  return items.map((item) => {
    const variant = item.variantId ? variantMap.get(item.variantId) : null;
    if (item.variantId && !variant) {
      throw new BusinessNetworkError(404, "RFQ_VARIANT_NOT_FOUND", "A selected catalog variant is unavailable.");
    }
    const resolvedProductId = variant?.productId ?? item.productId ?? null;
    if (variant && item.productId && variant.productId !== item.productId) {
      throw new BusinessNetworkError(422, "RFQ_VARIANT_PRODUCT_MISMATCH", "A selected variant does not belong to the selected product.");
    }
    const product = resolvedProductId ? productMap.get(resolvedProductId) : null;
    if (resolvedProductId && !product && !variant) {
      throw new BusinessNetworkError(404, "RFQ_PRODUCT_NOT_FOUND", "A selected catalog product is unavailable.");
    }
    if (resolvedProductId) {
      const key = `${resolvedProductId}:${variant?.id ?? "product"}`;
      if (linkedKeys.has(key)) {
        throw new BusinessNetworkError(422, "DUPLICATE_RFQ_ITEM", "Duplicate catalog items are not allowed in one sales RFQ.");
      }
      linkedKeys.add(key);
    }
    return {
      productId: resolvedProductId,
      variantId: variant?.id ?? null,
      productName: variant?.product.name ?? product?.name ?? item.productName?.trim() ?? "",
      skuSnapshot: variant?.sku ?? product?.sku ?? item.skuSnapshot ?? null,
      description: item.description ?? null,
      quantity: item.quantity,
      targetUnitPrice: item.targetUnitPrice == null ? null : new Prisma.Decimal(item.targetUnitPrice).toDecimalPlaces(2),
    };
  });
}

async function nextSalesRfqNumber(tx: Prisma.TransactionClient, now: Date) {
  const rows = await tx.$queryRaw<Array<{ value: bigint }>>`
    SELECT nextval('"SalesRfqNumber_seq"') AS value
  `;
  const value = rows[0]?.value;
  if (!value) throw new BusinessNetworkError(503, "RFQ_NUMBER_UNAVAILABLE", "Could not allocate a sales RFQ number.");
  return formatSalesRfqNumber(value, now);
}

async function findPortalSalesRfq(tx: Prisma.TransactionClient | typeof db, id: string, organizationId: string) {
  const rfq = await tx.salesRfq.findFirst({
    where: { id, organizationId },
    include: salesRfqDetailInclude,
  });
  if (!rfq) throw new BusinessNetworkError(404, "SALES_RFQ_NOT_FOUND", "Sales RFQ not found.");
  return rfq;
}

export async function listPortalSalesRfqs(input: {
  context: ActiveBusinessContext;
  page: number;
  limit: number;
  search: string;
  status?: SalesRfqStatus;
}) {
  const organizationId = input.context.activeMembership.organization.id;
  const where: Prisma.SalesRfqWhereInput = {
    organizationId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.search
      ? { OR: [
          { rfqNumber: { contains: input.search, mode: "insensitive" } },
          { subject: { contains: input.search, mode: "insensitive" } },
        ] }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.salesRfq.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        requestedBy: { select: { id: true, user: { select: { name: true, email: true } } } },
        _count: { select: { items: true, attachments: true } },
      },
    }),
    db.salesRfq.count({ where }),
  ]);
  return { items, pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) } };
}

export async function getPortalSalesRfq(context: ActiveBusinessContext, id: string) {
  return serializeSalesRfq(await findPortalSalesRfq(db, id, context.activeMembership.organization.id));
}

export async function createSalesRfq(input: {
  context: ActiveBusinessContext;
  data: CreateSalesRfqInput;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const organizationId = input.context.activeMembership.organization.id;
    await assertActiveCorporateAccount(organizationId, tx);
    validateSalesRfqDates(input.data);
    const items = await snapshotSalesRfqItems(tx, input.data.items);
    const now = new Date();
    const rfq = await tx.salesRfq.create({
      data: {
        rfqNumber: await nextSalesRfqNumber(tx, now),
        organizationId,
        requestedByMemberId: input.context.activeMembership.memberId,
        subject: input.data.subject,
        requestedDelivery: input.data.requestedDelivery ?? null,
        quotationDueAt: input.data.quotationDueAt ?? null,
        notes: input.data.notes ?? null,
        items: { create: items },
      },
      include: salesRfqDetailInclude,
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId,
      memberId: input.context.activeMembership.memberId,
      actorUserId: input.context.user.id,
      action: BUSINESS_AUDIT_ACTIONS.salesRfqCreated,
      entityType: "SalesRfq",
      entityId: rfq.id,
      after: rfq,
    });
    return serializeSalesRfq(rfq);
  });
}

export async function updateSalesRfq(input: {
  context: ActiveBusinessContext;
  id: string;
  data: UpdateSalesRfqInput;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const organizationId = input.context.activeMembership.organization.id;
    const current = await findPortalSalesRfq(tx, input.id, organizationId);
    assertSalesRfqEditable(current.status);
    validateSalesRfqDates({
      requestedDelivery: input.data.requestedDelivery === undefined ? current.requestedDelivery : input.data.requestedDelivery,
      quotationDueAt: input.data.quotationDueAt === undefined ? current.quotationDueAt : input.data.quotationDueAt,
    });
    const items = input.data.items ? await snapshotSalesRfqItems(tx, input.data.items) : null;
    await tx.salesRfq.update({
      where: { id: current.id },
      data: {
        subject: input.data.subject,
        requestedDelivery: input.data.requestedDelivery,
        quotationDueAt: input.data.quotationDueAt,
        notes: input.data.notes,
        ...(items
          ? { items: { deleteMany: {}, create: items } }
          : {}),
      },
    });
    const updated = await findPortalSalesRfq(tx, current.id, organizationId);
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId,
      memberId: input.context.activeMembership.memberId,
      actorUserId: input.context.user.id,
      action: BUSINESS_AUDIT_ACTIONS.salesRfqUpdated,
      entityType: "SalesRfq",
      entityId: current.id,
      before: current,
      after: updated,
    });
    return serializeSalesRfq(updated);
  });
}

export async function submitSalesRfq(input: { context: ActiveBusinessContext; id: string; request: Request }) {
  return runSerializableTransaction(async (tx) => {
    const organizationId = input.context.activeMembership.organization.id;
    await assertActiveCorporateAccount(organizationId, tx);
    const current = await findPortalSalesRfq(tx, input.id, organizationId);
    assertSalesRfqTransition(current.status, SalesRfqStatus.SUBMITTED);
    if (current.items.length === 0) {
      throw new BusinessNetworkError(422, "RFQ_ITEMS_REQUIRED", "At least one item is required before submitting a sales RFQ.");
    }
    const now = new Date();
    validateSalesRfqDates({
      requestedDelivery: current.requestedDelivery,
      quotationDueAt: current.quotationDueAt,
      now,
      requireFuture: true,
    });
    const updated = await tx.salesRfq.update({
      where: { id: current.id },
      data: { status: SalesRfqStatus.SUBMITTED, submittedAt: now },
      include: salesRfqDetailInclude,
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId,
      memberId: input.context.activeMembership.memberId,
      actorUserId: input.context.user.id,
      action: BUSINESS_AUDIT_ACTIONS.salesRfqSubmitted,
      entityType: "SalesRfq",
      entityId: current.id,
      before: current,
      after: updated,
    });
    return serializeSalesRfq(updated);
  });
}

export async function cancelSalesRfq(input: { context: ActiveBusinessContext; id: string; request: Request }) {
  return runSerializableTransaction(async (tx) => {
    const organizationId = input.context.activeMembership.organization.id;
    const current = await findPortalSalesRfq(tx, input.id, organizationId);
    assertSalesRfqTransition(current.status, SalesRfqStatus.CANCELLED);
    const updated = await tx.salesRfq.update({
      where: { id: current.id },
      data: { status: SalesRfqStatus.CANCELLED, closedAt: new Date() },
      include: salesRfqDetailInclude,
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId,
      memberId: input.context.activeMembership.memberId,
      actorUserId: input.context.user.id,
      action: BUSINESS_AUDIT_ACTIONS.salesRfqCancelled,
      entityType: "SalesRfq",
      entityId: current.id,
      before: current,
      after: updated,
    });
    return serializeSalesRfq(updated);
  });
}

export async function addSalesRfqAttachment(input: {
  context: ActiveBusinessContext;
  id: string;
  data: SalesRfqAttachmentInput;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const organizationId = input.context.activeMembership.organization.id;
    const rfq = await findPortalSalesRfq(tx, input.id, organizationId);
    assertSalesRfqEditable(rfq.status);
    if (rfq.attachments.length >= 20) {
      throw new BusinessNetworkError(422, "RFQ_ATTACHMENT_LIMIT", "A sales RFQ can contain at most 20 attachments.");
    }
    const attachment = await tx.salesRfqAttachment.create({
      data: { salesRfqId: rfq.id, ...input.data },
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId,
      memberId: input.context.activeMembership.memberId,
      actorUserId: input.context.user.id,
      action: BUSINESS_AUDIT_ACTIONS.salesRfqAttachmentAdded,
      entityType: "SalesRfqAttachment",
      entityId: attachment.id,
      after: attachment,
    });
    return attachment;
  });
}

export async function removeSalesRfqAttachment(input: {
  context: ActiveBusinessContext;
  id: string;
  attachmentId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const organizationId = input.context.activeMembership.organization.id;
    const rfq = await findPortalSalesRfq(tx, input.id, organizationId);
    assertSalesRfqEditable(rfq.status);
    const attachment = await tx.salesRfqAttachment.findFirst({
      where: { id: input.attachmentId, salesRfqId: rfq.id },
    });
    if (!attachment) throw new BusinessNetworkError(404, "RFQ_ATTACHMENT_NOT_FOUND", "Sales RFQ attachment not found.");
    await tx.salesRfqAttachment.delete({ where: { id: attachment.id } });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId,
      memberId: input.context.activeMembership.memberId,
      actorUserId: input.context.user.id,
      action: BUSINESS_AUDIT_ACTIONS.salesRfqAttachmentRemoved,
      entityType: "SalesRfqAttachment",
      entityId: attachment.id,
      before: attachment,
    });
    return { id: attachment.id };
  });
}

export async function listAdminSalesRfqs(input: {
  page: number;
  limit: number;
  search: string;
  status?: SalesRfqStatus;
  organizationId?: string;
  assignedToUserId?: string;
}) {
  const where: Prisma.SalesRfqWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    ...(input.assignedToUserId ? { assignedToUserId: input.assignedToUserId } : {}),
    ...(input.search
      ? { OR: [
          { rfqNumber: { contains: input.search, mode: "insensitive" } },
          { subject: { contains: input.search, mode: "insensitive" } },
          { organization: { legalName: { contains: input.search, mode: "insensitive" } } },
          { organization: { displayName: { contains: input.search, mode: "insensitive" } } },
        ] }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.salesRfq.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        organization: { select: { id: true, code: true, legalName: true, displayName: true } },
        requestedBy: { select: { id: true, user: { select: { name: true, email: true } } } },
        _count: { select: { items: true, attachments: true } },
      },
    }),
    db.salesRfq.count({ where }),
  ]);
  return { items, pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) } };
}

export async function getAdminSalesRfq(id: string) {
  const rfq = await db.salesRfq.findUnique({ where: { id }, include: salesRfqDetailInclude });
  if (!rfq) throw new BusinessNetworkError(404, "SALES_RFQ_NOT_FOUND", "Sales RFQ not found.");
  return serializeSalesRfq(rfq);
}

export async function assignSalesRfq(input: { id: string; userId: string; actorUserId: string; request: Request }) {
  return runSerializableTransaction(async (tx) => {
    const current = await tx.salesRfq.findUnique({ where: { id: input.id }, include: salesRfqDetailInclude });
    if (!current) throw new BusinessNetworkError(404, "SALES_RFQ_NOT_FOUND", "Sales RFQ not found.");
    if (
      current.status !== SalesRfqStatus.SUBMITTED &&
      current.status !== SalesRfqStatus.UNDER_REVIEW
    ) {
      throw new BusinessNetworkError(409, "SALES_RFQ_NOT_ASSIGNABLE", "Only submitted or under-review sales RFQs can be assigned.");
    }
    const assignee = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true, banned: true } });
    if (!assignee || assignee.banned === true) {
      throw new BusinessNetworkError(404, "RFQ_ASSIGNEE_NOT_FOUND", "The selected active internal user was not found.");
    }
    if (current.status === SalesRfqStatus.SUBMITTED) {
      assertSalesRfqTransition(current.status, SalesRfqStatus.UNDER_REVIEW);
    }
    const updated = await tx.salesRfq.update({
      where: { id: current.id },
      data: { assignedToUserId: assignee.id, status: SalesRfqStatus.UNDER_REVIEW },
      include: salesRfqDetailInclude,
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: current.organizationId,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.salesRfqAssigned,
      entityType: "SalesRfq",
      entityId: current.id,
      before: current,
      after: updated,
    });
    return serializeSalesRfq(updated);
  });
}

async function transitionAdminSalesRfq(input: {
  id: string;
  nextStatus: "REJECTED" | "CLOSED";
  actorUserId: string;
  request: Request;
  reason?: string;
}) {
  return runSerializableTransaction(async (tx) => {
    const current = await tx.salesRfq.findUnique({ where: { id: input.id }, include: salesRfqDetailInclude });
    if (!current) throw new BusinessNetworkError(404, "SALES_RFQ_NOT_FOUND", "Sales RFQ not found.");
    assertSalesRfqTransition(current.status, input.nextStatus);
    const updated = await tx.salesRfq.update({
      where: { id: current.id },
      data: { status: input.nextStatus, closedAt: new Date() },
      include: salesRfqDetailInclude,
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: current.organizationId,
      actorUserId: input.actorUserId,
      action: input.nextStatus === SalesRfqStatus.REJECTED
        ? BUSINESS_AUDIT_ACTIONS.salesRfqRejected
        : BUSINESS_AUDIT_ACTIONS.salesRfqClosed,
      entityType: "SalesRfq",
      entityId: current.id,
      before: current,
      after: input.reason ? { rfq: updated, reason: input.reason } : updated,
    });
    return serializeSalesRfq(updated);
  });
}

export function rejectSalesRfq(input: { id: string; reason: string; actorUserId: string; request: Request }) {
  return transitionAdminSalesRfq({ ...input, nextStatus: SalesRfqStatus.REJECTED });
}

export function closeSalesRfq(input: { id: string; actorUserId: string; request: Request }) {
  return transitionAdminSalesRfq({ ...input, nextStatus: SalesRfqStatus.CLOSED });
}
