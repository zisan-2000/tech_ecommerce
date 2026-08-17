// app/api/reviews/feature/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isStorefrontRequest, publicJson } from "@/lib/public-cache";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";

// GET: get all featured reviews OR by productId
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storefront = isStorefrontRequest(req);
    if (!storefront) {
      const session = await getServerSession(authOptions);
      const access = await getAccessContext(
        session?.user as { id?: string; role?: string } | undefined,
      );
      if (!access.userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (!access.has("reviews.manage")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const productId = searchParams.get("productId");
    const featured = searchParams.get("featured");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("limit") || "10", 10) || 10),
    );
    const skip = (page - 1) * limit;

    if (productId && (!Number.isInteger(Number(productId)) || Number(productId) <= 0)) {
      return NextResponse.json(
        { success: false, message: "Invalid product id" },
        { status: 400 },
      );
    }

    const where = {
      ...(productId && { productId: Number(productId) }),
      ...(featured === "true" && { feature: true }),
    };

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        select: {
          id: true,
          rating: true,
          comment: true,
          productId: true,
          feature: true,
          ...(storefront ? {} : { userId: true }),
          createdAt: true,
          user: {
            select: {
              name: true,
              image: true,
              ...(storefront ? {} : { id: true, email: true }),
            },
          },
          product: {
            select: { id: true, name: true, image: true, slug: true },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      prisma.review.count({ where }),
    ]);

    const payload = {
      success: true, 
      data: reviews,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
    return storefront
      ? publicJson(payload, { maxAge: 60, staleWhileRevalidate: 300 })
      : NextResponse.json(payload, {
          headers: { "Cache-Control": "private, no-store" },
        });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Failed to fetch reviews" },
      { status: 500 }
    );
  }
}

// UPDATE: toggle feature true/false
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.has("reviews.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { id, feature } = body;

    const reviewId = Number(id);
    if (!Number.isInteger(reviewId) || reviewId <= 0 || typeof feature !== "boolean") {
      return NextResponse.json(
        { success: false, message: "A valid review id and feature flag are required" },
        { status: 400 }
      );
    }

    const updated = await prisma.review.update({
      where: { id: reviewId },
      data: { feature },
      select: {
        id: true,
        rating: true,
        comment: true,
        productId: true,
        feature: true,
        userId: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Failed to update feature status" },
      { status: 500 }
    );
  }
}
