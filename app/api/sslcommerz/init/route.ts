import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { rateLimitRequest } from "@/lib/request-security";
import {
  callbackUrls,
  createSslcommerzTransactionId,
  findSslcommerzGateway,
  gatewayIdFromMethod,
  isSslcommerzMethod,
  sslcommerzEndpoint,
  verifyPaymentInitToken,
} from "@/lib/sslcommerz";

export const runtime = "nodejs";

type SslcommerzInitBody = {
  orderId: number;
  gatewayId?: number;
  paymentInitToken?: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const rateLimit = rateLimitRequest(request, {
      scope: "sslcommerz-init",
      limit: 10,
      windowMs: 10 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many payment attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } },
      );
    }

    const body = (await request.json().catch(() => null)) as SslcommerzInitBody | null;
    const orderId = Number(body?.orderId);

    if (!orderId || Number.isNaN(orderId)) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        _count: { select: { inventoryReservations: true } },
        orderItems: {
          select: { product: { select: { type: true } } },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const session = await getServerSession(authOptions);
    const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
    const ownsAuthenticatedOrder = Boolean(
      order.userId && sessionUserId && order.userId === sessionUserId,
    );
    const hasGuestToken = Boolean(
      !order.userId && verifyPaymentInitToken(order.id, body?.paymentInitToken),
    );
    if (!ownsAuthenticatedOrder && !hasGuestToken) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (
      !isSslcommerzMethod(order.payment_method) ||
      order.paymentStatus === "PAID" ||
      ["FAILED", "CANCELLED", "RETURNED"].includes(order.status)
    ) {
      return NextResponse.json({ error: "Order is not eligible for SSLCommerz payment" }, { status: 409 });
    }

    const methodGatewayId = gatewayIdFromMethod(order.payment_method);
    const requestedGatewayId = Number(body?.gatewayId || methodGatewayId || 0) || null;
    if (methodGatewayId && requestedGatewayId !== methodGatewayId) {
      return NextResponse.json({ error: "Payment gateway does not match the order" }, { status: 400 });
    }

    const found = await findSslcommerzGateway(requestedGatewayId);
    const gateway = found?.gateway;
    const data: any = found?.data || {};

    const storeId = String(data.storeId || "").trim();
    const storePassword = String(data.storePassword || "").trim();
    const sandbox = Boolean(data.sandbox);

    if (!storeId || !storePassword) {
      return NextResponse.json(
        { error: "SSLCommerz credentials are not configured" },
        { status: 400 },
      );
    }

    const amount = Number((order as any).grand_total ?? (order as any).total ?? 0);
    if (!amount || Number.isNaN(amount)) {
      return NextResponse.json({ error: "Invalid order amount" }, { status: 400 });
    }

    const activePayment = await prisma.payment.findFirst({
      where: {
        orderId: order.id,
        provider: "SSLCOMMERZ",
        status: { in: ["INITIATED", "AUTHORIZED"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (activePayment) {
      const sessionIsFresh =
        Date.now() - activePayment.createdAt.getTime() < 30 * 60 * 1000;
      const activeMeta = activePayment.paymentGatewayData &&
        typeof activePayment.paymentGatewayData === "object" &&
        !Array.isArray(activePayment.paymentGatewayData)
        ? activePayment.paymentGatewayData as Record<string, unknown>
        : {};
      const redirectUrl = String(activeMeta.redirectUrl || "");
      if (redirectUrl && activePayment.status === "INITIATED" && sessionIsFresh) {
        return NextResponse.json({
          redirectUrl,
          tranId: activePayment.externalId,
          reused: true,
        });
      }
      if (activePayment.status === "AUTHORIZED" || sessionIsFresh) {
        return NextResponse.json(
          { error: "A payment attempt is already in progress for this order" },
          { status: 409 },
        );
      }
      await prisma.payment.update({
        where: { id: activePayment.id },
        data: { status: "FAILED" },
      });
    }

    const tranId = createSslcommerzTransactionId(order.id);
    const urls = callbackUrls(request, data);
    const hasPhysicalItems = order.orderItems.some(
      (item) => item.product.type === "PHYSICAL",
    );
    const inventoryMode =
      !hasPhysicalItems || order._count.inventoryReservations > 0
        ? "RESERVATION"
        : "LEGACY_DEDUCTED";

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        amount,
        currency: order.currency || "BDT",
        provider: "SSLCOMMERZ",
        status: "INITIATED",
        externalId: tranId,
        paymentGatewayData: {
          type: "SSLCOMMERZ_TRANSACTION",
          gatewayId: gateway!.id,
          sandbox,
          inventoryMode,
          initiatedAt: new Date().toISOString(),
        },
      },
    });

    const form = new URLSearchParams();
    form.set("store_id", storeId);
    form.set("store_passwd", storePassword);
    form.set("total_amount", String(amount));
    form.set("currency", order.currency || "BDT");
    form.set("tran_id", tranId);
    form.set("success_url", urls.successUrl);
    form.set("fail_url", urls.failUrl);
    form.set("cancel_url", urls.cancelUrl);
    form.set("ipn_url", urls.ipnUrl);
    form.set("value_a", String(order.id));
    form.set("value_b", String(gateway!.id));

    form.set("cus_name", String((order as any).name || "Customer"));
    form.set("cus_email", String((order as any).email || ""));
    form.set("cus_add1", String((order as any).address_details || ""));
    form.set("cus_city", String((order as any).district || ""));
    form.set("cus_country", String((order as any).country || "BD"));
    form.set("cus_phone", String((order as any).phone_number || ""));

    form.set("shipping_method", "Courier");
    form.set("product_name", "Order Payment");
    form.set("product_category", "Ecommerce");
    form.set("product_profile", "general");

    const endpoint = sslcommerzEndpoint(sandbox, "session");

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
      console.error("SSLCOMMERZ SESSION ERROR:", error);
      return NextResponse.json({ error: "Could not connect to SSLCommerz" }, { status: 502 });
    }

    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
      return NextResponse.json(
        { error: "Failed to initiate SSLCommerz payment" },
        { status: 502 },
      );
    }

    const gatewayPageUrl = String(payload.GatewayPageURL || "");
    if (!gatewayPageUrl) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
      return NextResponse.json(
        { error: payload.failedreason || "GatewayPageURL missing" },
        { status: 502 },
      );
    }
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        paymentGatewayData: {
          type: "SSLCOMMERZ_TRANSACTION",
          gatewayId: gateway!.id,
          sandbox,
          inventoryMode,
          initiatedAt: new Date().toISOString(),
          redirectUrl: gatewayPageUrl,
          sessionKey: String(payload.sessionkey || "") || null,
        },
      },
    });

    return NextResponse.json({ redirectUrl: gatewayPageUrl, tranId });
  } catch (error) {
    console.error("SSLCOMMERZ INIT ERROR:", error);
    return NextResponse.json(
      { error: "Failed to initiate SSLCommerz payment" },
      { status: 500 },
    );
  }
}
