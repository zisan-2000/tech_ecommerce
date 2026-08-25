import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { resolveFlashSalePricing } from "@/lib/flash-sale";

type PriceClient = Prisma.TransactionClient | typeof prisma;

type PriceSnapshot = {
  productId: number;
  variantId: number | null;
  productName: string;
  price: number;
  regularPrice: number;
  currency: string;
};

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatMoney(value: number, currency: string) {
  if (currency.toUpperCase() === "BDT") {
    return `৳${Math.round(value).toLocaleString("en-US")}`;
  }
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "BDT",
    maximumFractionDigits: 0,
  }).format(value);
}

export async function getCurrentPriceSnapshot({
  productId,
  variantId = null,
  db = prisma,
}: {
  productId: number;
  variantId?: number | null;
  db?: PriceClient;
}): Promise<PriceSnapshot | null> {
  const product = await db.product.findFirst({
    where: { id: productId, deleted: false, available: true },
    select: {
      id: true,
      name: true,
      basePrice: true,
      currency: true,
      flashSaleEnabled: true,
      flashSalePrice: true,
      flashSaleStartsAt: true,
      flashSaleEndsAt: true,
      variants: variantId
        ? {
            where: { id: variantId, active: true },
            select: { id: true, price: true, currency: true },
            take: 1,
          }
        : false,
    },
  });

  if (!product) return null;
  const variant = variantId ? product.variants[0] : null;
  if (variantId && !variant) return null;

  const regularPrice = Number(variant?.price ?? product.basePrice);
  const pricing = resolveFlashSalePricing(product, regularPrice);

  return {
    productId: product.id,
    variantId: variant?.id ?? null,
    productName: product.name,
    price: money(pricing.salePrice),
    regularPrice: money(pricing.regularPrice),
    currency: variant?.currency ?? product.currency,
  };
}

export async function upsertPriceDropAlert({
  userId,
  productId,
  variantId = null,
}: {
  userId: string;
  productId: number;
  variantId?: number | null;
}) {
  const snapshot = await getCurrentPriceSnapshot({ productId, variantId });
  if (!snapshot) return null;

  const existing = await prisma.priceDropAlert.findFirst({
    where: { userId, productId, variantId },
  });

  const data = {
    baselinePrice: snapshot.price,
    currency: snapshot.currency,
    active: true,
  };

  if (existing) {
    return prisma.priceDropAlert.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.priceDropAlert.create({
    data: {
      userId,
      productId,
      variantId,
      ...data,
    },
  });
}

export async function createWishlistPriceDropAlertIfMissing({
  userId,
  productId,
}: {
  userId: string;
  productId: number;
}) {
  const existing = await prisma.priceDropAlert.findFirst({
    where: { userId, productId, variantId: null },
    select: { id: true },
  });
  if (existing) return false;

  const snapshot = await getCurrentPriceSnapshot({ productId });
  if (!snapshot) return false;

  await prisma.priceDropAlert.create({
    data: {
      userId,
      productId,
      variantId: null,
      baselinePrice:
        snapshot.regularPrice > snapshot.price
          ? snapshot.regularPrice
          : snapshot.price,
      currency: snapshot.currency,
      active: true,
    },
  });
  return true;
}

export async function ensureWishlistPriceDropAlertsForUser(userId: string) {
  const wishlist = await prisma.wishlist.findMany({
    where: {
      userId,
      product: { deleted: false, available: true },
    },
    select: { productId: true },
    orderBy: { id: "asc" },
  });

  let created = 0;
  for (const item of wishlist) {
    if (
      await createWishlistPriceDropAlertIfMissing({
        userId,
        productId: item.productId,
      })
    ) {
      created += 1;
    }
  }

  return created;
}

export async function evaluatePriceDropAlertsForProduct(
  productId: number,
  userId?: string,
) {
  const alerts = await prisma.priceDropAlert.findMany({
    where: {
      productId,
      ...(userId ? { userId } : {}),
      active: true,
      product: { deleted: false, available: true },
    },
    orderBy: { id: "asc" },
  });

  let created = 0;
  const seenAlertKeys = new Set<string>();
  for (const alert of alerts) {
    const snapshot = await getCurrentPriceSnapshot({
      productId: alert.productId,
      variantId: alert.variantId,
    });
    if (!snapshot) continue;

    const alertKey = `${alert.userId}:${alert.productId}:${alert.variantId ?? "product"}`;
    if (seenAlertKeys.has(alertKey)) {
      await prisma.priceDropAlert.update({
        where: { id: alert.id },
        data: {
          baselinePrice: snapshot.price,
          currency: snapshot.currency,
          lastNotifiedAt: new Date(),
        },
      });
      continue;
    }
    seenAlertKeys.add(alertKey);

    const baseline = Number(alert.baselinePrice);
    if (!(snapshot.price < baseline)) continue;

    await prisma.$transaction(async (tx) => {
      const latest = await tx.priceDropAlert.findUnique({
        where: { id: alert.id },
      });
      if (!latest || !latest.active || !(snapshot.price < Number(latest.baselinePrice))) {
        return;
      }

      const claimed = await tx.priceDropAlert.updateMany({
        where: {
          id: latest.id,
          active: true,
          baselinePrice: { gt: snapshot.price },
        },
        data: {
          baselinePrice: snapshot.price,
          currency: snapshot.currency,
          lastNotifiedAt: new Date(),
        },
      });
      if (claimed.count !== 1) return;

      await tx.customerNotification.create({
        data: {
          userId: latest.userId,
          type: "PRICE_DROP",
          title: "Price drop alert",
          message: `${snapshot.productName} dropped from ${formatMoney(
            Number(latest.baselinePrice),
            snapshot.currency,
          )} to ${formatMoney(snapshot.price, snapshot.currency)}.`,
          targetUrl: `/ecommerce/products/${snapshot.productId}`,
          productId: snapshot.productId,
          variantId: snapshot.variantId,
          metadata: {
            previousPrice: Number(latest.baselinePrice),
            currentPrice: snapshot.price,
            regularPrice: snapshot.regularPrice,
            currency: snapshot.currency,
          },
        },
      });
      created += 1;
    });
  }

  return created;
}

export async function evaluatePriceDropAlertsForUser(userId: string) {
  const alerts = await prisma.priceDropAlert.findMany({
    where: {
      userId,
      active: true,
      product: { deleted: false, available: true },
    },
    select: { productId: true },
    distinct: ["productId"],
    orderBy: { productId: "asc" },
  });

  let created = 0;
  for (const alert of alerts) {
    created += await evaluatePriceDropAlertsForProduct(alert.productId, userId);
  }

  return {
    scannedProducts: alerts.length,
    notificationsCreated: created,
  };
}

export async function evaluateAllPriceDropAlerts() {
  const productIds = await prisma.priceDropAlert.findMany({
    where: {
      active: true,
      product: { deleted: false, available: true },
    },
    distinct: ["productId"],
    select: { productId: true },
    orderBy: { productId: "asc" },
  });

  let created = 0;
  for (const item of productIds) {
    created += await evaluatePriceDropAlertsForProduct(item.productId);
  }

  return {
    scannedProducts: productIds.length,
    notificationsCreated: created,
  };
}
