import { NextResponse } from "next/server";
import { getSearchSuggestions } from "@/lib/search/server";
import { normalizeSearchQuery } from "@/lib/search/core";
import { rateLimitRequest } from "@/lib/request-security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const rateLimit = await rateLimitRequest(request, {
      scope: "storefront-search-suggest",
      limit: 120,
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many search requests. Please try again shortly." },
        {
          status: 429,
          headers: {
            "Cache-Control": "private, no-store",
            "Retry-After": String(rateLimit.retryAfter),
          },
        },
      );
    }

    const url = new URL(request.url);
    const query = normalizeSearchQuery(url.searchParams.get("q"));
    const data = await getSearchSuggestions(query, url.searchParams.get("limit"));
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Search-Provider": "postgresql",
        "X-RateLimit-Remaining": String(rateLimit.remaining),
      },
    });
  } catch (error) {
    console.error("Storefront search suggestions failed", error);
    return NextResponse.json(
      { error: "Search is temporarily unavailable." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
