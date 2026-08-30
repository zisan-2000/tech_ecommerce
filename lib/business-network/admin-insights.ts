import "server-only";

import { OrderStatus, type Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";

const pageInput = (url: URL) => ({
  page: Math.max(1, Number(url.searchParams.get("page")) || 1),
  limit: Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 25)),
  search: (url.searchParams.get("search") || "").trim().slice(0, 160),
});

export async function getBusinessNetworkOverview() {
  const [
    organizations,
    pendingOrganizations,
    activeAccounts,
    openRfqs,
    activePartners,
    pendingPurchaseOrders,
    payableCommission,
    pendingSettlements,
    recentActivity,
  ] = await Promise.all([
    db.organization.count(),
    db.organization.count({ where: { status: "PENDING_VERIFICATION" } }),
    db.businessAccount.count({ where: { status: "ACTIVE" } }),
    db.salesRfq.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "QUOTED"] } } }),
    db.partnerProfile.count({ where: { status: "ACTIVE" } }),
    db.customerPurchaseOrder.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
    db.commissionEntry.aggregate({ where: { status: "APPROVED", settlementLine: null }, _sum: { amount: true } }),
    db.partnerSettlement.count({ where: { status: { in: ["DRAFT", "SUBMITTED", "APPROVED", "PROCESSING", "FAILED"] } } }),
    db.businessAuditLog.findMany({
      take: 12,
      orderBy: { createdAt: "desc" },
      select: { id: true, action: true, entityType: true, entityId: true, organizationId: true, actorUserId: true, createdAt: true },
    }),
  ]);
  return {
    metrics: {
      organizations,
      pendingOrganizations,
      activeAccounts,
      openRfqs,
      activePartners,
      pendingPurchaseOrders,
      payableCommission: payableCommission._sum.amount?.toFixed(2) ?? "0.00",
      pendingSettlements,
    },
    recentActivity: recentActivity.map((row) => ({ ...row, id: row.id.toString() })),
  };
}

export async function listBusinessOrders(url: URL) {
  const input = pageInput(url);
  const requestedStatus = url.searchParams.get("status")?.trim().toUpperCase() || null;
  const status = requestedStatus && Object.values(OrderStatus).includes(requestedStatus as OrderStatus)
    ? requestedStatus as OrderStatus
    : null;
  const where: Prisma.OrderWhereInput = {
    organizationId: { not: null },
    ...(status ? { status } : {}),
    ...(input.search
      ? {
          OR: [
            { name: { contains: input.search, mode: "insensitive" } },
            { email: { contains: input.search, mode: "insensitive" } },
            { phone_number: { contains: input.search, mode: "insensitive" } },
            { organization: { legalName: { contains: input.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.order.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: [{ order_date: "desc" }, { id: "desc" }],
      select: {
        id: true, name: true, email: true, phone_number: true, order_date: true,
        grand_total: true, currency: true, status: true, paymentStatus: true,
        salesChannel: true, organizationId: true,
        organization: { select: { id: true, code: true, legalName: true } },
        customerPurchaseOrder: { select: { id: true, customerPoNumber: true, status: true } },
        _count: { select: { orderItems: true } },
      },
    }),
    db.order.count({ where }),
  ]);
  return {
    items: items.map((item) => ({ ...item, grand_total: item.grand_total.toFixed(2) })),
    pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) },
  };
}

export async function listBusinessAuditLogs(url: URL) {
  const input = pageInput(url);
  const organizationId = url.searchParams.get("organizationId")?.trim().slice(0, 64) || null;
  const action = url.searchParams.get("action")?.trim().slice(0, 120) || null;
  const where: Prisma.BusinessAuditLogWhereInput = {
    ...(organizationId ? { organizationId } : {}),
    ...(action ? { action: { contains: action, mode: "insensitive" } } : {}),
    ...(input.search
      ? { OR: [
          { action: { contains: input.search, mode: "insensitive" } },
          { entityType: { contains: input.search, mode: "insensitive" } },
          { entityId: { contains: input.search, mode: "insensitive" } },
          { organization: { legalName: { contains: input.search, mode: "insensitive" } } },
        ] }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.businessAuditLog.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true, action: true, entityType: true, entityId: true,
        organizationId: true, actorUserId: true, ipHash: true, userAgent: true,
        integrityHash: true, integrityVersion: true, createdAt: true,
        organization: { select: { code: true, legalName: true } },
      },
    }),
    db.businessAuditLog.count({ where }),
  ]);
  return {
    items: items.map((item) => ({ ...item, id: item.id.toString(), ipHash: item.ipHash ? `${item.ipHash.slice(0, 12)}…` : null, integrityHash: `${item.integrityHash.slice(0, 12)}…` })),
    pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) },
  };
}

export async function getBusinessGovernance(kind: "risk" | "disputes" | "reports") {
  if (kind === "reports") {
    const [overview, orderTotals, creditTotals, commissionTotals] = await Promise.all([
      getBusinessNetworkOverview(),
      db.order.aggregate({ where: { organizationId: { not: null } }, _count: { id: true }, _sum: { grand_total: true } }),
      db.organizationCreditAccount.aggregate({ _sum: { creditLimit: true, currentBalance: true } }),
      db.commissionEntry.groupBy({ by: ["status"], _count: { id: true }, _sum: { amount: true } }),
    ]);
    const totalLimit = creditTotals._sum?.creditLimit ?? null;
    const totalOutstanding = creditTotals._sum?.currentBalance ?? null;
    return {
      ...overview,
      financials: {
        businessOrders: orderTotals._count.id,
        businessOrderValue: orderTotals._sum.grand_total?.toFixed(2) ?? "0.00",
        creditLimit: totalLimit?.toFixed(2) ?? "0.00",
        creditOutstanding: totalOutstanding?.toFixed(2) ?? "0.00",
        creditAvailable: totalLimit && totalOutstanding ? totalLimit.minus(totalOutstanding).toFixed(2) : "0.00",
      },
      commission: commissionTotals.map((row) => ({ status: row.status, count: row._count.id, amount: row._sum.amount?.toFixed(2) ?? "0.00" })),
    };
  }

  const [organizations, partners, documents, settlements, purchaseOrders, recentDecisions] = await Promise.all([
    db.organization.findMany({ where: { status: { in: ["PENDING_VERIFICATION", "SUSPENDED", "REJECTED"] } }, take: 50, orderBy: { updatedAt: "desc" }, select: { id: true, code: true, legalName: true, status: true, rejectionReason: true, updatedAt: true } }),
    db.partnerProfile.findMany({ where: { status: { in: ["APPLIED", "UNDER_REVIEW", "SUSPENDED", "REJECTED"] } }, take: 50, orderBy: { updatedAt: "desc" }, select: { id: true, partnerCode: true, status: true, rejectionReason: true, organization: { select: { legalName: true } }, updatedAt: true } }),
    db.organizationDocument.findMany({ where: { status: { in: ["PENDING", "REJECTED", "EXPIRED"] } }, take: 50, orderBy: { updatedAt: "desc" }, select: { id: true, organizationId: true, type: true, status: true, rejectionReason: true, expiresAt: true, organization: { select: { legalName: true } } } }),
    db.partnerSettlement.findMany({ where: { status: { in: ["FAILED", "CANCELLED"] } }, take: 50, orderBy: { updatedAt: "desc" }, select: { id: true, settlementNumber: true, status: true, failureReason: true, updatedAt: true, partnerProfile: { select: { organization: { select: { legalName: true } } } } } }),
    db.customerPurchaseOrder.findMany({ where: { status: { in: ["REJECTED", "CANCELLED"] } }, take: 50, orderBy: { updatedAt: "desc" }, select: { id: true, customerPoNumber: true, status: true, rejectionReason: true, updatedAt: true, organization: { select: { legalName: true } } } }),
    db.businessAuditLog.findMany({ where: { action: { contains: kind === "disputes" ? "REJECT" : "SUSPEND" } }, take: 30, orderBy: { createdAt: "desc" }, select: { id: true, action: true, entityType: true, entityId: true, createdAt: true, organization: { select: { legalName: true } } } }),
  ]);
  return {
    kind,
    organizations,
    partners,
    documents,
    settlements,
    purchaseOrders,
    recentDecisions: recentDecisions.map((row) => ({ ...row, id: row.id.toString() })),
  };
}
