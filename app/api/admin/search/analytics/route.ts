import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { requireSearchAdmin } from "@/lib/search/admin-access";

export const dynamic = "force-dynamic";

type QueryMetric = {
  query: string;
  normalizedQuery: string;
  searches: bigint;
  zeroResults: bigint;
  clicks: bigint;
  addToCarts: bigint;
};

export async function GET(request: Request) {
  const auth = await requireSearchAdmin(true);
  if (auth.response) return auth.response;
  const { searchParams } = new URL(request.url);
  const requestedDays = Number(searchParams.get("days") ?? 30);
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  try {
    const [eventCounts, queryRows] = await Promise.all([
      prisma.searchEvent.groupBy({
        by: ["event"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.$queryRaw<QueryMetric[]>(Prisma.sql`
        SELECT
          max(se."query") AS "query",
          se."normalizedQuery",
          count(*) FILTER (WHERE se."event" = 'SEARCH_SUBMITTED')::bigint AS "searches",
          count(*) FILTER (WHERE se."event" = 'ZERO_RESULTS')::bigint AS "zeroResults",
          count(*) FILTER (WHERE se."event" IN ('SUGGESTION_CLICKED', 'RESULT_CLICKED'))::bigint AS "clicks",
          count(*) FILTER (WHERE se."event" = 'ADD_TO_CART')::bigint AS "addToCarts"
        FROM "SearchEvent" se
        WHERE se."createdAt" >= ${since}
        GROUP BY se."normalizedQuery"
        ORDER BY "searches" DESC, "clicks" DESC, "normalizedQuery" ASC
        LIMIT 100
      `),
    ]);
    const counts = Object.fromEntries(
      eventCounts.map((row) => [row.event, row._count._all]),
    );
    const searches = Number(counts.SEARCH_SUBMITTED ?? 0);
    const zeroResults = Number(counts.ZERO_RESULTS ?? 0);
    const clicks = Number(counts.SUGGESTION_CLICKED ?? 0) + Number(counts.RESULT_CLICKED ?? 0);
    return NextResponse.json({
      days,
      kpis: {
        searches,
        zeroResults,
        zeroResultRate: searches ? Number(((zeroResults / searches) * 100).toFixed(2)) : 0,
        clicks,
        clickThroughRate: searches ? Number(((clicks / searches) * 100).toFixed(2)) : 0,
        addToCarts: Number(counts.ADD_TO_CART ?? 0),
      },
      queries: queryRows.map((row) => ({
        query: row.query,
        normalizedQuery: row.normalizedQuery,
        searches: Number(row.searches),
        zeroResults: Number(row.zeroResults),
        clicks: Number(row.clicks),
        addToCarts: Number(row.addToCarts),
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Search analytics read failed", error);
    return NextResponse.json(
      { error: "Search analytics are unavailable. Apply the latest Prisma migration." },
      { status: 503 },
    );
  }
}
