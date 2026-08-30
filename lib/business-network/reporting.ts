import "server-only";

import { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import {
  parseBusinessReportExportSection,
  parseBusinessReportQuery,
  type BusinessReportExportSection,
} from "./reporting-schemas";

type TrendRow = {
  bucket: Date;
  orders: number;
  revenue: Prisma.Decimal;
  paidRevenue: Prisma.Decimal;
};

type PartnerPerformanceRow = {
  id: string;
  partnerCode: string;
  legalName: string;
  conversions: number;
  attributedRevenue: Prisma.Decimal;
  leads: number;
  wonLeads: number;
  commission: Prisma.Decimal;
};

const money = (value: Prisma.Decimal | number | bigint | null | undefined) =>
  value === null || value === undefined ? "0.00" : new Prisma.Decimal(value.toString()).toFixed(2);

const percentage = (numerator: number, denominator: number) =>
  denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(2)) : 0;

const change = (current: Prisma.Decimal | number, previous: Prisma.Decimal | number) => {
  const currentValue = Number(current.toString());
  const previousValue = Number(previous.toString());
  if (previousValue === 0) return currentValue === 0 ? 0 : null;
  return Number((((currentValue - previousValue) / previousValue) * 100).toFixed(2));
};

function statusRows<T extends { status: string; _count: { _all: number } }>(rows: T[]) {
  return rows.map((row) => ({ status: row.status, count: row._count._all }));
}

export async function getBusinessNetworkReport(url: URL) {
  const input = parseBusinessReportQuery(url);
  const currentOrderWhere: Prisma.OrderWhereInput = {
    organizationId: { not: null },
    currency: input.currency,
    order_date: { gte: input.fromDate, lt: input.toExclusive },
  };
  const previousOrderWhere: Prisma.OrderWhereInput = {
    organizationId: { not: null },
    currency: input.currency,
    order_date: { gte: input.previousFrom, lt: input.previousToExclusive },
  };
  const currentCreatedAt = { gte: input.fromDate, lt: input.toExclusive };

  const [
    currentOrders,
    previousOrders,
    paidOrders,
    trend,
    orderStatuses,
    rfqStatuses,
    quotationStatuses,
    commissionStatuses,
    settlementStatuses,
    riskStatuses,
    riskSeverities,
    newOrganizations,
    activeOrganizations,
    activePartners,
    creditTotals,
    topOrganizationGroups,
    creditExposure,
    partnerPerformance,
  ] = await Promise.all([
    db.order.aggregate({ where: currentOrderWhere, _count: { id: true }, _sum: { grand_total: true }, _avg: { grand_total: true } }),
    db.order.aggregate({ where: previousOrderWhere, _count: { id: true }, _sum: { grand_total: true } }),
    db.order.aggregate({ where: { ...currentOrderWhere, paymentStatus: "PAID" }, _sum: { grand_total: true } }),
    db.$queryRaw<TrendRow[]>(Prisma.sql`
      SELECT
        date_trunc(${input.granularity}, "order_date" AT TIME ZONE 'Asia/Dhaka')::date AS bucket,
        COUNT(*)::int AS orders,
        COALESCE(SUM("grand_total"), 0)::numeric AS revenue,
        COALESCE(SUM("grand_total") FILTER (WHERE "paymentStatus" = 'PAID'), 0)::numeric AS "paidRevenue"
      FROM "Order"
      WHERE "organizationId" IS NOT NULL
        AND currency = ${input.currency}
        AND "order_date" >= ${input.fromDate}
        AND "order_date" < ${input.toExclusive}
      GROUP BY 1
      ORDER BY 1 ASC
    `),
    db.order.groupBy({ by: ["status"], where: currentOrderWhere, _count: { _all: true } }),
    db.salesRfq.groupBy({ by: ["status"], where: { createdAt: currentCreatedAt }, _count: { _all: true } }),
    db.salesQuotation.groupBy({ by: ["status"], where: { createdAt: currentCreatedAt }, _count: { _all: true } }),
    db.commissionEntry.groupBy({ by: ["status"], where: { currency: input.currency, createdAt: currentCreatedAt }, _count: { _all: true }, _sum: { amount: true } }),
    db.partnerSettlement.groupBy({ by: ["status"], where: { currency: input.currency, createdAt: currentCreatedAt }, _count: { _all: true }, _sum: { netPayable: true } }),
    db.businessRiskCase.groupBy({ by: ["status"], where: { detectedAt: currentCreatedAt }, _count: { _all: true } }),
    db.businessRiskCase.groupBy({ by: ["severity"], where: { detectedAt: currentCreatedAt }, _count: { _all: true } }),
    db.organization.count({ where: { createdAt: currentCreatedAt } }),
    db.organization.count({ where: { status: "ACTIVE" } }),
    db.partnerProfile.count({ where: { status: "ACTIVE" } }),
    db.organizationCreditAccount.aggregate({ where: { isActive: true, currency: input.currency }, _count: { id: true }, _sum: { creditLimit: true, currentBalance: true } }),
    db.order.groupBy({
      by: ["organizationId"],
      where: currentOrderWhere,
      _count: { id: true },
      _sum: { grand_total: true },
      orderBy: { _sum: { grand_total: "desc" } },
      take: 10,
    }),
    db.organizationCreditAccount.findMany({
      where: { isActive: true, currency: input.currency },
      orderBy: [{ currentBalance: "desc" }, { id: "asc" }],
      take: 10,
      select: {
        id: true,
        creditLimit: true,
        currentBalance: true,
        paymentTermDays: true,
        reviewDate: true,
        businessAccount: { select: { organization: { select: { id: true, code: true, legalName: true } } } },
      },
    }),
    db.$queryRaw<PartnerPerformanceRow[]>(Prisma.sql`
      WITH attribution AS (
        SELECT pa."partnerProfileId" AS id,
          COUNT(*) FILTER (WHERE pa.status = 'CONVERTED')::int AS conversions,
          COALESCE(SUM(o."grand_total") FILTER (WHERE pa.status = 'CONVERTED' AND o.currency = ${input.currency}), 0)::numeric AS revenue
        FROM "PartnerAttribution" pa
        LEFT JOIN "Order" o ON o.id = pa."orderId"
        WHERE pa."convertedAt" >= ${input.fromDate} AND pa."convertedAt" < ${input.toExclusive}
        GROUP BY pa."partnerProfileId"
      ), leads AS (
        SELECT "partnerProfileId" AS id, COUNT(*)::int AS leads,
          COUNT(*) FILTER (WHERE status = 'WON')::int AS won
        FROM "PartnerLead"
        WHERE "createdAt" >= ${input.fromDate} AND "createdAt" < ${input.toExclusive}
        GROUP BY "partnerProfileId"
      ), commissions AS (
        SELECT "partnerProfileId" AS id, COALESCE(SUM(amount), 0)::numeric AS amount
        FROM "CommissionEntry"
        WHERE currency = ${input.currency} AND "createdAt" >= ${input.fromDate} AND "createdAt" < ${input.toExclusive}
        GROUP BY "partnerProfileId"
      )
      SELECT pp.id, pp."partnerCode", org."legalName",
        COALESCE(a.conversions, 0)::int AS conversions,
        COALESCE(a.revenue, 0)::numeric AS "attributedRevenue",
        COALESCE(l.leads, 0)::int AS leads,
        COALESCE(l.won, 0)::int AS "wonLeads",
        COALESCE(c.amount, 0)::numeric AS commission
      FROM "PartnerProfile" pp
      JOIN "Organization" org ON org.id = pp."organizationId"
      LEFT JOIN attribution a ON a.id = pp.id
      LEFT JOIN leads l ON l.id = pp.id
      LEFT JOIN commissions c ON c.id = pp.id
      WHERE COALESCE(a.conversions, 0) > 0 OR COALESCE(l.leads, 0) > 0 OR COALESCE(c.amount, 0) <> 0
      ORDER BY COALESCE(a.revenue, 0) DESC, COALESCE(l.won, 0) DESC, pp.id ASC
      LIMIT 10
    `),
  ]);

  const organizationIds = topOrganizationGroups.flatMap((row) => row.organizationId ? [row.organizationId] : []);
  const organizations = organizationIds.length
    ? await db.organization.findMany({ where: { id: { in: organizationIds } }, select: { id: true, code: true, legalName: true } })
    : [];
  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));
  const quotationTotal = quotationStatuses.reduce((total, row) => total + row._count._all, 0);
  const acceptedQuotations = quotationStatuses.find((row) => row.status === "ACCEPTED")?._count._all ?? 0;
  const totalCredit = creditTotals._sum.creditLimit ?? new Prisma.Decimal(0);
  const usedCredit = creditTotals._sum.currentBalance ?? new Prisma.Decimal(0);
  const commissionTotal = commissionStatuses.reduce((total, row) => total.plus(row._sum.amount ?? 0), new Prisma.Decimal(0));
  const settlementPaid = settlementStatuses.find((row) => row.status === "PAID")?._sum.netPayable ?? new Prisma.Decimal(0);
  const openRiskCases = riskStatuses
    .filter((row) => ["OPEN", "UNDER_REVIEW", "CONFIRMED"].includes(row.status))
    .reduce((total, row) => total + row._count._all, 0);

  return {
    meta: {
      from: input.from,
      to: input.to,
      granularity: input.granularity,
      currency: input.currency,
      timezone: input.timezone,
      inclusiveDays: input.inclusiveDays,
      generatedAt: new Date().toISOString(),
    },
    kpis: {
      orderCount: currentOrders._count.id,
      orderCountChange: change(currentOrders._count.id, previousOrders._count.id),
      orderRevenue: money(currentOrders._sum.grand_total),
      orderRevenueChange: change(currentOrders._sum.grand_total ?? 0, previousOrders._sum.grand_total ?? 0),
      averageOrderValue: money(currentOrders._avg.grand_total),
      paidRevenue: money(paidOrders._sum.grand_total),
      newOrganizations,
      activeOrganizations,
      activePartners,
      quotationConversionRate: percentage(acceptedQuotations, quotationTotal),
      commissionExpense: money(commissionTotal),
      settlementPaid: money(settlementPaid),
      openRiskCases,
    },
    trend: trend.map((row) => ({
      bucket: row.bucket.toISOString().slice(0, 10),
      orders: Number(row.orders),
      revenue: money(row.revenue),
      paidRevenue: money(row.paidRevenue),
    })),
    pipeline: {
      orders: statusRows(orderStatuses),
      rfqs: statusRows(rfqStatuses),
      quotations: statusRows(quotationStatuses),
      commissions: commissionStatuses.map((row) => ({ status: row.status, count: row._count._all, amount: money(row._sum.amount) })),
      settlements: settlementStatuses.map((row) => ({ status: row.status, count: row._count._all, amount: money(row._sum.netPayable) })),
    },
    topOrganizations: topOrganizationGroups.map((row) => {
      const organization = row.organizationId ? organizationById.get(row.organizationId) : null;
      return {
        id: row.organizationId,
        code: organization?.code ?? "—",
        legalName: organization?.legalName ?? "Unknown organization",
        orders: row._count.id,
        revenue: money(row._sum.grand_total),
      };
    }),
    partnerPerformance: partnerPerformance.map((row) => ({
      ...row,
      conversions: Number(row.conversions),
      attributedRevenue: money(row.attributedRevenue),
      leads: Number(row.leads),
      wonLeads: Number(row.wonLeads),
      leadConversionRate: percentage(Number(row.wonLeads), Number(row.leads)),
      commission: money(row.commission),
    })),
    credit: {
      accounts: creditTotals._count.id,
      limit: money(totalCredit),
      outstanding: money(usedCredit),
      available: money(totalCredit.minus(usedCredit)),
      utilizationRate: percentage(Number(usedCredit), Number(totalCredit)),
      exposure: creditExposure.map((row) => ({
        id: row.id,
        organizationId: row.businessAccount.organization.id,
        organizationCode: row.businessAccount.organization.code,
        legalName: row.businessAccount.organization.legalName,
        limit: money(row.creditLimit),
        outstanding: money(row.currentBalance),
        utilizationRate: percentage(Number(row.currentBalance), Number(row.creditLimit)),
        paymentTermDays: row.paymentTermDays,
        reviewDate: row.reviewDate?.toISOString() ?? null,
      })),
    },
    risk: {
      statuses: statusRows(riskStatuses),
      severities: riskSeverities.map((row) => ({ severity: row.severity, count: row._count._all })),
    },
  };
}

function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function csv(rows: unknown[][]) {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export async function exportBusinessNetworkReport(url: URL) {
  const section = parseBusinessReportExportSection(url);
  const report = await getBusinessNetworkReport(url);
  const rows = reportExportRows(section, report);
  return {
    content: csv(rows),
    filename: `business-network-${section}-${report.meta.from}-to-${report.meta.to}.csv`,
  };
}

function reportExportRows(section: BusinessReportExportSection, report: Awaited<ReturnType<typeof getBusinessNetworkReport>>): unknown[][] {
  if (section === "organizations") {
    return [["Organization code", "Organization", "Orders", `Revenue (${report.meta.currency})`], ...report.topOrganizations.map((row) => [row.code, row.legalName, row.orders, row.revenue])];
  }
  if (section === "partners") {
    return [["Partner code", "Partner", "Conversions", `Attributed revenue (${report.meta.currency})`, "Leads", "Won leads", "Lead conversion %", `Commission (${report.meta.currency})`], ...report.partnerPerformance.map((row) => [row.partnerCode, row.legalName, row.conversions, row.attributedRevenue, row.leads, row.wonLeads, row.leadConversionRate, row.commission])];
  }
  if (section === "credit") {
    return [["Organization code", "Organization", `Limit (${report.meta.currency})`, `Outstanding (${report.meta.currency})`, "Utilization %", "Payment terms (days)", "Review date"], ...report.credit.exposure.map((row) => [row.organizationCode, row.legalName, row.limit, row.outstanding, row.utilizationRate, row.paymentTermDays, row.reviewDate])];
  }
  if (section === "pipeline") {
    return [["Area", "Status", "Count", `Amount (${report.meta.currency})`], ...Object.entries(report.pipeline).flatMap(([area, values]) => values.map((row) => [area, row.status, row.count, "amount" in row ? row.amount : ""]))];
  }
  return [
    ["Metric", "Value", "Period from", "Period to", "Currency"],
    ["Corporate orders", report.kpis.orderCount, report.meta.from, report.meta.to, report.meta.currency],
    ["Corporate revenue", report.kpis.orderRevenue, report.meta.from, report.meta.to, report.meta.currency],
    ["Average order value", report.kpis.averageOrderValue, report.meta.from, report.meta.to, report.meta.currency],
    ["Paid revenue", report.kpis.paidRevenue, report.meta.from, report.meta.to, report.meta.currency],
    ["New organizations", report.kpis.newOrganizations, report.meta.from, report.meta.to, ""],
    ["Active partners", report.kpis.activePartners, report.meta.from, report.meta.to, ""],
    ["Quotation conversion %", report.kpis.quotationConversionRate, report.meta.from, report.meta.to, ""],
    ["Commission expense", report.kpis.commissionExpense, report.meta.from, report.meta.to, report.meta.currency],
    ["Settlements paid", report.kpis.settlementPaid, report.meta.from, report.meta.to, report.meta.currency],
    ["Open risk cases", report.kpis.openRiskCases, report.meta.from, report.meta.to, ""],
  ];
}
