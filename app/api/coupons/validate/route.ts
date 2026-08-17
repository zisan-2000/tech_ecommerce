import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CouponValidationError, validateCouponForSubtotal } from "@/lib/coupons";
import { rateLimitRequest } from "@/lib/request-security";

export async function POST(req: Request) {
  try {
    const rateLimit = await rateLimitRequest(req, {
      scope: "coupon-validation",
      limit: 30,
      windowMs: 10 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many coupon attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } },
      );
    }

    const { code, subtotal } = await req.json();

    if (typeof code !== "string" || !code.trim()) {
      return NextResponse.json({ error: "Coupon code is required" }, { status: 400 });
    }
    const subtotalNumber = Number(subtotal);
    if (!Number.isFinite(subtotalNumber) || subtotalNumber < 0) {
      return NextResponse.json({ error: "Invalid subtotal" }, { status: 400 });
    }

    const result = await validateCouponForSubtotal(prisma, {
      code,
      subtotal: subtotalNumber,
    });
    if (!result) {
      return NextResponse.json({ error: "Coupon code is required" }, { status: 400 });
    }
    const { coupon, discountAmount } = result;

    // Return coupon validation without incrementing usage count
    // Usage count will be incremented when order is placed
    return NextResponse.json({
      success: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount
      }
    });

  } catch (error) {
    if (error instanceof CouponValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Coupon validation error:", error);
    return NextResponse.json({ 
      error: "Failed to validate coupon", 
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}
