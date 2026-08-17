import type { Prisma } from "@/generated/prisma";

type CouponClient = Pick<Prisma.TransactionClient, "coupon">;

export class CouponValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CouponValidationError";
  }
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function validateCouponForSubtotal(
  client: CouponClient,
  params: { couponId?: string | null; code?: string | null; subtotal: number },
) {
  const couponId = typeof params.couponId === "string" ? params.couponId.trim() : "";
  const code = typeof params.code === "string" ? params.code.trim().toUpperCase() : "";
  const subtotal = money(Number(params.subtotal));

  if (!couponId && !code) return null;
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    throw new CouponValidationError("Invalid order subtotal");
  }

  const coupon = couponId
    ? await client.coupon.findUnique({ where: { id: couponId } })
    : await client.coupon.findUnique({ where: { code } });

  if (!coupon || (couponId && code && coupon.code.toUpperCase() !== code)) {
    throw new CouponValidationError("Invalid coupon code");
  }
  if (!coupon.isValid) {
    throw new CouponValidationError("Coupon is inactive");
  }
  if (coupon.expiresAt && coupon.expiresAt.getTime() <= Date.now()) {
    throw new CouponValidationError("Coupon has expired");
  }

  const usageLimit = coupon.usageLimit === null ? null : Number(coupon.usageLimit);
  if (usageLimit !== null && usageLimit > 0 && coupon.usedCount >= usageLimit) {
    throw new CouponValidationError("Coupon usage limit exceeded");
  }

  const minimum = coupon.minOrderValue === null ? 0 : Number(coupon.minOrderValue);
  if (subtotal < minimum) {
    throw new CouponValidationError(
      `Minimum order value of ৳${money(minimum).toFixed(2)} required`,
    );
  }

  const discountValue = Number(coupon.discountValue);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    throw new CouponValidationError("Coupon discount is not configured correctly");
  }

  const discountType = coupon.discountType.trim().toLowerCase();
  let discountAmount: number;
  if (discountType === "percentage") {
    discountAmount = subtotal * (discountValue / 100);
  } else if (["fixed", "flat", "amount"].includes(discountType)) {
    discountAmount = discountValue;
  } else {
    throw new CouponValidationError("Coupon discount type is not supported");
  }

  if (coupon.maxDiscount !== null) {
    discountAmount = Math.min(discountAmount, Number(coupon.maxDiscount));
  }
  discountAmount = money(Math.max(0, Math.min(subtotal, discountAmount)));

  return { coupon, discountAmount };
}

export async function claimCouponUsage(
  client: CouponClient,
  coupon: { id: string; usageLimit: number | null },
) {
  const usageLimit = coupon.usageLimit === null ? null : Number(coupon.usageLimit);
  const claimed = await client.coupon.updateMany({
    where: {
      id: coupon.id,
      isValid: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      ...(usageLimit !== null && usageLimit > 0
        ? { usedCount: { lt: usageLimit } }
        : {}),
    },
    data: { usedCount: { increment: 1 } },
  });

  if (claimed.count !== 1) {
    throw new CouponValidationError("Coupon is no longer available");
  }
}

