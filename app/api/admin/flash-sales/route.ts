import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { privateJson } from "@/lib/public-cache";

async function ensureAccess() {
  const session = await getServerSession(authOptions);
  const access = await getAccessContext(
    session?.user as { id?: string; role?: string } | undefined,
  );
  if (!access.userId) return { ok: false as const, status: 401 };
  if (!access.has("products.manage")) return { ok: false as const, status: 403 };
  return { ok: true as const, access };
}

export async function GET(request: Request) {
  try {
    const allowed = await ensureAccess();
    if (!allowed.ok) {
      return NextResponse.json(
        { error: allowed.status === 401 ? "Unauthorized" : "Forbidden" },
        { status: allowed.status },
      );
    }

    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim() ?? "";
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const pageSize = Math.min(
      100,
      Math.max(10, Number(url.searchParams.get("pageSize")) || 50),
    );
    const where = {
      deleted: false,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { sku: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: [
          { flashSaleEnabled: "desc" },
          { flashSaleSortOrder: "asc" },
          { updatedAt: "desc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          sku: true,
          image: true,
          available: true,
          basePrice: true,
          currency: true,
          flashSaleEnabled: true,
          flashSalePrice: true,
          flashSaleStartsAt: true,
          flashSaleEndsAt: true,
          flashSaleSortOrder: true,
          updatedAt: true,
          category: { select: { id: true, name: true } },
          brand: { select: { id: true, name: true } },
          variants: {
            where: { active: true },
            select: { stock: true },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);

    return privateJson({
      items: products.map((product) => ({
        ...product,
        basePrice: Number(product.basePrice),
        flashSalePrice:
          product.flashSalePrice === null ? null : Number(product.flashSalePrice),
        flashSaleStartsAt: product.flashSaleStartsAt?.toISOString() ?? null,
        flashSaleEndsAt: product.flashSaleEndsAt?.toISOString() ?? null,
        updatedAt: product.updatedAt.toISOString(),
        stock: product.variants.reduce((sum, variant) => sum + variant.stock, 0),
        variants: undefined,
      })),
      pagination: {
        page,
        pageSize,
        total,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    console.error("FLASH SALE LIST ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load flash sale products" },
      { status: 500 },
    );
  }
}
