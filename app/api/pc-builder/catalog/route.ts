import { NextRequest, NextResponse } from "next/server";
import { PC_BUILDER_SLOTS, type PcBuilderSlotKey } from "@/lib/pc-builder";
import {
  PC_BUILDER_CATALOG_CURSOR_MAX_LENGTH,
  PC_BUILDER_CATALOG_QUERY_MAX_LENGTH,
  normalizePcBuilderCatalogQuery,
  parsePcBuilderCatalogCursor,
  parsePcBuilderCatalogPageSize,
} from "@/lib/pc-builder-catalog";
import { rateLimitRequest } from "@/lib/request-security";
import { searchPcBuilderCatalogPage } from "@/lib/storefront-pc-builder";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;
const VALID_SLOTS = new Set<PcBuilderSlotKey>(PC_BUILDER_SLOTS.map((slot) => slot.key));

export async function GET(request: NextRequest) {
  try {
    const rateLimit = await rateLimitRequest(request, {
      scope: "pc-builder-catalog-search",
      limit: 60,
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many PC Builder catalog requests. Please try again shortly." },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            "Retry-After": String(rateLimit.retryAfter),
          },
        },
      );
    }

    const { searchParams } = new URL(request.url);
    const slot = searchParams.get("slot") as PcBuilderSlotKey | null;
    if (!slot || !VALID_SLOTS.has(slot)) {
      return NextResponse.json(
        { error: "A valid PC Builder slot is required" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const rawQuery = searchParams.get("q") ?? "";
    if (rawQuery.length > PC_BUILDER_CATALOG_QUERY_MAX_LENGTH) {
      return NextResponse.json(
        { error: "Search query is too long" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const rawCursor = searchParams.get("cursor");
    if (rawCursor && rawCursor.length > PC_BUILDER_CATALOG_CURSOR_MAX_LENGTH) {
      return NextResponse.json(
        { error: "Catalog cursor is invalid" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
    const cursor = rawCursor ? parsePcBuilderCatalogCursor(rawCursor) : null;
    if (rawCursor && !cursor) {
      return NextResponse.json(
        { error: "Catalog cursor is invalid" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const pageSize = parsePcBuilderCatalogPageSize(searchParams.get("limit"));
    const query = normalizePcBuilderCatalogQuery(rawQuery);
    const result = await searchPcBuilderCatalogPage({ slot, query, cursor, pageSize });

    return NextResponse.json(result, {
      headers: {
        ...NO_STORE_HEADERS,
        "X-RateLimit-Remaining": String(rateLimit.remaining),
      },
    });
  } catch (error) {
    console.error("PC Builder catalog search failed", error);
    return NextResponse.json(
      { error: "PC Builder components could not be loaded" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
