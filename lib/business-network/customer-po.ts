import "server-only";

import {
  BusinessPriceSource,
  CustomerPurchaseOrderStatus,
  OrganizationAddressType,
  Prisma,
  ProductType,
  SalesChannel,
  SalesQuotationStatus,
  SalesQuotationVersionStatus,
  SalesRfqStatus,
} from "@/generated/prisma";
import { db } from "@/lib/db";
import { reserveVariantInventory } from "@/lib/inventory";
import type { ActiveBusinessContext } from "./types";
import { BUSINESS_AUDIT_ACTIONS, writeBusinessAudit } from "./audit";
import { BusinessNetworkError } from "./business-error";
import {
  assertCustomerPoMatchesQuotation,
  assertCustomerPoTransition,
  customerPoBusinessDiscount,
} from "./customer-po-core";
import type {
  adminCustomerPurchaseOrderListSchema,
  createCustomerPurchaseOrderSchema,
} from "./customer-po-schemas";
import { runSerializableTransaction } from "./transaction";
import type { z } from "zod";

type CreateInput = z.infer<typeof createCustomerPurchaseOrderSchema>;
type AdminListInput = z.infer<typeof adminCustomerPurchaseOrderListSchema>;

const detailInclude = {
  organization: {
    select: { id: true, code: true, legalName: true, displayName: true, status: true, currency: true },
  },
  quotation: {
    include: {
      salesRfq: { select: { id: true, rfqNumber: true, subject: true, status: true } },
      versions: {
        where: { isCurrent: true },
        include: { items: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] } },
        take: 1,
      },
    },
  },
  order: {
    include: {
      orderItems: { orderBy: { id: "asc" as const } },
    },
  },
} satisfies Prisma.CustomerPurchaseOrderInclude;

type CustomerPoDetail = Prisma.CustomerPurchaseOrderGetPayload<{ include: typeof detailInclude }>;

function serializeCustomerPo(po: CustomerPoDetail) {
  return {
    ...po,
    totalAmount: po.totalAmount?.toFixed(2) ?? null,
    quotation: po.quotation
      ? {
          ...po.quotation,
          versions: po.quotation.versions.map((version) => ({
            ...version,
            subtotal: version.subtotal.toFixed(2),
            discountTotal: version.discountTotal.toFixed(2),
            vatTotal: version.vatTotal.toFixed(2),
            shippingTotal: version.shippingTotal.toFixed(2),
            grandTotal: version.grandTotal.toFixed(2),
            items: version.items.map((item) => ({
              ...item,
              publicUnitPrice: item.publicUnitPrice?.toFixed(2) ?? null,
              unitPrice: item.unitPrice.toFixed(2),
              discountAmount: item.discountAmount.toFixed(2),
              vatAmount: item.vatAmount.toFixed(2),
              lineTotal: item.lineTotal.toFixed(2),
            })),
          })),
        }
      : null,
    order: po.order
      ? {
          ...po.order,
          total: po.order.total.toFixed(2),
          shipping_cost: po.order.shipping_cost.toFixed(2),
          grand_total: po.order.grand_total.toFixed(2),
          Vat_total: po.order.Vat_total?.toFixed(2) ?? null,
          discount_total: po.order.discount_total?.toFixed(2) ?? null,
          orderItems: po.order.orderItems.map((item) => ({
            ...item,
            price: item.price.toFixed(2),
            VatAmount: item.VatAmount?.toFixed(2) ?? null,
            discountAmount: item.discountAmount?.toFixed(2) ?? null,
            costPriceSnapshot: item.costPriceSnapshot?.toFixed(2) ?? null,
            publicUnitPriceSnapshot: item.publicUnitPriceSnapshot?.toFixed(2) ?? null,
            businessDiscountSnapshot: item.businessDiscountSnapshot?.toFixed(2) ?? null,
          })),
        }
      : null,
  };
}

async function findCustomerPo(
  tx: Prisma.TransactionClient | typeof db,
  id: string,
  organizationId?: string,
) {
  const po = await tx.customerPurchaseOrder.findFirst({
    where: { id, ...(organizationId ? { organizationId } : {}) },
    include: detailInclude,
  });
  if (!po) {
    throw new BusinessNetworkError(404, "CUSTOMER_PO_NOT_FOUND", "Customer purchase order not found.");
  }
  return po;
}

async function requireActiveCorporateAccount(
  tx: Prisma.TransactionClient,
  organizationId: string,
) {
  const account = await tx.businessAccount.findUnique({
    where: { organizationId },
    include: {
      pricingTier: { select: { id: true, code: true } },
      organization: {
        include: {
          capabilities: { where: { type: "CORPORATE_BUYER" }, select: { status: true }, take: 1 },
          addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
        },
      },
    },
  });
  if (
    !account ||
    account.status !== "ACTIVE" ||
    account.organization.status !== "ACTIVE" ||
    account.organization.capabilities[0]?.status !== "ACTIVE"
  ) {
    throw new BusinessNetworkError(
      403,
      "ACTIVE_BUSINESS_ACCOUNT_REQUIRED",
      "An active business account and CORPORATE_BUYER capability are required.",
    );
  }
  return account;
}

function acceptedVersion(po: CustomerPoDetail) {
  const quotation = po.quotation;
  const version = quotation?.versions[0];
  if (
    !quotation ||
    quotation.organizationId !== po.organizationId ||
    quotation.status !== SalesQuotationStatus.ACCEPTED ||
    !version ||
    !version.isCurrent ||
    version.status !== SalesQuotationVersionStatus.ACCEPTED
  ) {
    throw new BusinessNetworkError(
      409,
      "ACCEPTED_QUOTATION_REQUIRED",
      "The customer PO must reference this organization's current accepted quotation.",
    );
  }
  assertCustomerPoMatchesQuotation({
    poTotal: po.totalAmount,
    poCurrency: po.currency,
    quotationTotal: version.grandTotal,
    quotationCurrency: version.currency,
  });
  return { quotation, version };
}

export async function createCustomerPurchaseOrder(input: {
  context: ActiveBusinessContext;
  data: CreateInput;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const organizationId = input.context.activeMembership.organization.id;
    await requireActiveCorporateAccount(tx, organizationId);
    let totalAmount = input.data.totalAmount == null
      ? null
      : new Prisma.Decimal(input.data.totalAmount).toDecimalPlaces(2);
    let currency = input.data.currency;

    if (input.data.quotationId) {
      const quotation = await tx.salesQuotation.findFirst({
        where: {
          id: input.data.quotationId,
          organizationId,
          status: SalesQuotationStatus.ACCEPTED,
        },
        include: {
          versions: {
            where: { isCurrent: true, status: SalesQuotationVersionStatus.ACCEPTED },
            select: { grandTotal: true, currency: true },
            take: 1,
          },
        },
      });
      const version = quotation?.versions[0];
      if (!quotation || !version) {
        throw new BusinessNetworkError(
          409,
          "ACCEPTED_QUOTATION_REQUIRED",
          "Only a current accepted quotation can be attached to a customer PO.",
        );
      }
      totalAmount ??= version.grandTotal;
      currency = version.currency;
      assertCustomerPoMatchesQuotation({
        poTotal: totalAmount,
        poCurrency: currency,
        quotationTotal: version.grandTotal,
        quotationCurrency: version.currency,
      });
    } else if (currency !== input.context.activeMembership.organization.currency) {
      throw new BusinessNetworkError(
        422,
        "CUSTOMER_PO_CURRENCY_INVALID",
        "The PO currency must match the organization currency.",
      );
    }

    const po = await tx.customerPurchaseOrder.create({
      data: {
        organizationId,
        quotationId: input.data.quotationId ?? null,
        customerPoNumber: input.data.customerPoNumber,
        fileUrl: input.data.fileUrl,
        poDate: input.data.poDate ?? null,
        expectedDeliveryAt: input.data.expectedDeliveryAt ?? null,
        totalAmount,
        currency,
        submittedByMemberId: input.context.activeMembership.memberId,
      },
      include: detailInclude,
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId,
      memberId: input.context.activeMembership.memberId,
      actorUserId: input.context.user.id,
      action: BUSINESS_AUDIT_ACTIONS.customerPurchaseOrderCreated,
      entityType: "CustomerPurchaseOrder",
      entityId: po.id,
      after: po,
    });
    return serializeCustomerPo(po);
  });
}

export async function listPortalCustomerPurchaseOrders(input: {
  context: ActiveBusinessContext;
  page: number;
  limit: number;
  search: string;
  status?: CustomerPurchaseOrderStatus;
}) {
  return listCustomerPurchaseOrders({
    organizationId: input.context.activeMembership.organization.id,
    page: input.page,
    limit: input.limit,
    search: input.search,
    status: input.status,
  });
}

export async function listAdminCustomerPurchaseOrders(input: AdminListInput) {
  return listCustomerPurchaseOrders(input);
}

async function listCustomerPurchaseOrders(input: {
  organizationId?: string;
  quotationId?: string;
  page: number;
  limit: number;
  search: string;
  status?: CustomerPurchaseOrderStatus;
}) {
  const where: Prisma.CustomerPurchaseOrderWhereInput = {
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    ...(input.quotationId ? { quotationId: input.quotationId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.search ? {
      OR: [
        { customerPoNumber: { contains: input.search, mode: "insensitive" } },
        { quotation: { quotationNumber: { contains: input.search, mode: "insensitive" } } },
        { organization: { legalName: { contains: input.search, mode: "insensitive" } } },
        { organization: { displayName: { contains: input.search, mode: "insensitive" } } },
      ],
    } : {}),
  };
  const [items, total] = await Promise.all([
    db.customerPurchaseOrder.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        organization: { select: { id: true, code: true, legalName: true, displayName: true } },
        quotation: { select: { id: true, quotationNumber: true, status: true } },
        order: { select: { id: true, status: true, grand_total: true, currency: true } },
      },
    }),
    db.customerPurchaseOrder.count({ where }),
  ]);
  return {
    items: items.map((item) => ({
      ...item,
      totalAmount: item.totalAmount?.toFixed(2) ?? null,
      order: item.order
        ? { ...item.order, grand_total: item.order.grand_total.toFixed(2) }
        : null,
    })),
    pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) },
  };
}

export async function getPortalCustomerPurchaseOrder(
  context: ActiveBusinessContext,
  id: string,
) {
  return serializeCustomerPo(
    await findCustomerPo(db, id, context.activeMembership.organization.id),
  );
}

export async function getAdminCustomerPurchaseOrder(id: string) {
  return serializeCustomerPo(await findCustomerPo(db, id));
}

export async function cancelCustomerPurchaseOrder(input: {
  context: ActiveBusinessContext;
  id: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const before = await findCustomerPo(
      tx,
      input.id,
      input.context.activeMembership.organization.id,
    );
    if (before.status === CustomerPurchaseOrderStatus.CANCELLED) {
      return serializeCustomerPo(before);
    }
    assertCustomerPoTransition(before.status, CustomerPurchaseOrderStatus.CANCELLED);
    const updated = await tx.customerPurchaseOrder.update({
      where: { id: before.id },
      data: { status: CustomerPurchaseOrderStatus.CANCELLED },
      include: detailInclude,
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: before.organizationId,
      memberId: input.context.activeMembership.memberId,
      actorUserId: input.context.user.id,
      action: BUSINESS_AUDIT_ACTIONS.customerPurchaseOrderCancelled,
      entityType: "CustomerPurchaseOrder",
      entityId: before.id,
      before,
      after: updated,
    });
    return serializeCustomerPo(updated);
  });
}

export async function verifyCustomerPurchaseOrder(input: {
  id: string;
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const before = await findCustomerPo(tx, input.id);
    if (before.status === CustomerPurchaseOrderStatus.VERIFIED) {
      return serializeCustomerPo(before);
    }
    const now = new Date();
    if (before.status === CustomerPurchaseOrderStatus.SUBMITTED) {
      assertCustomerPoTransition(before.status, CustomerPurchaseOrderStatus.UNDER_REVIEW);
      await tx.customerPurchaseOrder.update({
        where: { id: before.id },
        data: {
          status: CustomerPurchaseOrderStatus.UNDER_REVIEW,
          reviewedById: input.actorUserId,
          reviewedAt: now,
        },
      });
    } else if (before.status !== CustomerPurchaseOrderStatus.UNDER_REVIEW) {
      assertCustomerPoTransition(before.status, CustomerPurchaseOrderStatus.VERIFIED);
    }
    acceptedVersion(before);
    const updated = await tx.customerPurchaseOrder.update({
      where: { id: before.id },
      data: {
        status: CustomerPurchaseOrderStatus.VERIFIED,
        reviewedById: input.actorUserId,
        reviewedAt: now,
        rejectionReason: null,
      },
      include: detailInclude,
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: before.organizationId,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.customerPurchaseOrderVerified,
      entityType: "CustomerPurchaseOrder",
      entityId: before.id,
      before,
      after: updated,
    });
    return serializeCustomerPo(updated);
  });
}

export async function rejectCustomerPurchaseOrder(input: {
  id: string;
  reason: string;
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const before = await findCustomerPo(tx, input.id);
    if (before.status === CustomerPurchaseOrderStatus.REJECTED) {
      return serializeCustomerPo(before);
    }
    const now = new Date();
    if (before.status === CustomerPurchaseOrderStatus.SUBMITTED) {
      assertCustomerPoTransition(before.status, CustomerPurchaseOrderStatus.UNDER_REVIEW);
      await tx.customerPurchaseOrder.update({
        where: { id: before.id },
        data: {
          status: CustomerPurchaseOrderStatus.UNDER_REVIEW,
          reviewedById: input.actorUserId,
          reviewedAt: now,
        },
      });
    } else if (before.status !== CustomerPurchaseOrderStatus.UNDER_REVIEW) {
      assertCustomerPoTransition(before.status, CustomerPurchaseOrderStatus.REJECTED);
    }
    const updated = await tx.customerPurchaseOrder.update({
      where: { id: before.id },
      data: {
        status: CustomerPurchaseOrderStatus.REJECTED,
        reviewedById: input.actorUserId,
        reviewedAt: now,
        rejectionReason: input.reason,
      },
      include: detailInclude,
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: before.organizationId,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.customerPurchaseOrderRejected,
      entityType: "CustomerPurchaseOrder",
      entityId: before.id,
      before,
      after: updated,
    });
    return serializeCustomerPo(updated);
  });
}

export async function convertCustomerPurchaseOrderToOrder(input: {
  id: string;
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "CustomerPurchaseOrder" WHERE "id" = ${input.id} FOR UPDATE
    `;
    const before = await findCustomerPo(tx, input.id);
    if (before.status === CustomerPurchaseOrderStatus.CONVERTED && before.order) {
      return serializeCustomerPo(before);
    }
    if (before.status !== CustomerPurchaseOrderStatus.VERIFIED) {
      throw new BusinessNetworkError(
        409,
        "CUSTOMER_PO_NOT_VERIFIED",
        "Only a verified customer purchase order can be converted.",
      );
    }

    const account = await requireActiveCorporateAccount(tx, before.organizationId);
    const { quotation, version } = acceptedVersion(before);
    if (!version.items.length) {
      throw new BusinessNetworkError(409, "QUOTATION_ITEMS_REQUIRED", "The accepted quotation has no items.");
    }

    const recomputedSubtotal = version.items.reduce(
      (total, item) => total.plus(item.unitPrice.mul(item.quantity)),
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2);
    const recomputedDiscount = version.items.reduce(
      (total, item) => total.plus(item.discountAmount),
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2);
    const recomputedVat = version.items.reduce(
      (total, item) => total.plus(item.vatAmount),
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2);
    const recomputedGrand = recomputedSubtotal
      .minus(recomputedDiscount)
      .plus(recomputedVat)
      .plus(version.shippingTotal)
      .toDecimalPlaces(2);
    if (
      !recomputedSubtotal.equals(version.subtotal) ||
      !recomputedDiscount.equals(version.discountTotal) ||
      !recomputedVat.equals(version.vatTotal) ||
      !recomputedGrand.equals(version.grandTotal)
    ) {
      throw new BusinessNetworkError(
        409,
        "QUOTATION_TOTALS_INVALID",
        "The accepted quotation totals no longer pass integrity validation.",
      );
    }

    const productIds = [...new Set(version.items.flatMap((item) => item.productId ? [item.productId] : []))];
    const variantIds = [...new Set(version.items.flatMap((item) => item.variantId ? [item.variantId] : []))];
    if (productIds.length !== new Set(version.items.map((item) => item.productId)).size || version.items.some((item) => !item.productId)) {
      throw new BusinessNetworkError(
        409,
        "CATALOG_QUOTATION_ITEMS_REQUIRED",
        "Every accepted quotation item must reference an available catalog product.",
      );
    }
    const [products, variants, submittedMember] = await Promise.all([
      tx.product.findMany({
        where: { id: { in: productIds }, deleted: false, available: true },
        select: { id: true, type: true, basePrice: true },
      }),
      variantIds.length
        ? tx.productVariant.findMany({
            where: { id: { in: variantIds }, active: true, product: { deleted: false, available: true } },
            select: { id: true, productId: true, costPrice: true },
          })
        : [],
      before.submittedByMemberId
        ? tx.organizationMember.findFirst({
            where: { id: before.submittedByMemberId, organizationId: before.organizationId },
            select: { userId: true, phone: true, user: { select: { email: true, phone: true } } },
          })
        : null,
    ]);
    const productMap = new Map(products.map((product) => [product.id, product]));
    const variantMap = new Map(variants.map((variant) => [variant.id, variant]));

    const orderItems = version.items.map((item) => {
      const product = item.productId ? productMap.get(item.productId) : null;
      const variant = item.variantId ? variantMap.get(item.variantId) : null;
      if (!product) {
        throw new BusinessNetworkError(409, "QUOTATION_PRODUCT_UNAVAILABLE", "A quoted product is no longer available.");
      }
      if (item.variantId && (!variant || variant.productId !== product.id)) {
        throw new BusinessNetworkError(409, "QUOTATION_VARIANT_UNAVAILABLE", "A quoted product variant is no longer available.");
      }
      if (product.type === ProductType.PHYSICAL && !variant) {
        throw new BusinessNetworkError(409, "PHYSICAL_VARIANT_REQUIRED", "Physical quotation items require an active inventory variant.");
      }
      return {
        productId: product.id,
        variantId: variant?.id ?? null,
        quantity: item.quantity,
        price: item.unitPrice,
        currency: version.currency,
        VatAmount: item.vatAmount,
        discountAmount: item.discountAmount,
        costPriceSnapshot: variant?.costPrice ?? null,
        priceSource: BusinessPriceSource.QUOTATION,
        publicUnitPriceSnapshot: item.publicUnitPrice ?? product.basePrice,
        businessDiscountSnapshot: customerPoBusinessDiscount({
          publicUnitPrice: item.publicUnitPrice ?? product.basePrice,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          explicitDiscount: item.discountAmount,
        }),
        productType: product.type,
      };
    });

    const address = account.organization.addresses.find(
      (item) => item.type === OrganizationAddressType.SHIPPING && item.isDefault,
    ) ?? account.organization.addresses.find((item) => item.type === OrganizationAddressType.SHIPPING)
      ?? account.organization.addresses.find((item) => item.isDefault)
      ?? account.organization.addresses[0];
    const phone = account.organization.phone || submittedMember?.phone || submittedMember?.user.phone;
    if (!address?.district || !address.area || !phone) {
      throw new BusinessNetworkError(
        422,
        "ORGANIZATION_ORDER_CONTACT_INCOMPLETE",
        "A phone number and complete shipping address (district and area) are required before conversion.",
      );
    }

    const commercialContext = {
      businessAccountId: account.id,
      pricingTierId: account.pricingTierId,
      pricingTierCode: account.pricingTier?.code ?? null,
      paymentTermDays: account.paymentTermDays,
      priceSource: BusinessPriceSource.QUOTATION,
      quotationId: quotation.id,
      quotationNumber: quotation.quotationNumber,
      quotationVersionId: version.id,
      quotationVersionNumber: version.versionNumber,
      customerPurchaseOrderId: before.id,
      customerPoNumber: before.customerPoNumber,
    } satisfies Prisma.InputJsonObject;

    const order = await tx.order.create({
      data: {
        userId: submittedMember?.userId ?? null,
        name: account.organization.displayName || account.organization.legalName,
        email: account.organization.email || submittedMember?.user.email || null,
        phone_number: phone,
        country: address.country,
        district: address.district,
        area: address.area,
        address_details: [address.addressLine, address.postCode].filter(Boolean).join(", "),
        payment_method: "CorporatePurchaseOrder",
        total: version.subtotal,
        shipping_cost: version.shippingTotal,
        grand_total: version.grandTotal,
        currency: version.currency,
        Vat_total: version.vatTotal,
        discount_total: version.discountTotal,
        taxSnapshot: {
          source: "SALES_QUOTATION",
          quotationVersionId: version.id,
          vatTotal: version.vatTotal.toFixed(2),
        },
        organizationId: before.organizationId,
        salesChannel: SalesChannel.CORPORATE,
        salesQuotationVersionId: version.id,
        commercialContext,
        orderItems: {
          create: orderItems.map(({ productType: _productType, ...item }) => item),
        },
      },
    });

    try {
      for (const item of orderItems) {
        if (item.productType !== ProductType.PHYSICAL || !item.variantId) continue;
        await reserveVariantInventory({
          tx,
          productId: item.productId,
          productVariantId: item.variantId,
          orderId: order.id,
          userId: submittedMember?.userId ?? null,
          quantity: item.quantity,
          reason: `Corporate PO ${before.customerPoNumber}`,
          expiresAt: null,
        });
      }
    } catch (error) {
      throw new BusinessNetworkError(
        409,
        "CUSTOMER_PO_INVENTORY_UNAVAILABLE",
        error instanceof Error ? error.message : "Quoted inventory is unavailable.",
      );
    }

    const now = new Date();
    await tx.customerPurchaseOrder.update({
      where: { id: before.id },
      data: {
        status: CustomerPurchaseOrderStatus.CONVERTED,
        orderId: order.id,
        convertedAt: now,
      },
    });
    if (quotation.salesRfqId) {
      await tx.salesRfq.updateMany({
        where: { id: quotation.salesRfqId, status: SalesRfqStatus.QUOTED },
        data: { status: SalesRfqStatus.CLOSED, closedAt: now },
      });
    }
    const updated = await findCustomerPo(tx, before.id);
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: before.organizationId,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.customerPurchaseOrderConverted,
      entityType: "CustomerPurchaseOrder",
      entityId: before.id,
      before,
      after: { customerPurchaseOrder: updated, orderId: order.id },
    });
    return serializeCustomerPo(updated);
  });
}
