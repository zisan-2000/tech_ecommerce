// app/api/reviews/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateStorefrontCatalog } from "@/lib/storefront-catalog-cache";
import { isStorefrontRequest, publicJson } from "@/lib/public-cache";

// GET /api/reviews?productId=1&page=1&limit=10
// পাবলিকলি অ্যাক্সেসযোগ্য (শুধু রিভিউ দেখার জন্য)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productIdParam = searchParams.get("productId");
    const limitParam = searchParams.get("limit");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(
      limitParam || (productIdParam ? "10" : "1000"),
      10
    );
    const skip = (page - 1) * limit;

    if (!Number.isInteger(page) || page < 1) {
      return NextResponse.json({ error: "Invalid page" }, { status: 400 });
    }

    if (!Number.isInteger(limit) || limit < 1) {
      return NextResponse.json({ error: "Invalid limit" }, { status: 400 });
    }

    const where: any = {};
    if (productIdParam) {
      const productId = Number(productIdParam);
      if (!productId || Number.isNaN(productId)) {
        return NextResponse.json(
          { error: "Invalid productId" },
          { status: 400 }
        );
      }
      where.productId = productId;
    }

    const [reviews, total, aggregated] = await Promise.all([
      prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.review.count({ where }),
      prisma.review.aggregate({
        _avg: { rating: true },
        where,
      }),
    ]);

    const payload = {
      reviews,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      averageRating: aggregated._avg.rating ?? 0,
    };
    return isStorefrontRequest(request)
      ? publicJson(payload, { maxAge: 30, staleWhileRevalidate: 120 })
      : NextResponse.json(payload, {
          headers: { "Cache-Control": "private, no-store" },
        });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/reviews
// Body: { productId: number, rating: 1-5, comment?: string }
// logged-in user compulsory
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id as string;

    const body = await request.json();
    const { productId, rating, comment } = body;

    const numericProductId = Number(productId);
    if (!numericProductId || Number.isNaN(numericProductId)) {
      return NextResponse.json(
        { error: "Invalid productId" },
        { status: 400 }
      );
    }

    if (
      typeof rating !== "number" ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5
    ) {
      return NextResponse.json(
        { error: "Rating must be an integer between 1 and 5" },
        { status: 400 }
      );
    }

    // check product exists
    const product = await prisma.product.findUnique({
      where: { id: numericProductId },
      select: { id: true },
    });

    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    // একই user একই product এ একটাই review রাখবে
    const existing = await prisma.review.findFirst({
      where: {
        productId: numericProductId,
        userId,
      },
    });

    let review;
    if (existing) {
      review = await prisma.review.update({
        where: { id: existing.id },
        data: {
          rating,
          comment: comment ?? existing.comment,
        },
      });
    } else {
      review = await prisma.review.create({
        data: {
          productId: numericProductId,
          userId,
          rating,
          comment: comment ?? null,
        },
      });
    }

    const ratingStats = await prisma.review.aggregate({
      where: { productId: numericProductId },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await prisma.product.update({
      where: { id: numericProductId },
      data: {
        ratingAvg: ratingStats._avg.rating ?? 0,
        ratingCount: ratingStats._count.rating,
      },
    });

    revalidateStorefrontCatalog();

    return NextResponse.json(review, { status: existing ? 200 : 201 });
  } catch (error) {
    console.error("Error creating/updating review:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
