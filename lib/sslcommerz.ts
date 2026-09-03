import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/generated/prisma";
import { syncCommissionEntriesForOrderStatus } from "@/lib/business-network/commission";
import {
  commitOrderInventoryReservations,
} from "@/lib/inventory";
import { transitionOrderStatusWithInventory } from "@/lib/order-inventory-lifecycle";

export type SslcommerzGatewayData = {
  type?: string;
  storeId?: string;
  storePassword?: string;
  sandbox?: boolean;
  isActive?: boolean;
  successUrl?: string;
  failUrl?: string;
  cancelUrl?: string;
  ipnUrl?: string;
};

type CallbackKind = "success" | "fail" | "cancel" | "ipn";

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

export function isSslcommerzMethod(value: unknown) {
  return /^SSLCOMMERZ:\d+$/i.test(String(value || ""));
}

export function gatewayIdFromMethod(value: unknown): number | null {
  const match = String(value || "").match(/^SSLCOMMERZ:(\d+)$/i);
  return match ? Number(match[1]) : null;
}

export function sslcommerzEndpoint(sandbox: boolean, kind: "session" | "validation") {
  const host = sandbox ? "https://sandbox.sslcommerz.com" : "https://securepay.sslcommerz.com";
  return kind === "session"
    ? `${host}/gwprocess/v4/api.php`
    : `${host}/validator/api/validationserverAPI.php`;
}

export async function findSslcommerzGateway(gatewayId?: number | null) {
  const gateway = gatewayId
    ? await prisma.payment.findFirst({ where: { id: gatewayId, orderId: null } })
    : await prisma.payment.findFirst({
        where: {
          orderId: null,
          paymentGatewayData: { path: ["type"], equals: "SSLCOMMERZ" },
        },
        orderBy: { updatedAt: "desc" },
      });

  const data = asObject(gateway?.paymentGatewayData) as SslcommerzGatewayData;
  if (
    !gateway ||
    String(data.type || "").toUpperCase() !== "SSLCOMMERZ" ||
    data.isActive === false
  ) {
    return null;
  }

  return { gateway, data };
}

function validOrigin(value: string | undefined | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function getPublicBaseUrl(request: NextRequest, data?: SslcommerzGatewayData) {
  const configured =
    validOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    validOrigin(process.env.NEXT_PUBLIC_BASE_URL) ||
    validOrigin(process.env.NEXT_PUBLIC_SITE_URL) ||
    validOrigin(process.env.APP_URL) ||
    validOrigin(process.env.NEXTAUTH_URL);
  if (configured) return configured;

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const protocol = request.headers.get("x-forwarded-proto") || "https";
    return `${protocol}://${forwardedHost}`;
  }

  const savedOrigin =
    validOrigin(data?.successUrl) ||
    validOrigin(data?.failUrl) ||
    validOrigin(data?.cancelUrl) ||
    validOrigin(data?.ipnUrl);
  return savedOrigin || request.nextUrl.origin;
}

export function callbackUrls(request: NextRequest, data?: SslcommerzGatewayData) {
  const base = getPublicBaseUrl(request, data);
  return {
    successUrl: `${base}/api/sslcommerz/success`,
    failUrl: `${base}/api/sslcommerz/fail`,
    cancelUrl: `${base}/api/sslcommerz/cancel`,
    ipnUrl: `${base}/api/sslcommerz/ipn`,
  };
}

export function createSslcommerzTransactionId(orderId: number) {
  const time = Date.now().toString(36);
  const nonce = randomUUID().replace(/-/g, "").slice(0, 8);
  return `O${orderId}_${time}_${nonce}`.slice(0, 30);
}

function paymentInitSecret() {
  return process.env.NEXTAUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim() || null;
}

export function isPaymentInitSigningConfigured() {
  return Boolean(paymentInitSecret());
}

export function createPaymentInitToken(orderId: number, ttlMs = 10 * 60 * 1000) {
  const secret = paymentInitSecret();
  if (!secret) return null;
  const expiresAt = Date.now() + ttlMs;
  const payload = `${orderId}.${expiresAt}`;
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${expiresAt}.${signature}`;
}

export function verifyPaymentInitToken(orderId: number, token: unknown) {
  const secret = paymentInitSecret();
  const raw = typeof token === "string" ? token.trim() : "";
  if (!secret || !raw) return false;

  const [expiresRaw, signature, ...extra] = raw.split(".");
  const expiresAt = Number(expiresRaw);
  if (extra.length > 0 || !signature || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${orderId}.${expiresAt}`)
    .digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export async function readSslcommerzPayload(request: NextRequest) {
  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return { ...query, ...asObject(await request.json().catch(() => ({}))) };
  }

  const form = await request.formData().catch(() => null);
  if (!form) return query;
  return {
    ...query,
    ...Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, String(value)])),
  };
}

function closeEnough(left: unknown, right: unknown) {
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.01;
}

export async function processSslcommerzCallback(
  request: NextRequest,
  kind: CallbackKind,
) {
  const posted = await readSslcommerzPayload(request);
  const tranId = String(posted.tran_id || "").trim();

  if (!tranId) return { ok: false, orderId: null, message: "Transaction ID is missing" };

  const payment = await prisma.payment.findUnique({
    where: { externalId: tranId },
    include: {
      order: {
        include: {
          orderItems: {
            select: {
              quantity: true,
              product: { select: { type: true } },
            },
          },
        },
      },
    },
  });
  if (!payment || !payment.orderId || !payment.order) {
    return { ok: false, orderId: null, message: "Payment transaction was not found" };
  }
  const order = payment.order;

  if (payment.status === "CAPTURED" && payment.order.paymentStatus === "PAID") {
    return { ok: true, orderId: payment.orderId, message: "Payment already verified" };
  }

  if (posted.value_a && Number(posted.value_a) !== payment.orderId) {
    return { ok: false, orderId: payment.orderId, message: "Order reference does not match" };
  }

  if (kind === "fail" || kind === "cancel") {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.payment.updateMany({
        where: {
          id: payment.id,
          status: { in: ["INITIATED", "AUTHORIZED"] },
        },
        data: { status: kind === "cancel" ? "VOIDED" : "FAILED" },
      });
      if (changed.count !== 1) return;

      const nextStatus =
        kind === "cancel" ? OrderStatus.CANCELLED : OrderStatus.FAILED;
      const transition = await transitionOrderStatusWithInventory({
        tx,
        orderId: payment.orderId!,
        nextStatus,
        reason: `Order #${payment.orderId} ${nextStatus.toLowerCase()} inventory restoration from SSLCommerz`,
      });
      if (transition.changed) {
        await syncCommissionEntriesForOrderStatus({
          tx,
          orderId: payment.orderId!,
          orderStatus: nextStatus,
          request,
        });
      }
      if (order.couponId && Number(order.discount_total || 0) > 0) {
        await tx.coupon.updateMany({
          where: { id: order.couponId, usedCount: { gt: 0 } },
          data: { usedCount: { decrement: 1 } },
        });
      }
    });
    return {
      ok: false,
      orderId: payment.orderId,
      message: kind === "cancel" ? "Payment was cancelled" : "Payment failed",
    };
  }

  const valId = String(posted.val_id || "").trim();
  if (!valId) return { ok: false, orderId: payment.orderId, message: "Validation ID is missing" };

  const transactionMeta = asObject(payment.paymentGatewayData);
  const gatewayId = Number(transactionMeta.gatewayId);
  const found = await findSslcommerzGateway(Number.isFinite(gatewayId) ? gatewayId : null);
  if (!found) return { ok: false, orderId: payment.orderId, message: "Gateway is unavailable" };

  const storeId = String(found.data.storeId || "").trim();
  const storePassword = String(found.data.storePassword || "").trim();
  if (!storeId || !storePassword) {
    return { ok: false, orderId: payment.orderId, message: "Gateway credentials are incomplete" };
  }

  const validationUrl = new URL(
    sslcommerzEndpoint(Boolean(found.data.sandbox), "validation"),
  );
  validationUrl.searchParams.set("val_id", valId);
  validationUrl.searchParams.set("store_id", storeId);
  validationUrl.searchParams.set("store_passwd", storePassword);
  validationUrl.searchParams.set("v", "1");
  validationUrl.searchParams.set("format", "json");

  let response: Response;
  try {
    response = await fetch(validationUrl, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    console.error("SSLCOMMERZ VALIDATION ERROR:", error);
    return { ok: false, orderId: payment.orderId, message: "Payment validation service is unavailable" };
  }
  const validation = asObject(await response.json().catch(() => ({})));
  const validationStatus = String(validation.status || "").toUpperCase();
  const expectedAmount = Number(payment.amount);
  const valid =
    response.ok &&
    ["VALID", "VALIDATED"].includes(validationStatus) &&
    String(validation.tran_id || "") === tranId &&
    (!validation.value_a || Number(validation.value_a) === payment.orderId) &&
    (!validation.value_b || Number(validation.value_b) === found.gateway.id) &&
    closeEnough(validation.amount, expectedAmount) &&
    String(validation.currency || payment.currency).toUpperCase() === payment.currency.toUpperCase();

  if (!valid) {
    return { ok: false, orderId: payment.orderId, message: "Payment validation failed" };
  }

  const riskLevel = Number(validation.risk_level || 0);
  const safeMeta = {
    type: "SSLCOMMERZ_TRANSACTION",
    gatewayId: found.gateway.id,
    inventoryMode:
      String(transactionMeta.inventoryMode || "").toUpperCase() === "LEGACY_DEDUCTED"
        ? "LEGACY_DEDUCTED"
        : String(transactionMeta.inventoryMode || "")
          ? "RESERVATION"
          : "LEGACY_DEDUCTED",
    valId,
    bankTransactionId: String(validation.bank_tran_id || "") || null,
    cardType: String(validation.card_type || "") || null,
    cardIssuer: String(validation.card_issuer || "") || null,
    riskLevel,
    validatedAt: new Date().toISOString(),
  };

  if (riskLevel === 1) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "AUTHORIZED", paymentGatewayData: safeMeta },
    });
    return {
      ok: false,
      orderId: payment.orderId,
      message: "Payment requires manual risk review",
    };
  }

  const expectedPhysicalQuantity = order.orderItems.reduce(
    (sum, item) =>
      item.product.type === "PHYSICAL" ? sum + Number(item.quantity) : sum,
    0,
  );
  const usesLegacyDeduction = safeMeta.inventoryMode === "LEGACY_DEDUCTED";
  const captureResult = await prisma.$transaction(async (tx) => {
    const captured = await tx.payment.updateMany({
      where: {
        id: payment.id,
        status: { in: ["INITIATED", "AUTHORIZED"] },
      },
      data: { status: "CAPTURED", paymentGatewayData: safeMeta },
    });

    if (captured.count !== 1) {
      const current = await tx.payment.findUnique({
        where: { id: payment.id },
        select: { status: true },
      });
      return {
        alreadyCaptured: current?.status === "CAPTURED",
        capturedNow: false,
      };
    }

    if (!usesLegacyDeduction) {
      const committed = await commitOrderInventoryReservations({
        tx,
        orderId: payment.orderId!,
        reason: `Order #${payment.orderId} SSLCommerz payment capture`,
      });
      if (committed.committedQuantity !== expectedPhysicalQuantity) {
        throw new Error("Reserved inventory does not match the paid order");
      }
    }

    await tx.order.update({
      where: { id: payment.orderId! },
      data: {
        paymentStatus: "PAID",
        transactionId: String(validation.bank_tran_id || tranId),
      },
    });
    return { alreadyCaptured: false, capturedNow: true };
  });

  if (captureResult.alreadyCaptured) {
    return { ok: true, orderId: payment.orderId, message: "Payment already verified" };
  }
  if (!captureResult.capturedNow) {
    return {
      ok: false,
      orderId: payment.orderId,
      message: "This payment attempt is no longer eligible for capture",
    };
  }

  return { ok: true, orderId: payment.orderId, message: "Payment verified successfully" };
}
