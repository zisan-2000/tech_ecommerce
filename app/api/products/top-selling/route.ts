import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicJson } from "@/lib/public-cache";
import { resolveFlashSalePricing } from "@/lib/flash-sale";

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
      select: {
        id: true,
        name: true,
        image: true,
        basePrice: true,
        originalPrice: true,
        currency: true,
        flashSaleEnabled: true,
        flashSalePrice: true,
        flashSaleStartsAt: true,
        flashSaleEndsAt: true,
        brand: { select: { name: true } },
      },
    });

    return publicJson(
      top.map((product) => {
        const pricing = resolveFlashSalePricing(product);
        return {
          id: product.id,
          name: product.name,
          image: product.image,
          price: pricing.salePrice,
          originalPrice: pricing.active
            ? pricing.regularPrice
            : product.originalPrice === null
              ? null
              : Number(product.originalPrice),
          currency: product.currency,
          brand: product.brand,
        };
      }),
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
