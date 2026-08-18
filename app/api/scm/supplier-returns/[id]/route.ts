import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import { dispatchVariantInventory } from "@/lib/inventory";
import { revalidateStorefrontCatalog } from "@/lib/storefront-catalog-cache";
import {
  refreshSupplierReturnStatus,
  supplierReturnInclude,
  syncSupplierInvoicePaymentStatus,
  toSupplierReturnLogSnapshot,
} from "@/lib/scm";

const SUPPLIER_RETURN_READ_PERMISSIONS = [
  "supplier_returns.read",
  "supplier_returns.manage",
  "supplier_returns.approve",
] as const;

function cleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canReadSupplierReturns(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return access.hasAny([...SUPPLIER_RETURN_READ_PERMISSIONS]);
}

function hasGlobalSupplierReturnScope(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return SUPPLIER_RETURN_READ_PERMISSIONS.some((permission) =>
    access.hasGlobal(permission),
  );
}

function canAccessSupplierReturn(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  supplierReturn: { warehouseId: number },
) {
  return (
    hasGlobalSupplierReturnScope(access) ||
    access.canAccessWarehouse(supplierReturn.warehouseId)
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supplierReturnId = Number(id);
    if (!Number.isInteger(supplierReturnId) || supplierReturnId <= 0) {
      return NextResponse.json(
        { error: "Invalid supplier return id." },
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
    if (!canReadSupplierReturns(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supplierReturn = await prisma.supplierReturn.findUnique({
      where: { id: supplierReturnId },
      include: supplierReturnInclude,
    });
    if (!supplierReturn) {
      return NextResponse.json(
        { error: "Supplier return not found." },
        { status: 404 },
      );
    }
    if (!canAccessSupplierReturn(access, supplierReturn)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(supplierReturn);
  } catch (error) {
    console.error("SCM SUPPLIER RETURN GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load supplier return." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supplierReturnId = Number(id);
    if (!Number.isInteger(supplierReturnId) || supplierReturnId <= 0) {
      return NextResponse.json(
        { error: "Invalid supplier return id." },
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

    const supplierReturn = await prisma.supplierReturn.findUnique({
      where: { id: supplierReturnId },
      include: supplierReturnInclude,
    });
    if (!supplierReturn) {
      return NextResponse.json(
        { error: "Supplier return not found." },
        { status: 404 },
      );
    }
    if (!canAccessSupplierReturn(access, supplierReturn)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      requiredBy?: unknown;
      reasonCode?: unknown;
      note?: unknown;
      items?: Array<{
        itemId?: unknown;
        quantity?: unknown;
      }>;
    };

    const action =
      typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
    const before = toSupplierReturnLogSnapshot(supplierReturn);

    if (!action) {
      if (!access.can("supplier_returns.manage", supplierReturn.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (supplierReturn.status !== "DRAFT") {
        return NextResponse.json(
          { error: "Only draft supplier returns can be edited." },
          { status: 400 },
        );
      }

      const requiredBy = body.requiredBy ? new Date(String(body.requiredBy)) : null;
      if (requiredBy && Number.isNaN(requiredBy.getTime())) {
        return NextResponse.json(
          { error: "Required-by date is invalid." },
          { status: 400 },
        );
      }

      const updated = await prisma.supplierReturn.update({
        where: { id: supplierReturn.id },
        data: {
          requiredBy,
          reasonCode: cleanText(body.reasonCode, 120) || null,
          note: cleanText(body.note, 500) || null,
        },
        include: supplierReturnInclude,
      });

      await logActivity({
        action: "update",
        entity: "supplier_return",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Updated supplier return ${updated.returnNumber}`,
        },
        before,
        after: toSupplierReturnLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "submit") {
      if (!access.can("supplier_returns.manage", supplierReturn.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (supplierReturn.status !== "DRAFT") {
        return NextResponse.json(
          { error: "Only draft supplier returns can be submitted." },
          { status: 400 },
        );
      }

      const updated = await prisma.supplierReturn.update({
        where: { id: supplierReturn.id },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
        },
        include: supplierReturnInclude,
      });

      await logActivity({
        action: "submit",
        entity: "supplier_return",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Submitted supplier return ${updated.returnNumber}`,
        },
        before,
        after: toSupplierReturnLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "approve") {
      if (!access.can("supplier_returns.approve", supplierReturn.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (supplierReturn.status !== "SUBMITTED") {
        return NextResponse.json(
          { error: "Only submitted supplier returns can be approved." },
          { status: 400 },
        );
      }

      const updated = await prisma.supplierReturn.update({
        where: { id: supplierReturn.id },
        data: {
          status: "APPROVED",
          approvedAt: new Date(),
          approvedById: access.userId,
        },
        include: supplierReturnInclude,
      });

      await logActivity({
        action: "approve",
        entity: "supplier_return",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Approved supplier return ${updated.returnNumber}`,
        },
        before,
        after: toSupplierReturnLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "cancel") {
      if (
        !access.can("supplier_returns.manage", supplierReturn.warehouseId) &&
        !access.can("supplier_returns.approve", supplierReturn.warehouseId)
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!["DRAFT", "SUBMITTED", "APPROVED"].includes(supplierReturn.status)) {
        return NextResponse.json(
          { error: "This supplier return can no longer be cancelled." },
          { status: 400 },
        );
      }

      const updated = await prisma.supplierReturn.update({
        where: { id: supplierReturn.id },
        data: {
          status: "CANCELLED",
        },
        include: supplierReturnInclude,
      });

      await logActivity({
        action: "cancel",
        entity: "supplier_return",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Cancelled supplier return ${updated.returnNumber}`,
        },
        before,
        after: toSupplierReturnLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "dispatch") {
      if (!access.can("supplier_returns.manage", supplierReturn.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (
        !["APPROVED", "PARTIALLY_DISPATCHED"].includes(supplierReturn.status)
      ) {
        return NextResponse.json(
          { error: "Only approved supplier returns can be dispatched." },
          { status: 400 },
        );
      }

      const requestedItems = Array.isArray(body.items) ? body.items : [];
      const dispatchItems =
        requestedItems.length > 0
          ? requestedItems.map((item, index) => {
              const itemId = Number(item.itemId);
              const quantity = Number(item.quantity);
              if (!Number.isInteger(itemId) || itemId <= 0) {
                throw new Error(`Dispatch item ${index + 1}: item id is required`);
              }
              if (!Number.isInteger(quantity) || quantity <= 0) {
                throw new Error(
                  `Dispatch item ${index + 1}: quantity must be greater than 0`,
                );
              }
              return { itemId, quantity };
            })
          : supplierReturn.items
              .map((item) => ({
                itemId: item.id,
                quantity: item.quantityRequested - item.quantityDispatched,
              }))
              .filter((item) => item.quantity > 0);

      if (dispatchItems.length === 0) {
        return NextResponse.json(
          { error: "No remaining supplier return quantity is available to dispatch." },
          { status: 400 },
        );
      }

      const returnItemMap = new Map(supplierReturn.items.map((item) => [item.id, item]));
      const otherDispatches = await prisma.supplierReturnItem.findMany({
        where: {
          goodsReceiptItemId: {
            in: supplierReturn.items
              .map((item) => item.goodsReceiptItemId)
              .filter((value): value is number => Number.isInteger(value)),
          },
          supplierReturnId: {
            not: supplierReturn.id,
          },
          supplierReturn: {
            status: {
              not: "CANCELLED",
            },
          },
        },
        select: {
          goodsReceiptItemId: true,
          quantityDispatched: true,
        },
      });

      const otherDispatchedByReceiptItem = otherDispatches.reduce<Map<number, number>>(
        (acc, item) => {
          if (!item.goodsReceiptItemId) return acc;
          acc.set(
            item.goodsReceiptItemId,
            (acc.get(item.goodsReceiptItemId) ?? 0) + item.quantityDispatched,
          );
          return acc;
        },
        new Map(),
      );

      for (const item of dispatchItems) {
        const returnItem = returnItemMap.get(item.itemId);
        if (!returnItem) {
          return NextResponse.json(
            { error: `Return item ${item.itemId} not found.` },
            { status: 400 },
          );
        }

        const remainingRequested =
          returnItem.quantityRequested - returnItem.quantityDispatched;
        if (item.quantity > remainingRequested) {
          return NextResponse.json(
            {
              error: `Dispatch quantity for ${returnItem.productVariant.sku} exceeds requested balance.`,
            },
            { status: 400 },
          );
        }

        const goodsReceiptBalance =
          Number(returnItem.goodsReceiptItem?.quantityReceived ?? 0) -
          (otherDispatchedByReceiptItem.get(returnItem.goodsReceiptItemId ?? -1) ?? 0) -
          returnItem.quantityDispatched;
        if (item.quantity > goodsReceiptBalance) {
          return NextResponse.json(
            {
              error: `Dispatch quantity for ${returnItem.productVariant.sku} exceeds remaining receipted stock eligible for supplier return.`,
            },
            { status: 400 },
          );
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        for (const item of dispatchItems) {
          const returnItem = returnItemMap.get(item.itemId);
          if (!returnItem) {
            throw new Error("Supplier return item lookup failed");
          }

          await dispatchVariantInventory({
            tx,
            productId: returnItem.productVariant.productId,
            productVariantId: returnItem.productVariantId,
            warehouseId: supplierReturn.warehouseId,
            quantity: item.quantity,
            reason: `Supplier return ${supplierReturn.returnNumber} dispatch from ${supplierReturn.warehouse.code}`,
          });

          await tx.supplierReturnItem.update({
            where: { id: returnItem.id },
            data: {
              quantityDispatched: {
                increment: item.quantity,
              },
            },
          });
        }

        await tx.supplierReturn.update({
          where: { id: supplierReturn.id },
          data: {
            dispatchedById: access.userId,
          },
        });

        return refreshSupplierReturnStatus(tx, supplierReturn.id);
      });

      revalidateStorefrontCatalog();

      await logActivity({
        action: "dispatch",
        entity: "supplier_return",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Dispatched supplier return ${updated.returnNumber}`,
        },
        before,
        after: toSupplierReturnLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "close") {
      if (!access.can("supplier_returns.approve", supplierReturn.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (supplierReturn.status !== "DISPATCHED") {
        return NextResponse.json(
          { error: "Only fully dispatched supplier returns can be closed." },
          { status: 400 },
        );
      }
      if (supplierReturn.closedAt || supplierReturn.ledgerPostedAt) {
        return NextResponse.json(
          { error: "This supplier return has already been closed." },
          { status: 400 },
        );
      }

      const totalDispatchedQty = supplierReturn.items.reduce(
        (sum, item) => sum + item.quantityDispatched,
        0,
      );
      const creditAmount = supplierReturn.items.reduce(
        (sum, item) =>
          sum.plus(item.unitCost.mul(item.quantityDispatched)),
        new Prisma.Decimal(0),
      );
      if (totalDispatchedQty <= 0) {
        return NextResponse.json(
          { error: "No dispatched supplier return quantity is available to close." },
          { status: 400 },
        );
      }
      if (creditAmount.lte(0)) {
        return NextResponse.json(
          {
            error:
              "Dispatched quantity exists, but the supplier return credit value is 0.00. Review the linked PO/GR unit cost before closing.",
          },
          { status: 400 },
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        if (supplierReturn.supplierInvoiceId) {
          const invoice = await tx.supplierInvoice.findUnique({
            where: { id: supplierReturn.supplierInvoiceId },
            select: {
              id: true,
              total: true,
              payments: {
                select: {
                  amount: true,
                },
              },
              ledgerEntries: {
                where: {
                  entryType: "ADJUSTMENT",
                  direction: "CREDIT",
                },
                select: {
                  amount: true,
                },
              },
            },
          });

          if (!invoice) {
            throw new Error("Linked supplier invoice was not found.");
          }

          const settledFromPayments = invoice.payments.reduce(
            (sum, payment) => sum.plus(payment.amount),
            new Prisma.Decimal(0),
          );
          const settledFromAdjustments = invoice.ledgerEntries.reduce(
            (sum, entry) => sum.plus(entry.amount),
            new Prisma.Decimal(0),
          );
          const outstanding = invoice.total
            .minus(settledFromPayments)
            .minus(settledFromAdjustments);

          if (creditAmount.gt(outstanding)) {
            throw new Error(
              "Supplier return credit exceeds the linked invoice outstanding balance.",
            );
          }
        }

        await tx.supplierLedgerEntry.create({
          data: {
            supplierId: supplierReturn.supplierId,
            entryDate: new Date(),
            entryType: "ADJUSTMENT",
            direction: "CREDIT",
            amount: creditAmount,
            currency: supplierReturn.supplier.currency,
            note:
              supplierReturn.note ||
              `Closed supplier return ${supplierReturn.returnNumber}`,
            referenceType: "SUPPLIER_RETURN",
            referenceNumber: supplierReturn.returnNumber,
            purchaseOrderId: supplierReturn.purchaseOrderId,
            supplierInvoiceId: supplierReturn.supplierInvoiceId,
            supplierReturnId: supplierReturn.id,
            createdById: access.userId,
          },
        });

        const closed = await tx.supplierReturn.update({
          where: { id: supplierReturn.id },
          data: {
            status: "CLOSED",
            closedAt: new Date(),
            ledgerPostedAt: new Date(),
            closedById: access.userId,
          },
          include: supplierReturnInclude,
        });

        if (supplierReturn.supplierInvoiceId) {
          await syncSupplierInvoicePaymentStatus(tx, supplierReturn.supplierInvoiceId);
        }

        return closed;
      });

      await logActivity({
        action: "close",
        entity: "supplier_return",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Closed supplier return ${updated.returnNumber}`,
        },
        before,
        after: toSupplierReturnLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error: any) {
    console.error("SCM SUPPLIER RETURN PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update supplier return." },
      { status: 500 },
    );
  }
}
