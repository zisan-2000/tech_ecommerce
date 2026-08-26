import "server-only";

import {
  Prisma,
  SalesQuotationStatus,
  SalesQuotationVersionStatus,
  SalesRfqStatus,
} from "@/generated/prisma";
import { db } from "@/lib/db";
import type { ActiveBusinessContext } from "./types";
import { BUSINESS_AUDIT_ACTIONS, writeBusinessAudit } from "./audit";
import { BusinessNetworkError } from "./business-error";
import {
  assertQuotationCanCreateVersion,
  assertQuotationValidUntil,
  assertQuotationVersionCanBeIssued,
  assertSalesQuotationTransition,
  formatSalesQuotationNumber,
} from "./sales-quotation-core";
import type {
  createSalesQuotationSchema,
  createSalesQuotationVersionSchema,
  salesQuotationItemSchema,
} from "./sales-quotation-schemas";
import { runSerializableTransaction } from "./transaction";
import type { z } from "zod";

type QuotationItemInput = z.infer<typeof salesQuotationItemSchema>;
type CreateQuotationInput = z.infer<typeof createSalesQuotationSchema>;
type CreateVersionInput = z.infer<typeof createSalesQuotationVersionSchema>;

const quotationDetailInclude = {
  organization: {
    select: {
      id: true,
      code: true,
      legalName: true,
      displayName: true,
      status: true,
      currency: true,
    },
  },
  salesRfq: {
    select: {
      id: true,
      rfqNumber: true,
      subject: true,
      status: true,
      requestedDelivery: true,
      quotationDueAt: true,
    },
  },
  versions: {
    orderBy: [{ versionNumber: "desc" as const }],
    include: {
      items: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
    },
  },
} satisfies Prisma.SalesQuotationInclude;

type QuotationDetail = Prisma.SalesQuotationGetPayload<{
  include: typeof quotationDetailInclude;
}>;

function serializeQuotation(quotation: QuotationDetail) {
  return {
    ...quotation,
    versions: quotation.versions.map((version) => ({
      ...version,
      subtotal: version.subtotal.toFixed(2),
      discountTotal: version.discountTotal.toFixed(2),
      vatTotal: version.vatTotal.toFixed(2),
      shippingTotal: version.shippingTotal.toFixed(2),
      grandTotal: version.grandTotal.toFixed(2),
      items: version.items.map((item) => ({
        ...item,
        publicUnitPrice: item.publicUnitPrice?.toFixed(2) ?? null,
        unitPrice: item.unitPrice.toFixed(2),
        discountAmount: item.discountAmount.toFixed(2),
        vatAmount: item.vatAmount.toFixed(2),
        lineTotal: item.lineTotal.toFixed(2),
      })),
    })),
  };
}

async function assertActiveCorporateAccount(
  organizationId: string,
  tx: Prisma.TransactionClient | typeof db = db,
) {
  const account = await tx.businessAccount.findUnique({
    where: { organizationId },
    select: {
      status: true,
      organization: {
        select: {
          status: true,
          currency: true,
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
      "An active business account and CORPORATE_BUYER capability are required for quotations.",
    );
  }
  return account;
}

const money = (value: string | number | Prisma.Decimal) =>
  new Prisma.Decimal(value).toDecimalPlaces(2);

async function snapshotQuotationItems(
  tx: Prisma.TransactionClient,
  items: QuotationItemInput[],
) {
  const productIds = [...new Set(items.flatMap((item) => item.productId ? [item.productId] : []))];
  const variantIds = [...new Set(items.flatMap((item) => item.variantId ? [item.variantId] : []))];
  const [products, variants] = await Promise.all([
    productIds.length
      ? tx.product.findMany({
          where: { id: { in: productIds }, deleted: false },
          select: { id: true, name: true, sku: true, basePrice: true },
        })
      : [],
    variantIds.length
      ? tx.productVariant.findMany({
          where: { id: { in: variantIds }, active: true, product: { deleted: false } },
          select: {
            id: true,
            productId: true,
            sku: true,
            price: true,
            product: { select: { name: true } },
          },
        })
      : [],
  ]);
  const productMap = new Map(products.map((product) => [product.id, product]));
  const variantMap = new Map(variants.map((variant) => [variant.id, variant]));
  const linkedKeys = new Set<string>();

  const snapshots = items.map((item) => {
    const variant = item.variantId ? variantMap.get(item.variantId) : null;
    if (item.variantId && !variant) {
      throw new BusinessNetworkError(404, "QUOTATION_VARIANT_NOT_FOUND", "A selected catalog variant is unavailable.");
    }
    const resolvedProductId = variant?.productId ?? item.productId ?? null;
    if (variant && item.productId && item.productId !== variant.productId) {
      throw new BusinessNetworkError(422, "QUOTATION_VARIANT_PRODUCT_MISMATCH", "A selected variant does not belong to the selected product.");
    }
    const product = resolvedProductId ? productMap.get(resolvedProductId) : null;
    if (resolvedProductId && !product && !variant) {
      throw new BusinessNetworkError(404, "QUOTATION_PRODUCT_NOT_FOUND", "A selected catalog product is unavailable.");
    }
    if (resolvedProductId) {
      const key = `${resolvedProductId}:${variant?.id ?? "product"}`;
      if (linkedKeys.has(key)) {
        throw new BusinessNetworkError(422, "DUPLICATE_QUOTATION_ITEM", "Duplicate catalog items are not allowed in one quotation version.");
      }
      linkedKeys.add(key);
    }

    const unitPrice = money(item.unitPrice);
    const discountAmount = money(item.discountAmount);
    const vatAmount = money(item.vatAmount);
    const gross = unitPrice.mul(item.quantity);
    if (discountAmount.greaterThan(gross)) {
      throw new BusinessNetworkError(422, "QUOTATION_DISCOUNT_EXCEEDS_GROSS", "An item discount cannot exceed its gross amount.");
    }
    const lineTotal = gross.minus(discountAmount).plus(vatAmount).toDecimalPlaces(2);
    return {
      productId: resolvedProductId,
      variantId: variant?.id ?? null,
      productName: variant?.product.name ?? product?.name ?? item.productName?.trim() ?? "",
      skuSnapshot: variant?.sku ?? product?.sku ?? item.skuSnapshot ?? null,
      quantity: item.quantity,
      publicUnitPrice: variant?.price
        ?? product?.basePrice
        ?? (item.publicUnitPrice == null ? null : money(item.publicUnitPrice)),
      unitPrice,
      discountAmount,
      vatAmount,
      lineTotal,
      gross,
    };
  });

  const subtotal = snapshots.reduce((total, item) => total.plus(item.gross), money(0));
  const discountTotal = snapshots.reduce((total, item) => total.plus(item.discountAmount), money(0));
  const vatTotal = snapshots.reduce((total, item) => total.plus(item.vatAmount), money(0));
  return {
    items: snapshots.map(({ gross: _gross, ...item }) => item),
    subtotal: subtotal.toDecimalPlaces(2),
    discountTotal: discountTotal.toDecimalPlaces(2),
    vatTotal: vatTotal.toDecimalPlaces(2),
  };
}

async function buildVersionData(
  tx: Prisma.TransactionClient,
  input: CreateQuotationInput["version"] | CreateVersionInput,
  versionNumber: number,
  actorUserId: string,
) {
  const snapshot = await snapshotQuotationItems(tx, input.items);
  const shippingTotal = money(input.shippingTotal);
  const grandTotal = snapshot.subtotal
    .minus(snapshot.discountTotal)
    .plus(snapshot.vatTotal)
    .plus(shippingTotal)
    .toDecimalPlaces(2);
  return {
    versionNumber,
    subtotal: snapshot.subtotal,
    discountTotal: snapshot.discountTotal,
    vatTotal: snapshot.vatTotal,
    shippingTotal,
    grandTotal,
    currency: input.currency,
    paymentTerms: input.paymentTerms ?? null,
    deliveryTerms: input.deliveryTerms ?? null,
    warrantyTerms: input.warrantyTerms ?? null,
    notes: input.notes ?? null,
    pdfUrl: input.pdfUrl ?? null,
    createdById: actorUserId,
    items: { create: snapshot.items },
  };
}

async function nextQuotationNumber(tx: Prisma.TransactionClient, now: Date) {
  const rows = await tx.$queryRaw<Array<{ value: bigint }>>`
    SELECT nextval('"SalesQuotationNumber_seq"') AS value
  `;
  const value = rows[0]?.value;
  if (!value) {
    throw new BusinessNetworkError(503, "QUOTATION_NUMBER_UNAVAILABLE", "Could not allocate a quotation number.");
  }
  return formatSalesQuotationNumber(value, now);
}

async function findQuotation(
  tx: Prisma.TransactionClient | typeof db,
  id: string,
  organizationId?: string,
) {
  const quotation = await tx.salesQuotation.findFirst({
    where: { id, ...(organizationId ? { organizationId } : {}) },
    include: quotationDetailInclude,
  });
  if (!quotation) {
    throw new BusinessNetworkError(404, "SALES_QUOTATION_NOT_FOUND", "Sales quotation not found.");
  }
  return quotation;
}

function currentVersion(quotation: QuotationDetail) {
  const version = quotation.versions.find((item) => item.isCurrent);
  if (!version) {
    throw new BusinessNetworkError(409, "CURRENT_QUOTATION_VERSION_MISSING", "The quotation has no current version.");
  }
  return version;
}

export async function createSalesQuotation(input: {
  data: CreateQuotationInput;
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    await assertActiveCorporateAccount(input.data.organizationId, tx);
    assertQuotationValidUntil(input.data.validUntil, new Date(), true);
    if (input.data.salesRfqId) {
      const rfq = await tx.salesRfq.findFirst({
        where: { id: input.data.salesRfqId, organizationId: input.data.organizationId },
        select: { id: true, status: true },
      });
      if (!rfq) {
        throw new BusinessNetworkError(404, "SALES_RFQ_NOT_FOUND", "The linked sales RFQ was not found for this organization.");
      }
      if (rfq.status !== SalesRfqStatus.UNDER_REVIEW) {
        throw new BusinessNetworkError(409, "SALES_RFQ_NOT_QUOTABLE", "Only an under-review sales RFQ can receive its first quotation.");
      }
    }
    const now = new Date();
    const versionData = await buildVersionData(tx, input.data.version, 1, input.actorUserId);
    const quotation = await tx.salesQuotation.create({
      data: {
        quotationNumber: await nextQuotationNumber(tx, now),
        organizationId: input.data.organizationId,
        salesRfqId: input.data.salesRfqId ?? null,
        validUntil: input.data.validUntil ?? null,
        createdById: input.actorUserId,
        versions: { create: versionData },
      },
      include: quotationDetailInclude,
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: quotation.organizationId,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.salesQuotationCreated,
      entityType: "SalesQuotation",
      entityId: quotation.id,
      after: quotation,
    });
    return serializeQuotation(quotation);
  });
}

export async function createSalesQuotationVersion(input: {
  id: string;
  data: CreateVersionInput;
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const quotation = await findQuotation(tx, input.id);
    assertQuotationCanCreateVersion(quotation.status);
    const nextValidUntil = input.data.validUntil === undefined
      ? quotation.validUntil
      : input.data.validUntil;
    assertQuotationValidUntil(nextValidUntil, new Date(), true);
    const current = currentVersion(quotation);
    const nextNumber = Math.max(...quotation.versions.map((version) => version.versionNumber)) + 1;
    const versionData = await buildVersionData(tx, input.data, nextNumber, input.actorUserId);

    await tx.salesQuotationVersion.update({
      where: { id: current.id },
      data: { isCurrent: false, status: SalesQuotationVersionStatus.SUPERSEDED },
    });
    await tx.salesQuotation.update({
      where: { id: quotation.id },
      data: {
        status: SalesQuotationStatus.DRAFT,
        validUntil: nextValidUntil,
        approvedById: null,
        approvedAt: null,
        sentAt: null,
        viewedAt: null,
        acceptedAt: null,
        rejectedAt: null,
        versions: { create: versionData },
      },
    });
    const updated = await findQuotation(tx, quotation.id);
    const createdVersion = currentVersion(updated);
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: quotation.organizationId,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.salesQuotationVersionCreated,
      entityType: "SalesQuotationVersion",
      entityId: createdVersion.id,
      before: quotation,
      after: updated,
    });
    return serializeQuotation(updated);
  });
}

export async function listAdminSalesQuotations(input: {
  page: number;
  limit: number;
  search: string;
  status?: SalesQuotationStatus;
  organizationId?: string;
  salesRfqId?: string;
}) {
  const where: Prisma.SalesQuotationWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    ...(input.salesRfqId ? { salesRfqId: input.salesRfqId } : {}),
    ...(input.search ? { OR: [
      { quotationNumber: { contains: input.search, mode: "insensitive" } },
      { organization: { legalName: { contains: input.search, mode: "insensitive" } } },
      { organization: { displayName: { contains: input.search, mode: "insensitive" } } },
      { salesRfq: { rfqNumber: { contains: input.search, mode: "insensitive" } } },
    ] } : {}),
  };
  const [items, total] = await Promise.all([
    db.salesQuotation.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        organization: { select: { id: true, code: true, legalName: true, displayName: true } },
        salesRfq: { select: { id: true, rfqNumber: true, subject: true } },
        versions: {
          where: { isCurrent: true },
          select: { versionNumber: true, grandTotal: true, currency: true, status: true },
          take: 1,
        },
      },
    }),
    db.salesQuotation.count({ where }),
  ]);
  return {
    items: items.map((item) => ({
      ...item,
      versions: item.versions.map((version) => ({
        ...version,
        grandTotal: version.grandTotal.toFixed(2),
      })),
    })),
    pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) },
  };
}

export async function getAdminSalesQuotation(id: string) {
  return serializeQuotation(await findQuotation(db, id));
}

async function updateAdminWorkflow(input: {
  id: string;
  action: "submit" | "approve" | "send" | "cancel";
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const quotation = await findQuotation(tx, input.id);
    const version = currentVersion(quotation);
    const now = new Date();
    let nextStatus: SalesQuotationStatus;
    if (input.action === "submit") {
      nextStatus = SalesQuotationStatus.INTERNAL_REVIEW;
      assertSalesQuotationTransition(quotation.status, nextStatus);
      if (version.status !== SalesQuotationVersionStatus.DRAFT || version.items.length === 0) {
        throw new BusinessNetworkError(409, "QUOTATION_DRAFT_INCOMPLETE", "A current draft with at least one item is required for review.");
      }
    } else if (input.action === "approve") {
      if (quotation.status !== SalesQuotationStatus.INTERNAL_REVIEW) {
        throw new BusinessNetworkError(409, "QUOTATION_NOT_REVIEWABLE", "Only an internally reviewed quotation can be approved.");
      }
      if (quotation.approvedAt) {
        throw new BusinessNetworkError(409, "QUOTATION_ALREADY_APPROVED", "This quotation is already approved.");
      }
      assertQuotationVersionCanBeIssued(version.status, version.isCurrent);
      const updated = await tx.salesQuotation.update({
        where: { id: quotation.id },
        data: { approvedAt: now, approvedById: input.actorUserId },
        include: quotationDetailInclude,
      });
      await writeBusinessAudit({
        tx,
        request: input.request,
        organizationId: quotation.organizationId,
        actorUserId: input.actorUserId,
        action: BUSINESS_AUDIT_ACTIONS.salesQuotationApproved,
        entityType: "SalesQuotation",
        entityId: quotation.id,
        before: quotation,
        after: updated,
      });
      return serializeQuotation(updated);
    } else if (input.action === "send") {
      nextStatus = SalesQuotationStatus.SENT;
      assertSalesQuotationTransition(quotation.status, nextStatus);
      if (!quotation.approvedAt || !quotation.approvedById) {
        throw new BusinessNetworkError(409, "QUOTATION_APPROVAL_REQUIRED", "The quotation must be approved before it is sent.");
      }
      assertQuotationValidUntil(quotation.validUntil, now, true);
      assertQuotationVersionCanBeIssued(version.status, version.isCurrent);
      await tx.salesQuotationVersion.update({
        where: { id: version.id },
        data: { status: SalesQuotationVersionStatus.ISSUED, issuedAt: now },
      });
      if (quotation.salesRfqId) {
        const rfq = await tx.salesRfq.findUnique({
          where: { id: quotation.salesRfqId },
          select: { status: true },
        });
        if (!rfq || (rfq.status !== SalesRfqStatus.UNDER_REVIEW && rfq.status !== SalesRfqStatus.QUOTED)) {
          throw new BusinessNetworkError(409, "LINKED_RFQ_NOT_QUOTABLE", "The linked sales RFQ can no longer receive a quotation.");
        }
        if (rfq.status === SalesRfqStatus.UNDER_REVIEW) {
          await tx.salesRfq.update({
            where: { id: quotation.salesRfqId },
            data: { status: SalesRfqStatus.QUOTED },
          });
        }
      }
    } else {
      nextStatus = SalesQuotationStatus.CANCELLED;
      assertSalesQuotationTransition(quotation.status, nextStatus);
    }

    const updated = await tx.salesQuotation.update({
      where: { id: quotation.id },
      data: {
        status: nextStatus,
        ...(input.action === "send" ? { sentAt: now } : {}),
      },
      include: quotationDetailInclude,
    });
    const action = input.action === "submit"
      ? BUSINESS_AUDIT_ACTIONS.salesQuotationSubmittedReview
      : input.action === "send"
        ? BUSINESS_AUDIT_ACTIONS.salesQuotationSent
        : BUSINESS_AUDIT_ACTIONS.salesQuotationCancelled;
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: quotation.organizationId,
      actorUserId: input.actorUserId,
      action,
      entityType: "SalesQuotation",
      entityId: quotation.id,
      before: quotation,
      after: updated,
    });
    return serializeQuotation(updated);
  });
}

export const submitSalesQuotationReview = (input: Omit<Parameters<typeof updateAdminWorkflow>[0], "action">) =>
  updateAdminWorkflow({ ...input, action: "submit" });
export const approveSalesQuotation = (input: Omit<Parameters<typeof updateAdminWorkflow>[0], "action">) =>
  updateAdminWorkflow({ ...input, action: "approve" });
export const sendSalesQuotation = (input: Omit<Parameters<typeof updateAdminWorkflow>[0], "action">) =>
  updateAdminWorkflow({ ...input, action: "send" });
export const cancelSalesQuotation = (input: Omit<Parameters<typeof updateAdminWorkflow>[0], "action">) =>
  updateAdminWorkflow({ ...input, action: "cancel" });

const PORTAL_VISIBLE_STATUSES: SalesQuotationStatus[] = [
  SalesQuotationStatus.SENT,
  SalesQuotationStatus.VIEWED,
  SalesQuotationStatus.ACCEPTED,
  SalesQuotationStatus.REJECTED,
  SalesQuotationStatus.EXPIRED,
];

export async function listPortalSalesQuotations(input: {
  context: ActiveBusinessContext;
  page: number;
  limit: number;
  search: string;
  status?: SalesQuotationStatus;
}) {
  const organizationId = input.context.activeMembership.organization.id;
  if (input.status && !PORTAL_VISIBLE_STATUSES.includes(input.status)) {
    throw new BusinessNetworkError(422, "QUOTATION_STATUS_NOT_VISIBLE", "That quotation status is not available in the customer portal.");
  }
  const where: Prisma.SalesQuotationWhereInput = {
    organizationId,
    status: input.status ?? { in: PORTAL_VISIBLE_STATUSES },
    ...(input.search ? { OR: [
      { quotationNumber: { contains: input.search, mode: "insensitive" } },
      { salesRfq: { rfqNumber: { contains: input.search, mode: "insensitive" } } },
      { salesRfq: { subject: { contains: input.search, mode: "insensitive" } } },
    ] } : {}),
  };
  const [items, total] = await Promise.all([
    db.salesQuotation.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: [{ sentAt: "desc" }, { id: "desc" }],
      include: {
        salesRfq: { select: { id: true, rfqNumber: true, subject: true } },
        versions: {
          where: { isCurrent: true },
          select: { versionNumber: true, grandTotal: true, currency: true, status: true },
          take: 1,
        },
      },
    }),
    db.salesQuotation.count({ where }),
  ]);
  return {
    items: items.map((item) => ({
      ...item,
      versions: item.versions.map((version) => ({ ...version, grandTotal: version.grandTotal.toFixed(2) })),
    })),
    pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) },
  };
}

async function findPortalQuotation(
  tx: Prisma.TransactionClient | typeof db,
  id: string,
  organizationId: string,
) {
  const quotation = await findQuotation(tx, id, organizationId);
  if (!PORTAL_VISIBLE_STATUSES.includes(quotation.status)) {
    throw new BusinessNetworkError(404, "SALES_QUOTATION_NOT_FOUND", "Sales quotation not found.");
  }
  return quotation;
}

export async function getPortalSalesQuotation(context: ActiveBusinessContext, id: string) {
  return serializeQuotation(await findPortalQuotation(db, id, context.activeMembership.organization.id));
}

async function expirePortalQuotationIfNeeded(input: {
  context: ActiveBusinessContext;
  id: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const quotation = await findPortalQuotation(
      tx,
      input.id,
      input.context.activeMembership.organization.id,
    );
    if (
      !quotation.validUntil ||
      quotation.validUntil > new Date() ||
      (quotation.status !== SalesQuotationStatus.SENT && quotation.status !== SalesQuotationStatus.VIEWED)
    ) return false;
    assertSalesQuotationTransition(quotation.status, SalesQuotationStatus.EXPIRED);
    const version = currentVersion(quotation);
    await tx.salesQuotationVersion.update({
      where: { id: version.id },
      data: { status: SalesQuotationVersionStatus.EXPIRED },
    });
    const updated = await tx.salesQuotation.update({
      where: { id: quotation.id },
      data: { status: SalesQuotationStatus.EXPIRED },
      include: quotationDetailInclude,
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: quotation.organizationId,
      memberId: input.context.activeMembership.memberId,
      actorUserId: input.context.user.id,
      action: BUSINESS_AUDIT_ACTIONS.salesQuotationExpired,
      entityType: "SalesQuotation",
      entityId: quotation.id,
      before: quotation,
      after: updated,
    });
    return true;
  });
}

async function runPortalQuotationAction(input: {
  context: ActiveBusinessContext;
  id: string;
  action: "view" | "accept" | "reject";
  request: Request;
  reason?: string;
}) {
  if (await expirePortalQuotationIfNeeded(input)) {
    throw new BusinessNetworkError(409, "QUOTATION_EXPIRED", "This quotation has expired.");
  }
  return runSerializableTransaction(async (tx) => {
    const quotation = await findPortalQuotation(
      tx,
      input.id,
      input.context.activeMembership.organization.id,
    );
    if (input.action === "view" && quotation.status === SalesQuotationStatus.VIEWED) {
      return serializeQuotation(quotation);
    }
    const nextStatus = input.action === "view"
      ? SalesQuotationStatus.VIEWED
      : input.action === "accept"
        ? SalesQuotationStatus.ACCEPTED
        : SalesQuotationStatus.REJECTED;
    assertSalesQuotationTransition(quotation.status, nextStatus);
    const now = new Date();
    const version = currentVersion(quotation);
    const versionStatus = input.action === "accept"
      ? SalesQuotationVersionStatus.ACCEPTED
      : input.action === "reject"
        ? SalesQuotationVersionStatus.REJECTED
        : null;
    if (versionStatus) {
      await tx.salesQuotationVersion.update({
        where: { id: version.id },
        data: {
          status: versionStatus,
          ...(input.action === "accept" ? { acceptedAt: now } : {}),
        },
      });
    }
    const updated = await tx.salesQuotation.update({
      where: { id: quotation.id },
      data: {
        status: nextStatus,
        ...(input.action === "view" ? { viewedAt: now } : {}),
        ...(input.action === "accept" ? { acceptedAt: now } : {}),
        ...(input.action === "reject" ? { rejectedAt: now } : {}),
      },
      include: quotationDetailInclude,
    });
    const action = input.action === "view"
      ? BUSINESS_AUDIT_ACTIONS.salesQuotationViewed
      : input.action === "accept"
        ? BUSINESS_AUDIT_ACTIONS.salesQuotationAccepted
        : BUSINESS_AUDIT_ACTIONS.salesQuotationRejected;
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: quotation.organizationId,
      memberId: input.context.activeMembership.memberId,
      actorUserId: input.context.user.id,
      action,
      entityType: "SalesQuotation",
      entityId: quotation.id,
      before: quotation,
      after: input.reason ? { quotation: updated, reason: input.reason } : updated,
    });
    return serializeQuotation(updated);
  });
}

export const viewSalesQuotation = (input: Omit<Parameters<typeof runPortalQuotationAction>[0], "action">) =>
  runPortalQuotationAction({ ...input, action: "view" });
export const acceptSalesQuotation = (input: Omit<Parameters<typeof runPortalQuotationAction>[0], "action">) =>
  runPortalQuotationAction({ ...input, action: "accept" });
export const rejectSalesQuotation = (input: Omit<Parameters<typeof runPortalQuotationAction>[0], "action">) =>
  runPortalQuotationAction({ ...input, action: "reject" });
