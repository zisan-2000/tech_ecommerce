import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import { receiveVariantInventory } from "@/lib/inventory";
import { revalidateStorefrontCatalog } from "@/lib/storefront-catalog-cache";
import {
  computePurchaseOrderLandedCostAllocation,
  generateGoodsReceiptNumber,
  getPurchaseOrderLandedCostLockReason,
  goodsReceiptInclude,
  purchaseOrderInclude,
  refreshPurchaseOrderReceiptStatus,
  toGoodsReceiptLogSnapshot,
} from "@/lib/scm";
import { Prisma } from "@/generated/prisma";

const GOODS_RECEIPT_READ_PERMISSIONS = [
  "goods_receipts.read",
  "goods_receipts.manage",
] as const;
const GOODS_RECEIPT_EXTENDED_READ_PERMISSIONS = [
  ...GOODS_RECEIPT_READ_PERMISSIONS,
  "purchase_orders.manage",
  "purchase_requisitions.manage",
  "supplier.feedback.manage",
] as const;

const PROCUREMENT_EVALUATION_PERMISSIONS = [
  "purchase_orders.manage",
  "purchase_orders.approve_manager",
  "purchase_orders.approve_committee",
  "purchase_orders.approve_final",
] as const;

function toCleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canReadGoodsReceipts(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasAny([...GOODS_RECEIPT_EXTENDED_READ_PERMISSIONS]);
}

function hasGlobalGoodsReceiptScope(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return GOODS_RECEIPT_EXTENDED_READ_PERMISSIONS.some((permission) =>
    access.hasGlobal(permission),
  );
}

type ReceiptWithRelations = Prisma.GoodsReceiptGetPayload<{
  include: typeof goodsReceiptInclude;
}>;

function resolveRequesterUserId(receipt: ReceiptWithRelations) {
  return (
    receipt.purchaseOrder.purchaseRequisition?.createdById ??
    receipt.purchaseOrder.createdById ??
    null
  );
}

function canRequesterConfirmReceipt(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  receipt: ReceiptWithRelations,
) {
  if (receipt.requesterConfirmedAt) return false;
  const requesterUserId = resolveRequesterUserId(receipt);
  if (!requesterUserId) return false;
  return (
    access.userId === requesterUserId ||
    access.can("purchase_requisitions.approve", receipt.warehouseId)
  );
}

function canManageReceiptAttachments(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  receipt: ReceiptWithRelations,
) {
  const requesterUserId = resolveRequesterUserId(receipt);
  return (
    access.can("goods_receipts.manage", receipt.warehouseId) ||
    access.can("purchase_orders.manage", receipt.warehouseId) ||
    (requesterUserId !== null && requesterUserId === access.userId)
  );
}

function resolveAllowedEvaluationRoles(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  receipt: ReceiptWithRelations,
) {
  const requesterUserId = resolveRequesterUserId(receipt);
  const isRequester = requesterUserId !== null && requesterUserId === access.userId;

  const roles = new Set<"REQUESTER" | "PROCUREMENT" | "ADMINISTRATION">();
  if (isRequester || access.can("purchase_requisitions.approve", receipt.warehouseId)) {
    roles.add("REQUESTER");
  }
  if (
    PROCUREMENT_EVALUATION_PERMISSIONS.some((permission) =>
      access.can(permission, receipt.warehouseId),
    )
  ) {
    roles.add("PROCUREMENT");
  }
  if (
    access.hasGlobal("supplier.feedback.manage") ||
    access.hasGlobal("suppliers.manage") ||
    access.hasGlobal("users.manage")
  ) {
    roles.add("ADMINISTRATION");
  }
  return [...roles];
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
    if (!canReadGoodsReceipts(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const purchaseOrderId = Number(
      request.nextUrl.searchParams.get("purchaseOrderId") || "",
    );
    const warehouseId = Number(request.nextUrl.searchParams.get("warehouseId") || "");

    const where: Record<string, unknown> = {};
    if (Number.isInteger(purchaseOrderId) && purchaseOrderId > 0) {
      where.purchaseOrderId = purchaseOrderId;
    }

    if (hasGlobalGoodsReceiptScope(access)) {
      if (Number.isInteger(warehouseId) && warehouseId > 0) {
        where.warehouseId = warehouseId;
      }
    } else if (Number.isInteger(warehouseId) && warehouseId > 0) {
      if (!access.canAccessWarehouse(warehouseId)) {
        return NextResponse.json([]);
      }
      where.warehouseId = warehouseId;
    } else if (access.warehouseIds.length > 0) {
      where.warehouseId = { in: access.warehouseIds };
    } else {
      return NextResponse.json([]);
    }

    const receipts = await prisma.goodsReceipt.findMany({
      where,
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      include: goodsReceiptInclude,
    });

    const purchaseOrderIds = [...new Set(receipts.map((receipt) => receipt.purchaseOrderId))];
    const invoiceRows =
      purchaseOrderIds.length === 0
        ? []
        : await prisma.supplierInvoice.findMany({
            where: {
              purchaseOrderId: { in: purchaseOrderIds },
              status: { not: "CANCELLED" },
            },
            select: {
              purchaseOrderId: true,
              matchStatus: true,
              items: {
                select: { quantityInvoiced: true },
              },
            },
          });

    const invoiceSummaryByPo = new Map<
      number,
      {
        invoiceCount: number;
        invoicedQuantity: number;
        hasVariance: boolean;
        allMatched: boolean;
      }
    >();

    for (const row of invoiceRows) {
      if (!row.purchaseOrderId) continue;
      const current = invoiceSummaryByPo.get(row.purchaseOrderId) ?? {
        invoiceCount: 0,
        invoicedQuantity: 0,
        hasVariance: false,
        allMatched: true,
      };
      current.invoiceCount += 1;
      current.invoicedQuantity += row.items.reduce(
        (sum, item) => sum + item.quantityInvoiced,
        0,
      );
      current.hasVariance ||= row.matchStatus === "VARIANCE";
      current.allMatched &&= row.matchStatus === "MATCHED";
      invoiceSummaryByPo.set(row.purchaseOrderId, current);
    }

    const payload = receipts.map((receipt) => {
      const poOrderedQty = receipt.purchaseOrder.items.reduce(
        (sum, item) => sum + item.quantityOrdered,
        0,
      );
      const poReceivedQty = receipt.purchaseOrder.items.reduce(
        (sum, item) => sum + item.quantityReceived,
        0,
      );
      const invoiceSummary = invoiceSummaryByPo.get(receipt.purchaseOrderId) ?? {
        invoiceCount: 0,
        invoicedQuantity: 0,
        hasVariance: false,
        allMatched: false,
      };
      const overallMatchStatus: "PENDING" | "MATCHED" | "VARIANCE" =
        invoiceSummary.invoiceCount === 0
          ? "PENDING"
          : invoiceSummary.hasVariance
            ? "VARIANCE"
            : invoiceSummary.allMatched
              ? "MATCHED"
              : "PENDING";

      const allowedEvaluationRoles = resolveAllowedEvaluationRoles(access, receipt);
      const submittedRoles = new Set(
        receipt.vendorEvaluations.map((evaluation) => evaluation.evaluatorRole),
      );
      const requiredRoles = ["REQUESTER", "PROCUREMENT", "ADMINISTRATION"] as const;

      return {
        ...receipt,
        workflow: {
          requesterUserId: resolveRequesterUserId(receipt),
          requesterConfirmed: Boolean(receipt.requesterConfirmedAt),
          canRequesterConfirm: canRequesterConfirmReceipt(access, receipt),
          canManageAttachments: canManageReceiptAttachments(access, receipt),
          allowedEvaluationRoles,
          submittedEvaluationRoles: [...submittedRoles],
          missingEvaluationRoles: requiredRoles.filter((role) => !submittedRoles.has(role)),
          evaluationCompleted: requiredRoles.every((role) => submittedRoles.has(role)),
        },
        matchSummary: {
          orderedQuantity: poOrderedQty,
          receivedQuantity: poReceivedQty,
          invoicedQuantity: invoiceSummary.invoicedQuantity,
          invoiceCount: invoiceSummary.invoiceCount,
          status: overallMatchStatus,
        },
      };
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error("SCM GOODS RECEIPTS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load goods receipts." },
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
      note?: unknown;
      items?: Array<{
        purchaseOrderItemId?: unknown;
        quantityReceived?: unknown;
      }>;
    };

    const purchaseOrderId = Number(body.purchaseOrderId);
    if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) {
      return NextResponse.json(
        { error: "Purchase order is required." },
        { status: 400 },
      );
    }

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
    if (!access.can("goods_receipts.manage", purchaseOrder.warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!["APPROVED", "PARTIALLY_RECEIVED"].includes(purchaseOrder.status)) {
      return NextResponse.json(
        {
          error:
            "Only approved or partially received purchase orders can be received into stock.",
        },
        { status: 400 },
      );
    }

    const items = Array.isArray(body.items) ? body.items : [];
    const normalizedItems = items
      .map((item, index) => {
        const purchaseOrderItemId = Number(item.purchaseOrderItemId);
        const quantityReceived = Number(item.quantityReceived);
        if (!Number.isInteger(purchaseOrderItemId) || purchaseOrderItemId <= 0) {
          throw new Error(`Item ${index + 1}: purchase order item is required`);
        }
        if (!Number.isInteger(quantityReceived) || quantityReceived <= 0) {
          throw new Error(`Item ${index + 1}: quantity must be greater than 0`);
        }
        return {
          purchaseOrderItemId,
          quantityReceived,
        };
      })
      .filter((item) => item.quantityReceived > 0);

    if (normalizedItems.length === 0) {
      return NextResponse.json(
        { error: "At least one receipt line with a positive quantity is required." },
        { status: 400 },
      );
    }

    const purchaseOrderItemMap = new Map(
      purchaseOrder.items.map((item) => [item.id, item]),
    );
    const landedAllocation = computePurchaseOrderLandedCostAllocation(
      purchaseOrder.items.map((item) => ({
        id: item.id,
        quantityOrdered: item.quantityOrdered,
        unitCost: item.unitCost,
      })),
      purchaseOrder.landedCosts.map((cost) => ({
        amount: cost.amount,
      })),
    );
    const landedAllocationByItemId = new Map(
      landedAllocation.lines.map((line) => [line.purchaseOrderItemId, line]),
    );
    const landedCostLockedReason = getPurchaseOrderLandedCostLockReason({
      status: purchaseOrder.status,
      hasGoodsReceipts: purchaseOrder.goodsReceipts.length > 0,
    });
    for (const item of normalizedItems) {
      const purchaseOrderItem = purchaseOrderItemMap.get(item.purchaseOrderItemId);
      if (!purchaseOrderItem) {
        return NextResponse.json(
          { error: `Purchase order item ${item.purchaseOrderItemId} not found.` },
          { status: 400 },
        );
      }
      const remaining =
        purchaseOrderItem.quantityOrdered - purchaseOrderItem.quantityReceived;
      if (item.quantityReceived > remaining) {
        return NextResponse.json(
          {
            error: `Receipt quantity for ${purchaseOrderItem.productVariant.sku} exceeds remaining quantity.`,
          },
          { status: 400 },
        );
      }
    }

    const createdReceipt = await prisma.$transaction(async (tx) => {
      const receiptNumber = await generateGoodsReceiptNumber(tx);
      const created = await tx.goodsReceipt.create({
        data: {
          receiptNumber,
          purchaseOrderId: purchaseOrder.id,
          warehouseId: purchaseOrder.warehouseId,
          note: toCleanText(body.note, 500) || null,
          receivedById: access.userId,
        },
      });

      for (const item of normalizedItems) {
        const purchaseOrderItem = purchaseOrderItemMap.get(item.purchaseOrderItemId);
        if (!purchaseOrderItem) {
          throw new Error("Purchase order item lookup failed");
        }

        await tx.purchaseOrderItem.update({
          where: { id: purchaseOrderItem.id },
          data: {
            quantityReceived: {
              increment: item.quantityReceived,
            },
          },
        });

        await tx.goodsReceiptItem.create({
          data: {
            goodsReceiptId: created.id,
            purchaseOrderItemId: purchaseOrderItem.id,
            productVariantId: purchaseOrderItem.productVariantId,
            quantityReceived: item.quantityReceived,
            unitCost: (
              landedAllocationByItemId.get(purchaseOrderItem.id)?.effectiveUnitCost ??
              purchaseOrderItem.unitCost
            ).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
          },
        });

        await receiveVariantInventory({
          tx,
          productId: purchaseOrderItem.productVariant.productId,
          productVariantId: purchaseOrderItem.productVariantId,
          warehouseId: purchaseOrder.warehouseId,
          quantity: item.quantityReceived,
          reason: `Goods receipt ${receiptNumber} against ${purchaseOrder.poNumber}`,
        });
      }

      await refreshPurchaseOrderReceiptStatus(tx, purchaseOrder.id);

      const receipt = await tx.goodsReceipt.findUnique({
        where: { id: created.id },
        include: goodsReceiptInclude,
      });
      if (!receipt) {
        throw new Error("Goods receipt lookup failed after create");
      }
      return receipt;
    });

    revalidateStorefrontCatalog();

    await logActivity({
      action: "create",
      entity: "goods_receipt",
      entityId: createdReceipt.id,
      access,
      request,
      metadata: {
        message: `Received goods via ${createdReceipt.receiptNumber} for ${createdReceipt.purchaseOrder.poNumber}${landedCostLockedReason ? " (landed costs locked after receipt)" : ""}`,
      },
      after: toGoodsReceiptLogSnapshot(createdReceipt),
    });

    return NextResponse.json(createdReceipt, { status: 201 });
  } catch (error: any) {
    console.error("SCM GOODS RECEIPTS POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create goods receipt." },
      { status: 500 },
    );
  }
}
