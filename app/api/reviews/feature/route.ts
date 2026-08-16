// app/api/reviews/feature/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isStorefrontRequest, publicJson } from "@/lib/public-cache";

// GET: get all featured reviews OR by productId
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");
    const featured = searchParams.get("featured");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const skip = (page - 1) * limit;

    const where = {
      ...(productId && { productId: Number(productId) }),
      ...(featured === "true" && { feature: true }),
    };

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        include: {
          user: true,
          product: true,
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
    return isStorefrontRequest(req)
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
    const body = await req.json();
    const { id, feature } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Review id is required" },
        { status: 400 }
      );
    }

    const updated = await prisma.review.update({
      where: { id: Number(id) },
      data: {
        feature: feature ?? false,
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
