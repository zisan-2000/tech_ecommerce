import "server-only";

import { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import type { ActiveBusinessContext } from "@/lib/business-network/types";
import { BusinessNetworkError } from "@/lib/business-network/business-error";

type ListQuery = { page: number; limit: number; search: string };

function pagination(page: number, limit: number, total: number) {
  return { page, limit, total, pages: Math.ceil(total / limit) };
}

function serializeOrder<T extends {
  total: Prisma.Decimal;
  shipping_cost: Prisma.Decimal;
  grand_total: Prisma.Decimal;
  Vat_total: Prisma.Decimal | null;
  discount_total: Prisma.Decimal | null;
}>(order: T) {
  return {
    ...order,
    total: order.total.toFixed(2),
    shipping_cost: order.shipping_cost.toFixed(2),
    grand_total: order.grand_total.toFixed(2),
    Vat_total: order.Vat_total?.toFixed(2) ?? null,
    discount_total: order.discount_total?.toFixed(2) ?? null,
  };
}

export async function listPortalOrders(context: ActiveBusinessContext, query: ListQuery) {
  const organizationId = context.activeMembership.organization.id;
  const where: Prisma.OrderWhereInput = {
    organizationId,
    ...(query.search
      ? {
          OR: [
            { id: /^\d+$/.test(query.search) ? Number(query.search) : undefined },
            { transactionId: { contains: query.search, mode: "insensitive" as const } },
            { customerPurchaseOrder: { customerPoNumber: { contains: query.search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.order.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: [{ order_date: "desc" }, { id: "desc" }],
      include: {
        customerPurchaseOrder: { select: { id: true, customerPoNumber: true } },
        orderItems: { select: { id: true, quantity: true, product: { select: { name: true } } }, take: 3 },
        payments: { select: { id: true, amount: true, currency: true, status: true, provider: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    db.order.count({ where }),
  ]);
  return {
    items: items.map((item) => ({
      ...serializeOrder(item),
      payments: item.payments.map((payment) => ({ ...payment, amount: payment.amount?.toFixed(2) ?? null })),
    })),
    pagination: pagination(query.page, query.limit, total),
  };
}

export async function getPortalOrder(context: ActiveBusinessContext, id: number) {
  const item = await db.order.findFirst({
    where: { id, organizationId: context.activeMembership.organization.id },
    include: {
      customerPurchaseOrder: true,
      orderItems: true,
      payments: { orderBy: { createdAt: "desc" } },
      shipments: true,
    },
  });
  if (!item) throw new BusinessNetworkError(404, "BUSINESS_ORDER_NOT_FOUND", "Business order not found.");
  return {
    ...serializeOrder(item),
    orderItems: item.orderItems.map((line) => ({
      ...line,
      price: line.price.toFixed(2),
      VatAmount: line.VatAmount?.toFixed(2) ?? null,
      discountAmount: line.discountAmount?.toFixed(2) ?? null,
      costPriceSnapshot: line.costPriceSnapshot?.toFixed(2) ?? null,
      publicUnitPriceSnapshot: line.publicUnitPriceSnapshot?.toFixed(2) ?? null,
      businessDiscountSnapshot: line.businessDiscountSnapshot?.toFixed(2) ?? null,
    })),
    payments: item.payments.map((payment) => ({ ...payment, amount: payment.amount?.toFixed(2) ?? null })),
  };
}

export async function listPortalInvoices(context: ActiveBusinessContext, query: ListQuery) {
  const result = await listPortalOrders(context, query);
  return {
    items: result.items.map((order) => ({
      id: order.id,
      invoiceNumber: `INV-${String(order.id).padStart(8, "0")}`,
      orderId: order.id,
      issuedAt: order.order_date,
      amount: order.grand_total,
      currency: order.currency,
      status: order.paymentStatus,
      paymentMethod: order.payment_method,
      transactionId: order.transactionId,
    })),
    pagination: result.pagination,
  };
}

export async function getPortalInvoice(context: ActiveBusinessContext, id: number) {
  const order = await getPortalOrder(context, id);
  return {
    ...order,
    invoiceNumber: `INV-${String(order.id).padStart(8, "0")}`,
    invoiceStatus: order.paymentStatus,
  };
}

export async function listPortalReferredOrders(context: ActiveBusinessContext, query: ListQuery) {
  const partner = await db.partnerProfile.findUnique({
    where: { organizationId: context.activeMembership.organization.id },
    select: { id: true },
  });
  if (!partner) throw new BusinessNetworkError(404, "PARTNER_PROFILE_NOT_FOUND", "Partner profile not found.");
  const where: Prisma.PartnerAttributionWhereInput = {
    partnerProfileId: partner.id,
    orderId: { not: null },
    ...(query.search ? { order: { id: /^\d+$/.test(query.search) ? Number(query.search) : undefined } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.partnerAttribution.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: [{ convertedAt: "desc" }, { capturedAt: "desc" }],
      include: {
        order: { select: { id: true, status: true, paymentStatus: true, grand_total: true, currency: true, order_date: true } },
        asset: { select: { id: true, campaignName: true, code: true } },
      },
    }),
    db.partnerAttribution.count({ where }),
  ]);
  return {
    items: rows.map((row) => ({
      ...row,
      order: row.order ? { ...row.order, grand_total: row.order.grand_total.toFixed(2) } : null,
    })),
    pagination: pagination(query.page, query.limit, total),
  };
}

export async function getOrganizationPortalData(
  context: ActiveBusinessContext,
  resource: "profile" | "branches" | "addresses" | "documents",
) {
  const organizationId = context.activeMembership.organization.id;
  if (resource === "profile") {
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true, code: true, legalName: true, displayName: true, companyType: true,
        status: true, email: true, phone: true, website: true, tradeLicenseNo: true,
        tin: true, bin: true, registrationNo: true, country: true, currency: true,
        verifiedAt: true, createdAt: true,
        capabilities: { orderBy: { type: "asc" }, select: { type: true, status: true, approvedAt: true } },
        businessAccount: { select: { accountNumber: true, status: true, paymentTermDays: true, allowCredit: true, requirePo: true } },
      },
    });
    if (!organization) throw new BusinessNetworkError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
    return { organization };
  }
  if (resource === "branches") {
    return { items: await db.organizationBranch.findMany({ where: { organizationId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }) };
  }
  if (resource === "addresses") {
    return { items: await db.organizationAddress.findMany({ where: { organizationId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }) };
  }
  return { items: await db.organizationDocument.findMany({ where: { organizationId }, orderBy: [{ createdAt: "desc" }] }) };
}
