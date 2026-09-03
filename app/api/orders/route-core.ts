// app/api/orders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { deductVariantInventory, reserveVariantInventory } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { calculateShippingQuote } from "@/lib/shipping";
import { calculateTaxForItems } from "@/lib/tax";
import {
  claimCouponUsage,
  CouponValidationError,
  validateCouponForSubtotal,
} from "@/lib/coupons";
import { resolveWarehouseScope } from "@/lib/warehouse-scope";
import { logActivity } from "@/lib/activity-log";
import {
  createPaymentInitToken,
  findSslcommerzGateway,
  gatewayIdFromMethod,
  isPaymentInitSigningConfigured,
} from "@/lib/sslcommerz";
import { rateLimitRequest } from "@/lib/request-security";
import { revalidateStorefrontCatalog } from "@/lib/storefront-catalog-cache";
import { resolveFlashSalePricing } from "@/lib/flash-sale";
import {
  orderProductSelect,
  orderUserSelect,
  orderVariantSelect,
  redactCustomerOrder,
} from "@/lib/order-public";
import type { PcBuilderCheckoutBuild } from "@/lib/pc-builder-checkout";
import { pcBuildSelectionId } from "@/lib/pc-builder-grouping";
import { computeWarehouseAvailableStock } from "@/lib/warehouse-stock";
import {
  clearPartnerAttributionCookieOptions,
  parsePartnerAttributionCookie,
  PARTNER_ATTRIBUTION_COOKIE,
} from "@/lib/business-network/partner-attribution-cookie";
import { convertPartnerAttributionForOrder } from "@/lib/business-network/partner-referral";
import { calculateOrderCommissions } from "@/lib/business-network/commission";
import {
  acquireOrderIdempotencyLock,
  buildOrderIdempotencyContext,
  findExistingOrderIdempotencyOrderId,
  OrderIdempotencyError,
  orderIdempotencyCommercialContext,
} from "@/lib/order-idempotency";

type OrderPostOptions = {
  pcBuilderBuilds?: PcBuilderCheckoutBuild[];
};

function orderResponseInclude(userId?: string) {
  return {
    orderItems: {
      include: {
        product: { select: orderProductSelect },
        variant: { select: orderVariantSelect },
      },
    },
    user: userId ? { select: orderUserSelect } : false,
    coupon: true,
  };
}

async function loadOrderForReplay(db: any, orderId: number, userId?: string) {
  return db.order.findUnique({
    where: { id: orderId },
    include: orderResponseInclude(userId),
  });
}

function buildOrderSuccessResponse({
  order,
  isSSLCOMMERZ,
  partnerAttributionCookieValue,
  replayed,
}: {
  order: any;
  isSSLCOMMERZ: boolean;
  partnerAttributionCookieValue?: string;
  replayed: boolean;
}) {
  const customerOrder = redactCustomerOrder(order);
  const response = NextResponse.json(
    isSSLCOMMERZ
      ? { ...customerOrder, paymentInitToken: createPaymentInitToken(order.id) }
      : customerOrder,
    {
      status: replayed ? 200 : 201,
      headers: { "Idempotency-Replayed": replayed ? "true" : "false" },
    },
  );
  if (partnerAttributionCookieValue) {
    response.cookies.set(
      PARTNER_ATTRIBUTION_COOKIE,
      "",
      clearPartnerAttributionCookieOptions,
    );
  }
  return response;
}

async function persistPcBuilderOrderGrouping(
  tx: any,
  order: {
    id: number;
    orderItems: Array<{
      id: number;
      productId: number;
      variantId: number | null;
      quantity: number;
    }>;
  },
  builds: PcBuilderCheckoutBuild[],
) {
  if (!builds.length) return;

  const selectionQueues = new Map<
    string,
    Array<{
      id: number;
      productId: number;
      variantId: number | null;
      quantity: number;
    }>
  >();
  for (const item of order.orderItems) {
    const selectionId = pcBuildSelectionId(item);
    if (!selectionId) continue;
    const queue = selectionQueues.get(selectionId) ?? [];
    queue.push(item);
    selectionQueues.set(selectionId, queue);
  }

  for (const build of builds) {
    for (const [slot, selectionId] of Object.entries(build.selections)) {
      if (!selectionId) continue;
      const queue = selectionQueues.get(selectionId);
      const item = queue?.shift();
      if (!item || item.quantity !== 1) {
        throw new Error(
          `PC_BUILDER_GROUPING_ATOMIC_MAPPING_FAILED:${build.buildId}:${selectionId}`,
        );
      }
      await tx.$executeRawUnsafe(
        'INSERT INTO "PcBuildOrderItem" ("orderItemId", "orderId", "buildId", "slot") VALUES ($1, $2, $3, $4) ON CONFLICT ("orderItemId") DO UPDATE SET "orderId" = EXCLUDED."orderId", "buildId" = EXCLUDED."buildId", "slot" = EXCLUDED."slot"',
        item.id,
        order.id,
        build.buildId,
        slot,
      );
    }
  }
}

function assertWarehouseDemandAvailable(
  items: Array<{
    quantity: number;
    product: { type: string; name: string };
    variant: {
      id: number;
      stockLevels?: Array<{ quantity: number; reserved: number }> | null;
    };
  }>,
) {
  const demand = new Map<
    number,
    { required: number; available: number; productName: string }
  >();

  for (const item of items) {
    if (item.product.type !== "PHYSICAL") continue;
    const available = computeWarehouseAvailableStock(item.variant);
    if (available === null) {
      throw new Error(`Inventory not configured for: ${item.product.name}`);
    }
    const current = demand.get(item.variant.id);
    demand.set(item.variant.id, {
      required: (current?.required ?? 0) + item.quantity,
      available,
      productName: item.product.name,
    });
  }

  for (const value of demand.values()) {
    if (value.available < value.required) {
      throw new Error(`Insufficient stock for: ${value.productName}`);
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = (session.user as any).id as string;
    const access = await getAccessContext(
      session.user as { id?: string; role?: string } | undefined,
    );
    const canReadAll = access.has("orders.read_all");
    const canReadOwn = canReadAll || access.has("orders.read_own");
    if (!canReadOwn)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const statusParam = searchParams.get("status");
    const hasShipmentParam = searchParams.get("hasShipment");
    const skip = (page - 1) * limit;
    const where: any = {};
    const emptyOrderListResponse = () =>
      NextResponse.json({
        orders: [],
        pagination: { page, limit, total: 0, pages: 0 },
      });
    if (!canReadAll) where.userId = userId;
    else if (!access.hasGlobal("orders.read_all")) {
      const warehouseScope = resolveWarehouseScope(access, "orders.read_all");
      if (warehouseScope.mode === "none") return emptyOrderListResponse();
      if (warehouseScope.mode === "assigned")
        where.shipments = {
          is: { warehouseId: { in: warehouseScope.warehouseIds } },
        };
    }
    if (statusParam) {
      const validOrderStatuses = [
        "PENDING",
        "CONFIRMED",
        "PROCESSING",
        "SHIPPED",
        "DELIVERED",
        "CANCELLED",
        "FAILED",
        "RETURNED",
      ] as const;
      if (
        !validOrderStatuses.includes(
          statusParam as (typeof validOrderStatuses)[number],
        )
      )
        return NextResponse.json(
          { error: "Invalid status filter" },
          { status: 400 },
        );
      where.status = statusParam;
    }
    if (hasShipmentParam === "true") {
      const existingShipmentFilter = where.shipments?.is;
      where.shipments = existingShipmentFilter
        ? { is: existingShipmentFilter }
        : { isNot: null };
    } else if (hasShipmentParam === "false") {
      if (where.shipments?.is) return emptyOrderListResponse();
      where.shipments = { is: null };
    }
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          orderItems: {
            include: {
              product: { select: orderProductSelect },
              variant: { select: orderVariantSelect },
            },
          },
          user: { select: orderUserSelect },
        },
      }),
      prisma.order.count({ where }),
    ]);
    return NextResponse.json({
      orders: canReadAll ? orders : orders.map(redactCustomerOrder),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, options: OrderPostOptions = {}) {
  try {
    const rateLimit = await rateLimitRequest(request, {
      scope: "order-create",
      limit: 12,
      windowMs: 10 * 60 * 1000,
    });
    if (!rateLimit.allowed)
      return NextResponse.json(
        { error: "Too many checkout attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        },
      );

    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    const partnerAttributionCookieValue = request.cookies.get(
      PARTNER_ATTRIBUTION_COOKIE,
    )?.value;
    const partnerAttributionClaim = parsePartnerAttributionCookie(
      partnerAttributionCookieValue,
    );
    const body = await request.json();
    const {
      name,
      email,
      phone_number,
      alt_phone_number,
      country,
      district,
      area,
      address_details,
      payment_method,
      items,
      transactionId,
      image,
      couponId,
      couponCode,
    } = body;
    const paymentMethod = String(payment_method || "");
    const isCOD = paymentMethod === "CashOnDelivery";
    const isSSLCOMMERZ = /^SSLCOMMERZ:\d+$/i.test(paymentMethod);
    const isManualPayment = !isCOD && !isSSLCOMMERZ;
    const manualGatewayMatch = paymentMethod.match(/^MANUAL:.{1,80}:(\d+)$/i);

    if (
      !name ||
      !phone_number ||
      !country ||
      !district ||
      !area ||
      !address_details ||
      !payment_method
    )
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    if (!Array.isArray(items) || items.length === 0)
      return NextResponse.json(
        { error: "Order items required" },
        { status: 400 },
      );
    for (const item of items)
      if (!item.productId || !item.quantity || item.quantity <= 0)
        return NextResponse.json(
          { error: "Invalid order item(s)" },
          { status: 400 },
        );

    const normalizedItems = items.map((item: any) => ({
      productId: Number(item.productId),
      variantId:
        item.variantId !== undefined && item.variantId !== null
          ? Number(item.variantId)
          : null,
      quantity: Number(item.quantity),
    }));
    const idempotency = buildOrderIdempotencyContext({
      clientKey: request.headers.get("idempotency-key"),
      userId,
      name,
      email,
      phoneNumber: phone_number,
      altPhoneNumber: alt_phone_number,
      country,
      district,
      area,
      addressDetails: address_details,
      paymentMethod,
      items: normalizedItems,
      transactionId: isManualPayment ? transactionId : null,
      image: isManualPayment ? image : null,
      couponId,
      couponCode,
    });

    // Replay before catalog/stock checks. A previous successful attempt may have
    // already reduced stock, so checking inventory first would incorrectly turn a
    // safe retry into an "insufficient stock" error.
    const earlyReplayOrderId = await findExistingOrderIdempotencyOrderId(
      prisma,
      idempotency,
    );
    if (earlyReplayOrderId) {
      const existing = await loadOrderForReplay(
        prisma,
        earlyReplayOrderId,
        userId,
      );
      if (existing)
        return buildOrderSuccessResponse({
          order: existing,
          isSSLCOMMERZ,
          partnerAttributionCookieValue,
          replayed: true,
        });
    }

    if (isSSLCOMMERZ) {
      const gatewayId = gatewayIdFromMethod(paymentMethod);
      const gateway = await findSslcommerzGateway(gatewayId);
      if (!gateway || gateway.gateway.id !== gatewayId)
        return NextResponse.json(
          { error: "Selected SSLCommerz gateway is unavailable" },
          { status: 400 },
        );
      if (!userId && !isPaymentInitSigningConfigured())
        return NextResponse.json(
          { error: "Guest payment signing is not configured" },
          { status: 503 },
        );
    }
    if (isManualPayment) {
      const manualGatewayId = Number(manualGatewayMatch?.[1] || 0);
      const manualGateway = manualGatewayId
        ? await prisma.payment.findFirst({
            where: { id: manualGatewayId, orderId: null },
            select: { paymentGatewayData: true },
          })
        : null;
      const gatewayData =
        manualGateway?.paymentGatewayData &&
        typeof manualGateway.paymentGatewayData === "object" &&
        !Array.isArray(manualGateway.paymentGatewayData)
          ? (manualGateway.paymentGatewayData as Record<string, unknown>)
          : null;
      if (
        !gatewayData ||
        String(gatewayData.type || "").toUpperCase() !== "MANUAL" ||
        gatewayData.isActive === false
      )
        return NextResponse.json(
          { error: "Selected manual payment method is unavailable" },
          { status: 400 },
        );
    }
    if (
      isManualPayment &&
      (typeof image !== "string" ||
        !image.startsWith("/api/upload/paymentScreenshot/") ||
        typeof transactionId !== "string" ||
        !transactionId.trim() ||
        transactionId.trim().length > 128)
    )
      return NextResponse.json(
        {
          error: "A valid payment screenshot and transaction ID are required",
        },
        { status: 400 },
      );

    const productIds = Array.from(
      new Set(normalizedItems.map((i) => i.productId)),
    );
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, deleted: false },
      include: {
        VatClass: true,
        variants: {
          include: {
            stockLevels: {
              include: {
                warehouse: {
                  select: { id: true, code: true, isDefault: true },
                },
              },
            },
          },
          orderBy: [{ isDefault: "desc" }, { id: "asc" }],
        },
      },
    });
    if (products.length !== productIds.length)
      return NextResponse.json(
        { error: "Some products not found" },
        { status: 400 },
      );

    let subtotal = 0;
    const orderItemsData = normalizedItems.map((item) => {
      const product = products.find((p: any) => p.id === item.productId);
      if (!product) throw new Error(`Product not found: ${item.productId}`);
      if (product.deleted || !product.available)
        throw new Error(`Product not available: ${product.name}`);
      const targetVariant =
        item.variantId !== null
          ? product.variants.find((variant) => variant.id === item.variantId) ??
            null
          : product.variants.find((variant) => variant.isDefault) ??
            product.variants[0] ??
            null;
      if (!targetVariant)
        throw new Error(`Inventory not configured for: ${product.name}`);
      if (!targetVariant.active)
        throw new Error(`Variant inactive for: ${product.name}`);
      if (
        item.variantId !== null &&
        targetVariant.productId !== product.id
      )
        throw new Error(`Variant mismatch for: ${product.name}`);
      const priceNumber = resolveFlashSalePricing(
        product,
        targetVariant.price ?? product.basePrice,
      ).salePrice;
      subtotal += priceNumber * item.quantity;
      return {
        productId: product.id,
        variantId: targetVariant.id,
        quantity: item.quantity,
        price: priceNumber,
        currency: String(
          targetVariant.currency || product.currency || "BDT",
        ),
        vatClassId: product.VatClass?.id ?? null,
        vatClassName: product.VatClass?.name ?? null,
        vatClassCode: product.VatClass?.code ?? null,
        product,
        variant: targetVariant,
      };
    });
    assertWarehouseDemandAvailable(orderItemsData);

    const shippingQuote = await calculateShippingQuote({
      country: String(country),
      district: String(district),
      area: String(area),
      subtotal,
    });
    const taxQuote = await calculateTaxForItems(prisma, {
      country: String(country),
      district: String(district),
      currency: orderItemsData[0]?.currency || "BDT",
      items: orderItemsData.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: item.price,
        currency: item.currency,
        vatClassId: item.vatClassId,
        vatClassName: item.vatClassName,
        vatClassCode: item.vatClassCode,
      })),
    });
    const shipping_cost = shippingQuote.shippingCost;
    const vat_total = taxQuote.totalVAT;
    const tax_charge_total = taxQuote.totalTaxCharge;

    const transactionResult = await prisma.$transaction(async (tx: any) => {
      // Same-key requests queue here across all app instances. The waiter rechecks
      // after the winner commits and returns the winner's order instead of creating
      // another order or mutating inventory/coupon/commission state again.
      await acquireOrderIdempotencyLock(tx, idempotency);
      const replayOrderId = await findExistingOrderIdempotencyOrderId(
        tx,
        idempotency,
      );
      if (replayOrderId) {
        const existing = await loadOrderForReplay(tx, replayOrderId, userId);
        if (!existing)
          throw new Error("Idempotent order replay could not be loaded");
        return { order: existing, replayed: true as const };
      }

      const couponResult = await validateCouponForSubtotal(tx, {
        couponId,
        code: couponCode,
        subtotal,
      });
      const discount_total = couponResult?.discountAmount ?? 0;
      const grand_total = Math.max(
        0,
        Math.round(
          (subtotal + shipping_cost + tax_charge_total - discount_total) * 100,
        ) / 100,
      );
      const o = await tx.order.create({
        data: {
          userId: userId ?? null,
          name,
          email: email ?? null,
          phone_number,
          alt_phone_number: alt_phone_number ?? null,
          country,
          district,
          area,
          address_details,
          payment_method,
          total: subtotal,
          shipping_cost,
          grand_total,
          discount_total,
          Vat_total: vat_total,
          taxSnapshot: taxQuote,
          status: "PENDING",
          paymentStatus: "UNPAID",
          transactionId: transactionId ?? null,
          image: isManualPayment ? (image ?? null) : null,
          couponId: couponResult?.coupon.id ?? null,
          commercialContext: orderIdempotencyCommercialContext(idempotency),
          orderItems: {
            create: orderItemsData.map((item, index) => ({
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
              price: item.price,
              costPriceSnapshot:
                item.variant?.costPrice !== null &&
                item.variant?.costPrice !== undefined
                  ? Number(item.variant.costPrice)
                  : null,
              currency: item.currency,
              VatAmount: taxQuote.items[index]?.VatAmount ?? 0,
            })),
          },
        },
        include: {
          orderItems: {
            include: {
              product: { select: orderProductSelect },
              variant: { select: orderVariantSelect },
            },
          },
          user: userId ? { select: orderUserSelect } : false,
          coupon: Boolean(couponResult),
        },
      });

      for (const item of orderItemsData)
        if (item.product.type === "PHYSICAL") {
          if (isSSLCOMMERZ)
            await reserveVariantInventory({
              tx,
              productId: item.product.id,
              productVariantId: item.variant.id,
              orderId: o.id,
              userId: userId ?? null,
              quantity: item.quantity,
              reason: `Order #${o.id} SSLCommerz reservation`,
              expiresAt: new Date(Date.now() + 45 * 60 * 1000),
            });
          else
            await deductVariantInventory({
              tx,
              orderId: o.id,
              productId: item.product.id,
              productVariantId: item.variant.id,
              quantity: item.quantity,
              reason: `Order #${o.id} checkout deduction`,
            });
        }

      if (options.pcBuilderBuilds?.length) {
        await persistPcBuilderOrderGrouping(tx, o, options.pcBuilderBuilds);
      }
      const attributionResult = await convertPartnerAttributionForOrder({
        tx,
        claim: partnerAttributionClaim,
        orderId: o.id,
        customerUserId: userId ?? null,
        request,
      });
      if (attributionResult === "converted") {
        await calculateOrderCommissions({
          tx,
          orderId: o.id,
          actorUserId: userId ?? null,
          request,
        });
      }
      if (couponResult && discount_total > 0)
        await claimCouponUsage(tx, couponResult.coupon);
      return { order: o, replayed: false as const };
    });

    const created = transactionResult.order;
    if (!transactionResult.replayed) {
      revalidateStorefrontCatalog();
      await logActivity({
        action: "place_order",
        entity: "order",
        entityId: created.id,
        userId: userId ?? null,
        request,
        metadata: {
          message: `Order #${created.id} placed by ${created.name}`,
        },
        after: {
          orderId: created.id,
          customerName: created.name,
          customerEmail: created.email ?? null,
          paymentMethod: created.payment_method,
          status: created.status,
          paymentStatus: created.paymentStatus,
          grandTotal: Number(created.grand_total),
          itemCount: created.orderItems.length,
          items: created.orderItems.map((item: any) => ({
            productId: item.productId,
            productName: item.product?.name ?? null,
            variantId: item.variantId ?? null,
            quantity: item.quantity,
            price: Number(item.price),
          })),
        },
      });
    }

    return buildOrderSuccessResponse({
      order: created,
      isSSLCOMMERZ,
      partnerAttributionCookieValue,
      replayed: transactionResult.replayed,
    });
  } catch (error: any) {
    console.error("Error creating order:", error);
    if (error instanceof OrderIdempotencyError)
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    if (error instanceof CouponValidationError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    if (
      typeof error?.message === "string" &&
      error.message.startsWith("PC_BUILDER_GROUPING_ATOMIC_MAPPING_FAILED:")
    ) {
      return NextResponse.json(
        {
          error:
            "PC Builder order grouping changed during checkout. Validate the build again before placing the order.",
          code: "PC_BUILDER_ORDER_GROUPING_FAILED",
        },
        { status: 409 },
      );
    }
    if (
      typeof error?.message === "string" &&
      (error.message.startsWith("Product") ||
        error.message.startsWith("Insufficient stock") ||
        error.message.startsWith("Inventory") ||
        error.message.startsWith("Variant") ||
        error.message.startsWith("Variant inactive") ||
        error.message.startsWith("Stock changed") ||
        error.message.startsWith("Unable to allocate") ||
        error.message.startsWith("Unable to reserve") ||
        error.message.startsWith("Reservation"))
    )
      return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
