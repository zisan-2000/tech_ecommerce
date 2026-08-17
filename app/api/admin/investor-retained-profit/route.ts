import { Prisma, type InvestorProfitRunStatus } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";

function canReadRetainedProfit(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return (
    access.hasGlobal("investor_profit.read") ||
    access.hasGlobal("investor_profit.manage") ||
    access.hasGlobal("investor_profit.approve") ||
    access.hasGlobal("investor_profit.post") ||
    access.hasGlobal("investor_statement.read") ||
    access.hasGlobal("investor_payout.read") ||
    access.hasGlobal("investor_payout.manage")
  );
}

function asDecimal(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  if (value instanceof Prisma.Decimal) return value;
  return new Prisma.Decimal(value);
}

function parseDateStart(value: string | null) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateEndExclusive(value: string | null) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed;
}

function formatRunSummary(run: {
  id: number;
  runNumber: string;
  fromDate: Date;
  toDate: Date;
  status: string;
  totalNetRevenue: Prisma.Decimal;
  totalNetProfit: Prisma.Decimal;
  postedAt: Date | null;
  variantLines: Array<{
    id: number;
    unallocatedSharePct: Prisma.Decimal;
    netRevenue: Prisma.Decimal;
    netProfit: Prisma.Decimal;
  }>;
}) {
  const retainedLines = run.variantLines.filter((line) =>
    asDecimal(line.unallocatedSharePct).gt(0),
  );
  const retainedRevenue = retainedLines.reduce(
    (sum, line) => sum.plus(asDecimal(line.netRevenue).mul(asDecimal(line.unallocatedSharePct))),
    new Prisma.Decimal(0),
  );
  const retainedProfit = retainedLines.reduce(
    (sum, line) => sum.plus(asDecimal(line.netProfit).mul(asDecimal(line.unallocatedSharePct))),
    new Prisma.Decimal(0),
  );
  const retainedShareTotal = retainedLines.reduce(
    (sum, line) => sum.plus(asDecimal(line.unallocatedSharePct)),
    new Prisma.Decimal(0),
  );

  return {
    id: run.id,
    runNumber: run.runNumber,
    fromDate: run.fromDate.toISOString(),
    toDate: run.toDate.toISOString(),
    status: run.status,
    postedAt: run.postedAt?.toISOString() ?? null,
    totalNetRevenue: run.totalNetRevenue.toString(),
    totalNetProfit: run.totalNetProfit.toString(),
    retainedVariantCount: retainedLines.length,
    retainedShareTotal: retainedShareTotal.toString(),
    retainedRevenue: retainedRevenue.toString(),
    retainedProfit: retainedProfit.toString(),
  };
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
    if (!canReadRetainedProfit(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const from = parseDateStart(request.nextUrl.searchParams.get("from"));
    const toExclusive = parseDateEndExclusive(
      request.nextUrl.searchParams.get("to"),
    );
    const status = request.nextUrl.searchParams.get("status")?.trim() || "";
    const runId = Number(request.nextUrl.searchParams.get("runId") || "");

    const where: Prisma.InvestorProfitRunWhereInput = {};
    if (status) {
      where.status = status as InvestorProfitRunStatus;
    }
    if (from || toExclusive) {
      where.AND = [
        ...(from
          ? [
              {
                toDate: {
                  gte: from,
                },
              },
            ]
          : []),
        ...(toExclusive
          ? [
              {
                fromDate: {
                  lt: toExclusive,
                },
              },
            ]
          : []),
      ];
    }

    const runs = await prisma.investorProfitRun.findMany({
      where,
      orderBy: [{ fromDate: "desc" }, { id: "desc" }],
      take: 48,
      include: {
        variantLines: {
          select: {
            id: true,
            unallocatedSharePct: true,
            netRevenue: true,
            netProfit: true,
          },
        },
      },
    });

    const runSummaries = runs.map((run) => formatRunSummary(run));
    const selectedRunId =
      Number.isInteger(runId) && runId > 0
        ? runId
        : runSummaries.find((item) => item.retainedVariantCount > 0)?.id ??
          runSummaries[0]?.id ??
          null;

    const selectedRun =
      selectedRunId !== null
        ? await prisma.investorProfitRun.findUnique({
            where: { id: selectedRunId },
            include: {
              variantLines: {
                where: {
                  unallocatedSharePct: {
                    gt: 0,
                  },
                },
                orderBy: [{ netProfit: "desc" }, { id: "asc" }],
                include: {
                  productVariant: {
                    select: {
                      id: true,
                      sku: true,
                      product: {
                        select: {
                          id: true,
                          name: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          })
        : null;

    const summary = runSummaries.reduce(
      (acc, run) => {
        acc.totalRuns += 1;
        if (run.retainedVariantCount > 0) {
          acc.runsWithRetainedProfit += 1;
        }
        acc.retainedVariantCount += run.retainedVariantCount;
        acc.totalRetainedRevenue = acc.totalRetainedRevenue.plus(
          new Prisma.Decimal(run.retainedRevenue),
        );
        acc.totalRetainedProfit = acc.totalRetainedProfit.plus(
          new Prisma.Decimal(run.retainedProfit),
        );
        return acc;
      },
      {
        totalRuns: 0,
        runsWithRetainedProfit: 0,
        retainedVariantCount: 0,
        totalRetainedRevenue: new Prisma.Decimal(0),
        totalRetainedProfit: new Prisma.Decimal(0),
      },
    );

    return NextResponse.json({
      filters: {
        from: request.nextUrl.searchParams.get("from") || "",
        to: request.nextUrl.searchParams.get("to") || "",
        status,
      },
      summary: {
        totalRuns: summary.totalRuns,
        runsWithRetainedProfit: summary.runsWithRetainedProfit,
        retainedVariantCount: summary.retainedVariantCount,
        totalRetainedRevenue: summary.totalRetainedRevenue.toString(),
        totalRetainedProfit: summary.totalRetainedProfit.toString(),
      },
      runs: runSummaries,
      selectedRunId,
      selectedRun:
        selectedRun && selectedRun.variantLines.length > 0
          ? {
              id: selectedRun.id,
              runNumber: selectedRun.runNumber,
              fromDate: selectedRun.fromDate.toISOString(),
              toDate: selectedRun.toDate.toISOString(),
              status: selectedRun.status,
              postedAt: selectedRun.postedAt?.toISOString() ?? null,
              totalNetRevenue: selectedRun.totalNetRevenue.toString(),
              totalNetProfit: selectedRun.totalNetProfit.toString(),
              retainedLines: selectedRun.variantLines.map((line) => ({
                id: line.id,
                sku: line.productVariant.sku,
                productName: line.productVariant.product.name,
                netRevenue: line.netRevenue.toString(),
                netProfit: line.netProfit.toString(),
                retainedSharePct: line.unallocatedSharePct.toString(),
                retainedRevenue: asDecimal(line.netRevenue)
                  .mul(asDecimal(line.unallocatedSharePct))
                  .toString(),
                retainedProfit: asDecimal(line.netProfit)
                  .mul(asDecimal(line.unallocatedSharePct))
                  .toString(),
              })),
            }
          : null,
    });
  } catch (error) {
    console.error("ADMIN INVESTOR RETAINED PROFIT GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load retained profit reporting." },
      { status: 500 },
    );
  }
}
