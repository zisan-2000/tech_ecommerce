import {
  Prisma,
  type SupplierSlaActionStatus,
  type SupplierSlaDisputeStatus,
  type SupplierSlaTerminationCaseStatus,
} from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";

const SLA_ANALYTICS_READ_PERMISSIONS = ["sla.read", "sla.manage"] as const;
const ACTIVE_ACTION_STATUSES: SupplierSlaActionStatus[] = ["OPEN", "IN_PROGRESS"];
const ACTIVE_DISPUTE_STATUSES: SupplierSlaDisputeStatus[] = ["OPEN", "UNDER_REVIEW"];
const ACTIVE_TERMINATION_CASE_STATUSES: SupplierSlaTerminationCaseStatus[] = [
  "OPEN",
  "IN_REVIEW",
  "APPROVED",
];

function canRead(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return SLA_ANALYTICS_READ_PERMISSIONS.some((permission) => access.hasGlobal(permission));
}

function clampInt(value: number, min: number, max: number, fallback: number) {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function toDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toJsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJsonSafe(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toJsonSafe(entry)]),
    );
  }
  return value;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canRead(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supplierIdRaw = Number(request.nextUrl.searchParams.get("supplierId") || "");
    const supplierId =
      Number.isInteger(supplierIdRaw) && supplierIdRaw > 0 ? supplierIdRaw : null;
    const daysRaw = Number(request.nextUrl.searchParams.get("days") || "90");
    const days = clampInt(daysRaw, 7, 365, 90);
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - days);

    const [
      breaches,
      invoices,
      entries,
      termCases,
      alertActivities,
    ] = await Promise.all([
      prisma.supplierSlaBreach.findMany({
        where: {
          evaluationDate: { gte: from },
          ...(supplierId ? { supplierId } : {}),
        },
        orderBy: [{ evaluationDate: "desc" }, { id: "desc" }],
        select: {
          id: true,
          supplierId: true,
          evaluationDate: true,
          status: true,
          severity: true,
          actionStatus: true,
          dueDate: true,
          disputeStatus: true,
          supplier: {
            select: { id: true, name: true, code: true },
          },
        },
      }),
      prisma.supplierInvoice.findMany({
        where: {
          ...(supplierId ? { supplierId } : {}),
          postedAt: { gte: from },
        },
        select: {
          id: true,
          status: true,
          paymentHoldStatus: true,
          slaCreditStatus: true,
          slaRecommendedCredit: true,
        },
      }),
      prisma.supplierLedgerEntry.findMany({
        where: {
          ...(supplierId ? { supplierId } : {}),
          entryDate: { gte: from },
          referenceType: {
            in: ["SLA_CREDIT", "SLA_AUTO_CREDIT"],
          },
        },
        select: {
          amount: true,
          referenceType: true,
        },
      }),
      prisma.supplierSlaTerminationCase.findMany({
        where: {
          ...(supplierId ? { supplierId } : {}),
          createdAt: { gte: from },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          status: true,
          recommendedAction: true,
          openBreachCount: true,
          criticalBreachCount: true,
          lookbackDays: true,
          reason: true,
          ownerUserId: true,
          reviewedAt: true,
          resolvedAt: true,
          createdAt: true,
          supplier: {
            select: { id: true, name: true, code: true },
          },
        },
        take: 100,
      }),
      prisma.activityLog.findMany({
        where: {
          entity: {
            in: ["supplier_sla_alert", "supplier_sla_notification"],
          },
          createdAt: { gte: from },
        },
        select: {
          id: true,
          action: true,
          entity: true,
          createdAt: true,
          metadata: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 200,
      }),
    ]);

    const overdueActions = breaches.filter(
      (row) => ACTIVE_ACTION_STATUSES.includes(row.actionStatus) && row.dueDate && row.dueDate < now,
    );
    const openActions = breaches.filter((row) => ACTIVE_ACTION_STATUSES.includes(row.actionStatus));
    const openDisputes = breaches.filter((row) => ACTIVE_DISPUTE_STATUSES.includes(row.disputeStatus));
    const breachCount = breaches.filter((row) => row.status === "BREACH").length;
    const warningCount = breaches.filter((row) => row.status === "WARNING").length;
    const criticalBreachCount = breaches.filter(
      (row) => row.status === "BREACH" && row.severity === "CRITICAL",
    ).length;

    const trendMap = new Map<
      string,
      {
        date: string;
        OK: number;
        WARNING: number;
        BREACH: number;
      }
    >();
    for (const row of breaches) {
      const date = toDateKey(row.evaluationDate);
      const current = trendMap.get(date) ?? { date, OK: 0, WARNING: 0, BREACH: 0 };
      current[row.status] += 1;
      trendMap.set(date, current);
    }
    const trends = [...trendMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    const supplierStats = new Map<
      number,
      {
        supplierId: number;
        supplierName: string;
        supplierCode: string;
        evaluations: number;
        warningCount: number;
        breachCount: number;
        criticalCount: number;
        openActions: number;
        openDisputes: number;
        lastEvaluationAt: string | null;
      }
    >();
    for (const row of breaches) {
      const current = supplierStats.get(row.supplierId) ?? {
        supplierId: row.supplierId,
        supplierName: row.supplier.name,
        supplierCode: row.supplier.code,
        evaluations: 0,
        warningCount: 0,
        breachCount: 0,
        criticalCount: 0,
        openActions: 0,
        openDisputes: 0,
        lastEvaluationAt: null,
      };
      current.evaluations += 1;
      if (row.status === "WARNING") current.warningCount += 1;
      if (row.status === "BREACH") current.breachCount += 1;
      if (row.status === "BREACH" && row.severity === "CRITICAL") current.criticalCount += 1;
      if (ACTIVE_ACTION_STATUSES.includes(row.actionStatus)) current.openActions += 1;
      if (ACTIVE_DISPUTE_STATUSES.includes(row.disputeStatus)) current.openDisputes += 1;
      if (!current.lastEvaluationAt || row.evaluationDate.toISOString() > current.lastEvaluationAt) {
        current.lastEvaluationAt = row.evaluationDate.toISOString();
      }
      supplierStats.set(row.supplierId, current);
    }
    const topSuppliers = [...supplierStats.values()]
      .sort((a, b) => b.breachCount - a.breachCount || b.warningCount - a.warningCount)
      .slice(0, 10);

    const heldInvoiceCount = invoices.filter((row) => row.paymentHoldStatus === "HELD").length;
    const overriddenInvoiceCount = invoices.filter(
      (row) => row.paymentHoldStatus === "OVERRIDDEN",
    ).length;
    const recommendedCreditAmount = invoices
      .filter((row) => row.slaCreditStatus === "RECOMMENDED")
      .reduce((sum, row) => sum.plus(row.slaRecommendedCredit), new Prisma.Decimal(0));
    const waivedCreditCount = invoices.filter((row) => row.slaCreditStatus === "WAIVED").length;

    const autoCreditAmount = entries
      .filter((row) => row.referenceType === "SLA_AUTO_CREDIT")
      .reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
    const manualCreditAmount = entries
      .filter((row) => row.referenceType === "SLA_CREDIT")
      .reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
    const totalAppliedCreditAmount = autoCreditAmount.plus(manualCreditAmount);

    const openTerminationCases = termCases.filter((row) =>
      ACTIVE_TERMINATION_CASE_STATUSES.includes(row.status),
    );

    const payload = {
      range: {
        from: from.toISOString(),
        to: now.toISOString(),
        days,
        supplierId,
      },
      summary: {
        totalEvaluations: breaches.length,
        warningCount,
        breachCount,
        criticalBreachCount,
        openActionCount: openActions.length,
        overdueActionCount: overdueActions.length,
        openDisputeCount: openDisputes.length,
        openTerminationCaseCount: openTerminationCases.length,
        heldInvoiceCount,
        overriddenInvoiceCount,
        recommendedCreditAmount: recommendedCreditAmount.toString(),
        appliedCreditAmount: totalAppliedCreditAmount.toString(),
        autoAppliedCreditAmount: autoCreditAmount.toString(),
        manualAppliedCreditAmount: manualCreditAmount.toString(),
        waivedCreditCount,
        notificationEventCount: alertActivities.length,
      },
      trends,
      topSuppliers,
      overdueActions: overdueActions.slice(0, 25).map((row) => ({
        id: row.id,
        supplierId: row.supplierId,
        supplierName: row.supplier.name,
        supplierCode: row.supplier.code,
        status: row.status,
        severity: row.severity,
        actionStatus: row.actionStatus,
        dueDate: row.dueDate?.toISOString() ?? null,
      })),
      terminationCases: termCases.slice(0, 25).map((row) => ({
        id: row.id,
        supplierId: row.supplier.id,
        supplierName: row.supplier.name,
        supplierCode: row.supplier.code,
        status: row.status,
        recommendedAction: row.recommendedAction,
        openBreachCount: row.openBreachCount,
        criticalBreachCount: row.criticalBreachCount,
        lookbackDays: row.lookbackDays,
        reason: row.reason,
        ownerUserId: row.ownerUserId,
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      recentNotificationEvents: alertActivities.slice(0, 20).map((row) => ({
        id: row.id,
        action: row.action,
        entity: row.entity,
        createdAt: row.createdAt.toISOString(),
      })),
    };

    return NextResponse.json(toJsonSafe(payload));
  } catch (error) {
    console.error("SCM SLA ANALYTICS GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load SLA analytics." }, { status: 500 });
  }
}
