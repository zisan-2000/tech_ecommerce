import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  computePurchaseOrderTotals,
  generatePurchaseOrderNumber,
  purchaseOrderInclude,
  toDecimalAmount,
  toPurchaseOrderLogSnapshot,
} from "@/lib/scm";
import { resolvePurchaseOrderTermsTemplate } from "@/lib/purchase-order-terms";

const PURCHASE_ORDER_READ_PERMISSIONS = [
  "purchase_orders.read",
  "purchase_orders.manage",
  "purchase_orders.approve",
  "purchase_orders.approve_manager",
  "purchase_orders.approve_committee",
  "purchase_orders.approve_final",
  "goods_receipts.manage",
  "supplier_invoices.manage",
] as const;

function toCleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canReadPurchaseOrders(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasAny([...PURCHASE_ORDER_READ_PERMISSIONS]);
}

function hasGlobalPurchaseOrderScope(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return PURCHASE_ORDER_READ_PERMISSIONS.some((permission) => access.hasGlobal(permission));
}

function buildWarehouseScopedWhere(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  requestedWarehouseId: number | null,
): Prisma.PurchaseOrderWhereInput | null {
  if (hasGlobalPurchaseOrderScope(access)) {
    return requestedWarehouseId ? { warehouseId: requestedWarehouseId } : {};
  }

  if (requestedWarehouseId) {
    if (!access.canAccessWarehouse(requestedWarehouseId)) {
      return null;
    }
    return { warehouseId: requestedWarehouseId };
  }

  if (access.warehouseIds.length === 0) {
    return null;
  }

  return { warehouseId: { in: access.warehouseIds } };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canReadPurchaseOrders(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = request.nextUrl.searchParams.get("status")?.trim() || "";
    const supplierId = Number(request.nextUrl.searchParams.get("supplierId") || "");
    const warehouseId = Number(request.nextUrl.searchParams.get("warehouseId") || "");
    const search = request.nextUrl.searchParams.get("search")?.trim() || "";

    const warehouseFilter = buildWarehouseScopedWhere(
      access,
      Number.isInteger(warehouseId) && warehouseId > 0 ? warehouseId : null,
    );
    if (warehouseFilter === null) {
      return NextResponse.json([]);
    }

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: {
        ...warehouseFilter,
        ...(status
          ? { status: status as Prisma.EnumPurchaseOrderStatusFilter["equals"] }
          : {}),
        ...(Number.isInteger(supplierId) && supplierId > 0 ? { supplierId } : {}),
        ...(search
          ? {
              OR: [
                { poNumber: { contains: search, mode: "insensitive" } },
                { supplier: { name: { contains: search, mode: "insensitive" } } },
                { warehouse: { name: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: [{ orderDate: "desc" }, { id: "desc" }],
      include: purchaseOrderInclude,
    });

    return NextResponse.json(purchaseOrders);
  } catch (error) {
    console.error("SCM PURCHASE ORDERS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load purchase orders." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      supplierId?: unknown;
      warehouseId?: unknown;
      expectedAt?: unknown;
      notes?: unknown;
      termsTemplateId?: unknown;
      termsAndConditions?: unknown;
      items?: Array<{
        productVariantId?: unknown;
        quantityOrdered?: unknown;
        unitCost?: unknown;
        description?: unknown;
      }>;
    };

    const supplierId = Number(body.supplierId);
    const warehouseId = Number(body.warehouseId);
    const termsTemplateIdRaw = Number(body.termsTemplateId);
    const requestedTemplateId =
      Number.isInteger(termsTemplateIdRaw) && termsTemplateIdRaw > 0
        ? termsTemplateIdRaw
        : null;

    if (
      body.termsTemplateId !== undefined &&
      body.termsTemplateId !== null &&
      body.termsTemplateId !== "" &&
      requestedTemplateId === null
    ) {
      return NextResponse.json({ error: "Invalid terms template id." }, { status: 400 });
    }

    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      return NextResponse.json({ error: "Supplier is required." }, { status: 400 });
    }
    if (!Number.isInteger(warehouseId) || warehouseId <= 0) {
      return NextResponse.json({ error: "Warehouse is required." }, { status: 400 });
    }
    if (!access.can("purchase_orders.manage", warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json(
        { error: "At least one purchase order item is required." },
        { status: 400 },
      );
    }

    const uniqueVariantIds = new Set<number>();
    const normalizedItems = items.map((item, index) => {
      const productVariantId = Number(item.productVariantId);
      const quantityOrdered = Number(item.quantityOrdered);
      if (!Number.isInteger(productVariantId) || productVariantId <= 0) {
        throw new Error(`Item ${index + 1}: variant is required`);
      }
      if (uniqueVariantIds.has(productVariantId)) {
        throw new Error(`Item ${index + 1}: duplicate variant selected`);
      }
      uniqueVariantIds.add(productVariantId);
      if (!Number.isInteger(quantityOrdered) || quantityOrdered <= 0) {
        throw new Error(`Item ${index + 1}: quantity must be greater than 0`);
      }
      return {
        productVariantId,
        quantityOrdered,
        unitCost: toDecimalAmount(item.unitCost, `Item ${index + 1} unit cost`),
        description: toCleanText(item.description, 255),
      };
    });

    const [supplier, warehouse, variants] = await Promise.all([
      prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true, name: true, code: true, currency: true },
      }),
      prisma.warehouse.findUnique({
        where: { id: warehouseId },
        select: { id: true, name: true, code: true },
      }),
      prisma.productVariant.findMany({
        where: {
          id: { in: normalizedItems.map((item) => item.productVariantId) },
        },
        select: {
          id: true,
          productId: true,
          sku: true,
          product: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ]);

    if (!supplier) {
      return NextResponse.json({ error: "Supplier not found." }, { status: 404 });
    }
    if (!warehouse) {
      return NextResponse.json({ error: "Warehouse not found." }, { status: 404 });
    }
    if (variants.length !== normalizedItems.length) {
      return NextResponse.json(
        { error: "One or more variants were not found." },
        { status: 400 },
      );
    }

    const variantMap = new Map(variants.map((variant) => [variant.id, variant]));
    const transactionItems = normalizedItems.map((item) => {
      const variant = variantMap.get(item.productVariantId);
      if (!variant) {
        throw new Error("Variant lookup failed");
      }
      return {
        ...item,
        description: item.description || `${variant.product.name} (${variant.sku})`,
        lineTotal: item.unitCost.mul(item.quantityOrdered),
      };
    });
    const totals = computePurchaseOrderTotals(transactionItems);
    const expectedAt = body.expectedAt ? new Date(String(body.expectedAt)) : null;

    if (expectedAt && Number.isNaN(expectedAt.getTime())) {
      return NextResponse.json(
        { error: "Expected date is invalid." },
        { status: 400 },
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const selectedTemplate = await resolvePurchaseOrderTermsTemplate(tx, {
        templateId: requestedTemplateId,
        createdById: access.userId,
      });
      if (requestedTemplateId && !selectedTemplate) {
        throw new Error("Selected PO terms template is invalid or inactive.");
      }
      const customTerms = toCleanText(body.termsAndConditions, 7000);
      const resolvedTerms = customTerms || selectedTemplate?.body || "";

      const poNumber = await generatePurchaseOrderNumber(tx);
      return tx.purchaseOrder.create({
        data: {
          poNumber,
          supplierId,
          warehouseId,
          expectedAt,
          notes: toCleanText(body.notes, 500) || null,
          approvalStage: "DRAFT",
          termsTemplateId: selectedTemplate?.id ?? null,
          termsTemplateCode: selectedTemplate?.code ?? null,
          termsTemplateName: selectedTemplate?.name ?? null,
          termsAndConditions: resolvedTerms || null,
          currency: supplier.currency || "BDT",
          createdById: access.userId,
          subtotal: totals.subtotal,
          taxTotal: totals.taxTotal,
          shippingTotal: totals.shippingTotal,
          grandTotal: totals.grandTotal,
          items: {
            create: transactionItems.map((item) => ({
              productVariantId: item.productVariantId,
              description: item.description,
              quantityOrdered: item.quantityOrdered,
              unitCost: item.unitCost,
              lineTotal: item.lineTotal,
            })),
          },
        },
        include: purchaseOrderInclude,
      });
    });

    await logActivity({
      action: "create",
      entity: "purchase_order",
      entityId: created.id,
      access,
      request,
      metadata: {
        message: `Created purchase order ${created.poNumber}`,
      },
      after: toPurchaseOrderLogSnapshot(created),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error("SCM PURCHASE ORDERS POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create purchase order." },
      { status: 500 },
    );
  }
}
