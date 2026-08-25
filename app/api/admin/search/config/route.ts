import { NextResponse } from "next/server";
import { Prisma, SearchRuleMatchType } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { requireSearchAdmin } from "@/lib/search/admin-access";
import { normalizeSearchQuery, sanitizeSearchEventText } from "@/lib/search/core";

export const dynamic = "force-dynamic";

const MATCH_TYPES = new Set(Object.values(SearchRuleMatchType));

function termsFrom(value: unknown) {
  const input = Array.isArray(value) ? value : String(value ?? "").split(",");
  return Array.from(new Set(input.map(normalizeSearchQuery).filter(Boolean))).slice(0, 24);
}

function idsFrom(value: unknown) {
  const input = Array.isArray(value) ? value : String(value ?? "").split(",");
  return Array.from(
    new Set(input.map(Number).filter((id) => Number.isInteger(id) && id > 0)),
  ).slice(0, 24);
}

function optionalDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET() {
  const auth = await requireSearchAdmin(true);
  if (auth.response) return auth.response;
  try {
    const [synonyms, rules, outbox] = await Promise.all([
      prisma.searchSynonym.findMany({ orderBy: [{ active: "desc" }, { updatedAt: "desc" }] }),
      prisma.searchQueryRule.findMany({ orderBy: [{ priority: "desc" }, { updatedAt: "desc" }] }),
      prisma.searchIndexOutbox.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    return NextResponse.json({
      synonyms,
      rules,
      outbox: Object.fromEntries(outbox.map((row) => [row.status, row._count._all])),
      provider: process.env.SEARCH_PROVIDER || "postgresql",
      typesenseConfigured: Boolean(
        process.env.TYPESENSE_HOST && process.env.TYPESENSE_ADMIN_API_KEY,
      ),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Search configuration read failed", error);
    return NextResponse.json(
      { error: "Search tables are unavailable. Apply the latest Prisma migration." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireSearchAdmin(false);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => null);
  try {
    if (body?.kind === "synonym") {
      const label = sanitizeSearchEventText(body.label, 100);
      const terms = termsFrom(body.terms);
      if (!label || terms.length < 2) {
        return NextResponse.json({ error: "A label and at least two unique terms are required." }, { status: 400 });
      }
      const synonym = await prisma.searchSynonym.create({
        data: {
          label,
          terms,
          locale: sanitizeSearchEventText(body.locale, 16) || "en-BD",
          active: body.active !== false,
        },
      });
      return NextResponse.json({ synonym }, { status: 201 });
    }
    if (body?.kind === "rule") {
      const name = sanitizeSearchEventText(body.name, 120);
      const query = normalizeSearchQuery(body.query);
      const matchType = String(body.matchType ?? "CONTAINS") as SearchRuleMatchType;
      if (!name || !query || !MATCH_TYPES.has(matchType)) {
        return NextResponse.json({ error: "A valid rule name, query and match type are required." }, { status: 400 });
      }
      const startsAt = optionalDate(body.startsAt);
      const endsAt = optionalDate(body.endsAt);
      if (startsAt && endsAt && startsAt >= endsAt) {
        return NextResponse.json({ error: "Rule end time must be after its start time." }, { status: 400 });
      }
      const rule = await prisma.searchQueryRule.create({
        data: {
          name,
          query,
          matchType,
          action: {
            pinProductIds: idsFrom(body.pinProductIds),
            boostProductIds: idsFrom(body.boostProductIds),
            suggestedQueries: termsFrom(body.suggestedQueries),
          } satisfies Prisma.InputJsonValue,
          priority: Math.max(-10_000, Math.min(10_000, Math.trunc(Number(body.priority) || 0))),
          active: body.active !== false,
          startsAt,
          endsAt,
        },
      });
      return NextResponse.json({ rule }, { status: 201 });
    }
    return NextResponse.json({ error: "Unknown search configuration kind." }, { status: 400 });
  } catch (error) {
    console.error("Search configuration create failed", error);
    return NextResponse.json({ error: "Could not save search configuration." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireSearchAdmin(false);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id < 1 || !["synonym", "rule"].includes(body?.kind)) {
    return NextResponse.json({ error: "Invalid configuration target." }, { status: 400 });
  }
  try {
    const active = body.active === true;
    if (body.kind === "synonym") {
      const synonym = await prisma.searchSynonym.update({ where: { id }, data: { active } });
      return NextResponse.json({ synonym });
    }
    const rule = await prisma.searchQueryRule.update({ where: { id }, data: { active } });
    return NextResponse.json({ rule });
  } catch (error) {
    console.error("Search configuration update failed", error);
    return NextResponse.json({ error: "Configuration was not updated." }, { status: 404 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireSearchAdmin(false);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id < 1 || !["synonym", "rule"].includes(body?.kind)) {
    return NextResponse.json({ error: "Invalid configuration target." }, { status: 400 });
  }
  try {
    if (body.kind === "synonym") await prisma.searchSynonym.delete({ where: { id } });
    else await prisma.searchQueryRule.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Search configuration delete failed", error);
    return NextResponse.json({ error: "Configuration was not deleted." }, { status: 404 });
  }
}
