import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicJson } from "@/lib/public-cache";

export async function GET() {
  try {
    const [totalProducts, totalBrands, totalDelivered] = await Promise.all([
      prisma.product.count({
        where: {
          deleted: false,
          available: true,
          category: { deleted: false },
        },
      }),
      prisma.brand.count({ where: { deleted: false } }),
      prisma.order.count({ where: { status: "DELIVERED" } }),
    ]);

    return publicJson(
      { totalProducts, totalBrands, totalDelivered },
      { maxAge: 300, staleWhileRevalidate: 1800 },
    );
  } catch (error) {
    console.error("Storefront stats loading failed", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 },
    );
  }
}
