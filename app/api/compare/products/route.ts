import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimitRequest } from "@/lib/request-security";

const NO_STORE_HEADERS = { "Cache-Control": "public, max-age=0, must-revalidate" };

export async function GET(request: NextRequest) {
  const rateLimit = await rateLimitRequest(request, {
    scope: "compare-product-search",
    limit: 90,
    windowMs: 5 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many searches. Please try again shortly." },
      {
        status: 429,
        headers: { ...NO_STORE_HEADERS, "Retry-After": String(rateLimit.retryAfter) },
      },
    );
  }

  const query = request.nextUrl.searchParams.get("q")?.trim().slice(0, 80) ?? "";
  const rawCategoryId = Number(request.nextUrl.searchParams.get("categoryId"));
  const categoryId = Number.isInteger(rawCategoryId) && rawCategoryId > 0
    ? rawCategoryId
    : null;

  try {
    const products = await prisma.product.findMany({
      where: {
        deleted: false,
        available: true,
        ...(categoryId ? { categoryId } : {}),
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { sku: { contains: query, mode: "insensitive" } },
                { brand: { name: { contains: query, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: [{ featured: "desc" }, { id: "desc" }],
      take: 16,
      select: {
        id: true,
        name: true,
        slug: true,
        image: true,
        basePrice: true,
        currency: true,
        category: { select: { id: true, name: true, slug: true } },
        brand: { select: { name: true } },
      },
    });

    return NextResponse.json(
      {
        items: products.map((product) => ({
          ...product,
          basePrice: Number(product.basePrice),
        })),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Compare product search failed", error);
    return NextResponse.json(
      { error: "Products could not be loaded." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
