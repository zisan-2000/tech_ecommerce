import { Prisma, type PurchaseOrderLandedCostComponent } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import { getPurchaseOrderLandedCostLockReason, toDecimalAmount } from "@/lib/scm";

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
  if (value === null) return null;
  if (typeof value !== "string") return "";
  const text = value.trim().slice(0, max);
  return text.length > 0 ? text : null;
}

function toDateOrNull(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} is invalid.`);
  }
  return date;
}

function toSnapshot(row: {
  id: number;
  purchaseOrderId: number;
  component: string;
  amount: Prisma.Decimal;
  currency: string;
  note: string | null;
  incurredAt: Date;
  createdById: string | null;
}) {
  return {
    id: row.id,
    purchaseOrderId: row.purchaseOrderId,
    component: row.component,
    amount: row.amount.toString(),
    currency: row.currency,
    note: row.note,
    incurredAt: row.incurredAt.toISOString(),
    createdById: row.createdById,
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const landedCostId = Number(id);
    if (!Number.isInteger(landedCostId) || landedCostId <= 0) {
      return NextResponse.json(
        { error: "Invalid landed cost id." },
        { status: 400 },
      );
    }

    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await prisma.purchaseOrderLandedCost.findUnique({
      where: { id: landedCostId },
      include: {
        purchaseOrder: {
          select: {
            id: true,
            poNumber: true,
            status: true,
            warehouseId: true,
            goodsReceipts: {
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Landed cost not found." }, { status: 404 });
    }

    if (!access.can("landed_costs.manage", existing.purchaseOrder.warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const lockReason = getPurchaseOrderLandedCostLockReason({
      status: existing.purchaseOrder.status,
      hasGoodsReceipts: existing.purchaseOrder.goodsReceipts.length > 0,
    });
    if (lockReason) {
      return NextResponse.json({ error: lockReason }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      component?: unknown;
      amount?: unknown;
      note?: unknown;
      incurredAt?: unknown;
    };

    const data: Prisma.PurchaseOrderLandedCostUpdateInput = {};
    if (body.component !== undefined) {
      const component =
        typeof body.component === "string" ? body.component.trim().toUpperCase() : "";
      if (!isLandedCostComponent(component)) {
        return NextResponse.json(
          { error: "Invalid landed cost component." },
          { status: 400 },
        );
      }
      data.component = component as PurchaseOrderLandedCostComponent;
    }

    if (body.amount !== undefined) {
      const amount = toDecimalAmount(body.amount, "Amount");
      if (amount.lte(0)) {
        return NextResponse.json(
          { error: "Amount must be greater than 0." },
          { status: 400 },
        );
      }
      data.amount = amount;
    }

    if (body.note !== undefined) {
      const note = toCleanText(body.note, 500);
      data.note = note === "" ? null : note;
    }

    if (body.incurredAt !== undefined) {
      const incurredAt = toDateOrNull(body.incurredAt, "Incurred date");
      if (!incurredAt) {
        return NextResponse.json(
          { error: "Incurred date is required." },
          { status: 400 },
        );
      }
      data.incurredAt = incurredAt;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No update payload provided." },
        { status: 400 },
      );
    }

    const before = toSnapshot(existing);
    const updated = await prisma.purchaseOrderLandedCost.update({
      where: { id: landedCostId },
      data,
      include: {
        purchaseOrder: {
          select: {
            poNumber: true,
          },
        },
      },
    });

    await logActivity({
      action: "update",
      entity: "purchase_order_landed_cost",
      entityId: updated.id,
      access,
      request,
      metadata: {
        message: `Updated landed cost ${updated.id} on ${updated.purchaseOrder.poNumber}`,
      },
      before,
      after: toSnapshot(updated),
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("SCM LANDED COST PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update landed cost." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const landedCostId = Number(id);
    if (!Number.isInteger(landedCostId) || landedCostId <= 0) {
      return NextResponse.json(
        { error: "Invalid landed cost id." },
        { status: 400 },
      );
    }

    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await prisma.purchaseOrderLandedCost.findUnique({
      where: { id: landedCostId },
      include: {
        purchaseOrder: {
          select: {
            id: true,
            poNumber: true,
            status: true,
            warehouseId: true,
            goodsReceipts: {
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Landed cost not found." }, { status: 404 });
    }

    if (!access.can("landed_costs.manage", existing.purchaseOrder.warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const lockReason = getPurchaseOrderLandedCostLockReason({
      status: existing.purchaseOrder.status,
      hasGoodsReceipts: existing.purchaseOrder.goodsReceipts.length > 0,
    });
    if (lockReason) {
      return NextResponse.json({ error: lockReason }, { status: 400 });
    }

    const before = toSnapshot(existing);
    const deleted = await prisma.purchaseOrderLandedCost.delete({
      where: { id: landedCostId },
      include: {
        purchaseOrder: {
          select: {
            poNumber: true,
          },
        },
      },
    });

    await logActivity({
      action: "delete",
      entity: "purchase_order_landed_cost",
      entityId: deleted.id,
      access,
      request,
      metadata: {
        message: `Deleted landed cost ${deleted.id} from ${deleted.purchaseOrder.poNumber}`,
      },
      before,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("SCM LANDED COST DELETE ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to delete landed cost." },
      { status: 500 },
    );
  }
}
