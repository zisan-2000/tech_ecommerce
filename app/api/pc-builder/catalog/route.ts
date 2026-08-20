import { NextRequest, NextResponse } from "next/server";
import { PC_BUILDER_SLOTS, type PcBuilderSlotKey } from "@/lib/pc-builder";
import {
  PC_BUILDER_CATALOG_QUERY_MAX_LENGTH,
  normalizePcBuilderCatalogQuery,
  parsePcBuilderCatalogPage,
  parsePcBuilderCatalogPageSize,
} from "@/lib/pc-builder-catalog";
import { searchPcBuilderCatalogPage } from "@/lib/storefront-pc-builder";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;
const VALID_SLOTS = new Set<PcBuilderSlotKey>(PC_BUILDER_SLOTS.map((slot) => slot.key));

export async function GET(request: NextRequest) {
  try {
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

    const page = parsePcBuilderCatalogPage(searchParams.get("page"));
    const pageSize = parsePcBuilderCatalogPageSize(searchParams.get("limit"));
    const query = normalizePcBuilderCatalogQuery(rawQuery);
    const result = await searchPcBuilderCatalogPage({ slot, query, page, pageSize });

    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("PC Builder catalog search failed", error);
    return NextResponse.json(
      { error: "PC Builder components could not be loaded" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
