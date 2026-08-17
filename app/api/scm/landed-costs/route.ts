import { Prisma, type PurchaseOrderLandedCostComponent } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  computePurchaseOrderLandedCostAllocation,
  getPurchaseOrderLandedCostLockReason,
  purchaseOrderInclude,
  toDecimalAmount,
} from "@/lib/scm";

const LANDED_COST_READ_PERMISSIONS = [
  "landed_costs.read",
  "landed_costs.manage",
] as const;

const LANDED_COST_COMPONENTS = [
  "FREIGHT",
  "CUSTOMS",
  "HANDLING",
  "INSURANCE",
  "CLEARING",
  "OTHER",
] as const;
const LANDED_COST_COMPONENT_VALUES = new Set<string>(LANDED_COST_COMPONENTS);

function isLandedCostComponent(
  value: string,
): value is (typeof LANDED_COST_COMPONENTS)[number] {
  return LANDED_COST_COMPONENT_VALUES.has(value);
}

function toCleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function toCurrencyCode(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().toUpperCase().slice(0, 3);
}

function toDateOrNull(value: unknown, field: string) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} is invalid.`);
  }
  return date;
}

function canReadLandedCosts(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasAny([...LANDED_COST_READ_PERMISSIONS]);
}

function hasGlobalLandedCostScope(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return LANDED_COST_READ_PERMISSIONS.some((permission) =>
    access.hasGlobal(permission),
  );
}

function canReadLandedCostsForWarehouse(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  warehouseId: number,
) {
  return LANDED_COST_READ_PERMISSIONS.some((permission) =>
    access.can(permission, warehouseId),
  );
}

function getScopedLandedCostWarehouseIds(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return access.warehouseIds.filter((warehouseId) =>
    canReadLandedCostsForWarehouse(access, warehouseId),
  );
}

function buildPurchaseOrderWorkspace(
  purchaseOrder: Prisma.PurchaseOrderGetPayload<{ include: typeof purchaseOrderInclude }>,
) {
  const allocation = computePurchaseOrderLandedCostAllocation(
    purchaseOrder.items.map((item) => ({
      id: item.id,
      quantityOrdered: item.quantityOrdered,
      unitCost: item.unitCost,
    })),
    purchaseOrder.landedCosts.map((cost) => ({ amount: cost.amount })),
  );
  const lockReason = getPurchaseOrderLandedCostLockReason({
    status: purchaseOrder.status,
    hasGoodsReceipts: purchaseOrder.goodsReceipts.length > 0,
  });

  return {
    id: purchaseOrder.id,
    poNumber: purchaseOrder.poNumber,
    status: purchaseOrder.status,
    orderDate: purchaseOrder.orderDate.toISOString(),
    expectedAt: purchaseOrder.expectedAt?.toISOString() ?? null,
    currency: purchaseOrder.currency,
    supplier: purchaseOrder.supplier,
    warehouse: purchaseOrder.warehouse,
    locked: Boolean(lockReason),
    lockReason,
    totals: {
      baseSubtotal: allocation.baseSubtotal.toString(),
      landedTotal: allocation.landedTotal.toString(),
      effectiveSubtotal: allocation.effectiveSubtotal.toString(),
    },
    landedCosts: purchaseOrder.landedCosts.map((cost) => ({
      id: cost.id,
      component: cost.component,
      amount: cost.amount.toString(),
      currency: cost.currency,
      note: cost.note,
      incurredAt: cost.incurredAt.toISOString(),
      createdAt: cost.createdAt.toISOString(),
      createdBy: cost.createdBy
        ? {
            id: cost.createdBy.id,
            name: cost.createdBy.name,
            email: cost.createdBy.email,
          }
        : null,
    })),
    allocationLines: allocation.lines.map((line) => {
      const purchaseOrderItem = purchaseOrder.items.find(
        (item) => item.id === line.purchaseOrderItemId,
      );
      return {
        purchaseOrderItemId: line.purchaseOrderItemId,
        variantId: purchaseOrderItem?.productVariantId ?? null,
        sku: purchaseOrderItem?.productVariant.sku ?? "",
        productName: purchaseOrderItem?.productVariant.product.name ?? "",
        quantityOrdered: line.quantityOrdered,
        baseUnitCost: line.baseUnitCost.toString(),
        landedPerUnit: line.landedPerUnit.toString(),
        effectiveUnitCost: line.effectiveUnitCost.toString(),
        baseLineTotal: line.baseLineTotal.toString(),
        landedAllocationTotal: line.landedAllocationTotal.toString(),
        effectiveLineTotal: line.effectiveLineTotal.toString(),
      };
    }),
  };
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
    if (!canReadLandedCosts(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const purchaseOrderId = Number(
      request.nextUrl.searchParams.get("purchaseOrderId") || "",
    );
    const warehouseId = Number(request.nextUrl.searchParams.get("warehouseId") || "");
    const hasGlobalScope = hasGlobalLandedCostScope(access);

    const scopedWarehouseIds = hasGlobalScope
      ? []
      : getScopedLandedCostWarehouseIds(access);
    if (!hasGlobalScope && scopedWarehouseIds.length === 0) {
      return NextResponse.json({
        purchaseOrders: [],
        selectedPurchaseOrder: null,
      });
    }

    const optionWhere: Prisma.PurchaseOrderWhereInput = {
      status: {
        in: [
          "DRAFT",
          "SUBMITTED",
          "MANAGER_APPROVED",
          "COMMITTEE_APPROVED",
          "APPROVED",
          "PARTIALLY_RECEIVED",
          "RECEIVED",
        ],
      },
    };

    if (hasGlobalScope) {
      if (Number.isInteger(warehouseId) && warehouseId > 0) {
        optionWhere.warehouseId = warehouseId;
      }
    } else if (Number.isInteger(warehouseId) && warehouseId > 0) {
      if (!scopedWarehouseIds.includes(warehouseId)) {
        return NextResponse.json({
          purchaseOrders: [],
          selectedPurchaseOrder: null,
        });
      }
      optionWhere.warehouseId = warehouseId;
    } else {
      optionWhere.warehouseId = { in: scopedWarehouseIds };
    }

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: optionWhere,
      orderBy: [{ orderDate: "desc" }, { id: "desc" }],
      take: 200,
      select: {
        id: true,
        poNumber: true,
        status: true,
        orderDate: true,
        expectedAt: true,
        currency: true,
        supplier: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        warehouse: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    let selectedPurchaseOrder: ReturnType<typeof buildPurchaseOrderWorkspace> | null =
      null;
    if (Number.isInteger(purchaseOrderId) && purchaseOrderId > 0) {
      const purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
        include: purchaseOrderInclude,
      });
      if (!purchaseOrder) {
        return NextResponse.json(
          { error: "Purchase order not found." },
          { status: 404 },
        );
      }

      if (
        !hasGlobalScope &&
        !canReadLandedCostsForWarehouse(access, purchaseOrder.warehouseId)
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      selectedPurchaseOrder = buildPurchaseOrderWorkspace(purchaseOrder);
    }

    return NextResponse.json({
      purchaseOrders: purchaseOrders.map((purchaseOrder) => ({
        ...purchaseOrder,
        orderDate: purchaseOrder.orderDate.toISOString(),
        expectedAt: purchaseOrder.expectedAt?.toISOString() ?? null,
      })),
      selectedPurchaseOrder,
    });
  } catch (error) {
    console.error("SCM LANDED COSTS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load landed cost workspace." },
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
      purchaseOrderId?: unknown;
      component?: unknown;
      amount?: unknown;
      currency?: unknown;
      note?: unknown;
      incurredAt?: unknown;
    };

    const purchaseOrderId = Number(body.purchaseOrderId);
    if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) {
      return NextResponse.json(
        { error: "Purchase order is required." },
        { status: 400 },
      );
    }

    const componentRaw =
      typeof body.component === "string" ? body.component.trim().toUpperCase() : "";
    if (!isLandedCostComponent(componentRaw)) {
      return NextResponse.json(
        { error: "Invalid landed cost component." },
        { status: 400 },
      );
    }

    const amount = toDecimalAmount(body.amount, "Amount");
    if (amount.lte(0)) {
      return NextResponse.json(
        { error: "Amount must be greater than 0." },
        { status: 400 },
      );
    }

    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      select: {
        id: true,
        poNumber: true,
        status: true,
        warehouseId: true,
        currency: true,
        goodsReceipts: {
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!purchaseOrder) {
      return NextResponse.json(
        { error: "Purchase order not found." },
        { status: 404 },
      );
    }

    if (!access.can("landed_costs.manage", purchaseOrder.warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const lockReason = getPurchaseOrderLandedCostLockReason({
      status: purchaseOrder.status,
      hasGoodsReceipts: purchaseOrder.goodsReceipts.length > 0,
    });
    if (lockReason) {
      return NextResponse.json({ error: lockReason }, { status: 400 });
    }

    const currency = toCurrencyCode(body.currency) || purchaseOrder.currency;
    if (currency !== purchaseOrder.currency) {
      return NextResponse.json(
        {
          error: `Currency mismatch. Purchase order currency is ${purchaseOrder.currency}.`,
        },
        { status: 400 },
      );
    }

    const incurredAt = toDateOrNull(body.incurredAt, "Incurred date") ?? new Date();
    const note = toCleanText(body.note, 500) || null;

    const created = await prisma.purchaseOrderLandedCost.create({
      data: {
        purchaseOrderId,
        component: componentRaw as PurchaseOrderLandedCostComponent,
        amount,
        currency,
        note,
        incurredAt,
        createdById: access.userId,
      },
      include: {
        purchaseOrder: {
          select: {
            id: true,
            poNumber: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    await logActivity({
      action: "create",
      entity: "purchase_order_landed_cost",
      entityId: created.id,
      access,
      request,
      metadata: {
        message: `Added landed cost ${created.component} (${created.amount.toString()} ${created.currency}) to ${created.purchaseOrder.poNumber}`,
      },
      after: {
        id: created.id,
        purchaseOrderId: created.purchaseOrderId,
        purchaseOrderNumber: created.purchaseOrder.poNumber,
        component: created.component,
        amount: created.amount.toString(),
        currency: created.currency,
        note: created.note,
        incurredAt: created.incurredAt.toISOString(),
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error("SCM LANDED COSTS POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to save landed cost." },
      { status: 500 },
    );
  }
}
