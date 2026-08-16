import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicJson } from "@/lib/public-cache";

export async function GET() {
  try {
    const top = await prisma.product.findMany({
      where: {
        deleted: false,
        available: true,
        soldCount: {
          gt: 0,
        },
      },
      orderBy: {
        soldCount: "desc",
      },
      take: 10,
      include: {
        writer: true,
        publisher: true,
        category: true,
        brand: true,
        variants: true,
      },
    });

    return publicJson(
      top.map((p, i) => ({
        ...p,
        totalSold: p.soldCount ?? 0,
        rank: i + 1,
      })),
      { maxAge: 60, staleWhileRevalidate: 300 },
    );
  } catch (error) {
    console.error('Error fetching top selling products:', error);
    return NextResponse.json(
      { error: 'Failed to fetch top selling products' },
      { status: 500 }
    );
  }
}
