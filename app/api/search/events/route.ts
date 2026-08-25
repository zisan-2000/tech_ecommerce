import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { Prisma, SearchEventType } from "@/generated/prisma";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeSearchQuery, sanitizeSearchEventText } from "@/lib/search/core";
import { rateLimitRequest } from "@/lib/request-security";

const ALLOWED_EVENTS = new Set<SearchEventType>(Object.values(SearchEventType));
const QUERY_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

function optionalPositiveInt(value: unknown, max = 1_000_000) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) return null;
  return parsed;
}

function boundedJsonObject(value: unknown, maxBytes: number): Prisma.InputJsonValue | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > maxBytes) return undefined;
    return JSON.parse(serialized) as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  try {
    const rateLimit = await rateLimitRequest(request, {
      scope: "storefront-search-events",
      limit: 180,
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Rate limit exceeded." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } },
      );
    }
    const body = await request.json().catch(() => null);
    const event = sanitizeSearchEventText(body?.event, 40) as SearchEventType;
    const query = sanitizeSearchEventText(body?.query, 100);
    if (!ALLOWED_EVENTS.has(event) || query.length < 2) {
      return NextResponse.json({ ok: false, error: "Invalid search event." }, { status: 400 });
    }
    const rawQueryId = sanitizeSearchEventText(body?.queryId, 64);
    const queryId = QUERY_ID_PATTERN.test(rawQueryId) ? rawQueryId : null;
    let authenticatedUserId: string | null = null;
    try {
      const session = await getServerSession(authOptions);
      authenticatedUserId =
        typeof session?.user?.id === "string" ? session.user.id : null;
    } catch (error) {
      // A transient auth/session failure must not prevent anonymous telemetry.
      console.warn("Search analytics could not resolve the current session", error);
    }
    await prisma.searchEvent.create({
      data: {
        event,
        queryId,
        query,
        normalizedQuery: normalizeSearchQuery(query).toLocaleLowerCase("en-US"),
        resultCount: optionalPositiveInt(body?.resultCount),
        productId: optionalPositiveInt(body?.productId),
        position: optionalPositiveInt(body?.position, 10_000),
        visitorId: sanitizeSearchEventText(body?.visitorId, 100) || null,
        sessionId: sanitizeSearchEventText(body?.sessionId, 100) || null,
        userId: authenticatedUserId,
        filters: boundedJsonObject(body?.filters, 4_000),
        metadata: boundedJsonObject(body?.metadata, 4_000),
      },
    });
    return NextResponse.json(
      { ok: true },
      { status: 202, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Search analytics collection failed", error);
    // Analytics must never block shopping. A 202 response prevents client retry storms.
    return NextResponse.json(
      { ok: false },
      { status: 202, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
