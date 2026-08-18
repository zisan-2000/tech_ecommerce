import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import { dispatchVariantInventory, receiveVariantInventory } from "@/lib/inventory";
import { revalidateStorefrontCatalog } from "@/lib/storefront-catalog-cache";
import {
  refreshWarehouseTransferStatus,
  toWarehouseTransferLogSnapshot,
  warehouseTransferInclude,
} from "@/lib/scm";

const WAREHOUSE_TRANSFER_READ_PERMISSIONS = [
  "warehouse_transfers.read",
  "warehouse_transfers.manage",
  "warehouse_transfers.approve",
] as const;

function cleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canReadWarehouseTransfers(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return access.hasAny([...WAREHOUSE_TRANSFER_READ_PERMISSIONS]);
}

function hasGlobalWarehouseTransferScope(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return WAREHOUSE_TRANSFER_READ_PERMISSIONS.some((permission) =>
    access.hasGlobal(permission),
  );
}

function canAccessTransfer(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  transfer: { sourceWarehouseId: number; destinationWarehouseId: number },
) {
  return (
    hasGlobalWarehouseTransferScope(access) ||
    access.canAccessWarehouse(transfer.sourceWarehouseId) ||
    access.canAccessWarehouse(transfer.destinationWarehouseId)
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const warehouseTransferId = Number(id);
    if (!Number.isInteger(warehouseTransferId) || warehouseTransferId <= 0) {
      return NextResponse.json(
        { error: "Invalid warehouse transfer id." },
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
    if (!canReadWarehouseTransfers(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const transfer = await prisma.warehouseTransfer.findUnique({
      where: { id: warehouseTransferId },
      include: warehouseTransferInclude,
    });
    if (!transfer) {
      return NextResponse.json(
        { error: "Warehouse transfer not found." },
        { status: 404 },
      );
    }
    if (!canAccessTransfer(access, transfer)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(transfer);
  } catch (error) {
    console.error("SCM WAREHOUSE TRANSFER GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load warehouse transfer." },
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
    const warehouseTransferId = Number(id);
    if (!Number.isInteger(warehouseTransferId) || warehouseTransferId <= 0) {
      return NextResponse.json(
        { error: "Invalid warehouse transfer id." },
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

    const transfer = await prisma.warehouseTransfer.findUnique({
      where: { id: warehouseTransferId },
      include: warehouseTransferInclude,
    });
    if (!transfer) {
      return NextResponse.json(
        { error: "Warehouse transfer not found." },
        { status: 404 },
      );
    }
    if (!canAccessTransfer(access, transfer)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      requiredBy?: unknown;
      note?: unknown;
      items?: Array<{
        itemId?: unknown;
        quantity?: unknown;
      }>;
    };
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
    const before = toWarehouseTransferLogSnapshot(transfer);

    if (!action) {
      if (!access.can("warehouse_transfers.manage", transfer.sourceWarehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (transfer.status !== "DRAFT") {
        return NextResponse.json(
          { error: "Only draft transfers can be edited." },
          { status: 400 },
        );
      }
      const requiredBy = body.requiredBy ? new Date(String(body.requiredBy)) : null;
      if (requiredBy && Number.isNaN(requiredBy.getTime())) {
        return NextResponse.json(
          { error: "Required date is invalid." },
          { status: 400 },
        );
      }
      const updated = await prisma.warehouseTransfer.update({
        where: { id: transfer.id },
        data: {
          requiredBy,
          note: cleanText(body.note, 500) || null,
        },
        include: warehouseTransferInclude,
      });

      await logActivity({
        action: "update",
        entity: "warehouse_transfer",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Updated warehouse transfer ${updated.transferNumber}`,
        },
        before,
        after: toWarehouseTransferLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "submit") {
      if (!access.can("warehouse_transfers.manage", transfer.sourceWarehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (transfer.status !== "DRAFT") {
        return NextResponse.json(
          { error: "Only draft transfers can be submitted." },
          { status: 400 },
        );
      }
      const updated = await prisma.warehouseTransfer.update({
        where: { id: transfer.id },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
        },
        include: warehouseTransferInclude,
      });

      await logActivity({
        action: "submit",
        entity: "warehouse_transfer",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Submitted warehouse transfer ${updated.transferNumber}`,
        },
        before,
        after: toWarehouseTransferLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "approve") {
      if (!access.can("warehouse_transfers.approve", transfer.sourceWarehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (transfer.status !== "SUBMITTED") {
        return NextResponse.json(
          { error: "Only submitted transfers can be approved." },
          { status: 400 },
        );
      }
      const updated = await prisma.warehouseTransfer.update({
        where: { id: transfer.id },
        data: {
          status: "APPROVED",
          approvedAt: new Date(),
          approvedById: access.userId,
        },
        include: warehouseTransferInclude,
      });

      await logActivity({
        action: "approve",
        entity: "warehouse_transfer",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Approved warehouse transfer ${updated.transferNumber}`,
        },
        before,
        after: toWarehouseTransferLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "cancel") {
      if (
        !access.can("warehouse_transfers.manage", transfer.sourceWarehouseId) &&
        !access.can("warehouse_transfers.approve", transfer.sourceWarehouseId)
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!["DRAFT", "SUBMITTED", "APPROVED"].includes(transfer.status)) {
        return NextResponse.json(
          { error: "This warehouse transfer can no longer be cancelled." },
          { status: 400 },
        );
      }
      const updated = await prisma.warehouseTransfer.update({
        where: { id: transfer.id },
        data: {
          status: "CANCELLED",
        },
        include: warehouseTransferInclude,
      });

      await logActivity({
        action: "cancel",
        entity: "warehouse_transfer",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Cancelled warehouse transfer ${updated.transferNumber}`,
        },
        before,
        after: toWarehouseTransferLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "dispatch") {
      if (!access.can("warehouse_transfers.manage", transfer.sourceWarehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!["APPROVED", "PARTIALLY_DISPATCHED", "PARTIALLY_RECEIVED"].includes(transfer.status)) {
        return NextResponse.json(
          { error: "Only approved transfers can be dispatched." },
          { status: 400 },
        );
      }

      const requestedItems = Array.isArray(body.items) ? body.items : [];
      const dispatchItems =
        requestedItems.length > 0
          ? requestedItems
              .map((item, index) => {
                const itemId = Number(item.itemId);
                const quantity = Number(item.quantity);
                if (!Number.isInteger(itemId) || itemId <= 0) {
                  throw new Error(`Dispatch item ${index + 1}: item id is required`);
                }
                if (!Number.isInteger(quantity) || quantity <= 0) {
                  throw new Error(`Dispatch item ${index + 1}: quantity must be greater than 0`);
                }
                return { itemId, quantity };
              })
          : transfer.items
              .map((item) => ({
                itemId: item.id,
                quantity: item.quantityRequested - item.quantityDispatched,
              }))
              .filter((item) => item.quantity > 0);

      if (dispatchItems.length === 0) {
        return NextResponse.json(
          { error: "No remaining transfer quantity is available to dispatch." },
          { status: 400 },
        );
      }

      const transferItemMap = new Map(transfer.items.map((item) => [item.id, item]));
      for (const item of dispatchItems) {
        const transferItem = transferItemMap.get(item.itemId);
        if (!transferItem) {
          return NextResponse.json(
            { error: `Transfer item ${item.itemId} not found.` },
            { status: 400 },
          );
        }
        const remaining = transferItem.quantityRequested - transferItem.quantityDispatched;
        if (item.quantity > remaining) {
          return NextResponse.json(
            {
              error: `Dispatch quantity for ${transferItem.productVariant.sku} exceeds remaining requested quantity.`,
            },
            { status: 400 },
          );
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        for (const item of dispatchItems) {
          const transferItem = transferItemMap.get(item.itemId);
          if (!transferItem) {
            throw new Error("Transfer item lookup failed");
          }

          await dispatchVariantInventory({
            tx,
            productId: transferItem.productVariant.productId,
            productVariantId: transferItem.productVariantId,
            warehouseId: transfer.sourceWarehouseId,
            quantity: item.quantity,
            reason: `Warehouse transfer ${transfer.transferNumber} dispatch to ${transfer.destinationWarehouse.code}`,
          });

          await tx.warehouseTransferItem.update({
            where: { id: transferItem.id },
            data: {
              quantityDispatched: {
                increment: item.quantity,
              },
            },
          });
        }

        await tx.warehouseTransfer.update({
          where: { id: transfer.id },
          data: {
            dispatchedAt: new Date(),
            dispatchedById: access.userId,
          },
        });

        return refreshWarehouseTransferStatus(tx, transfer.id);
      });

      revalidateStorefrontCatalog();

      await logActivity({
        action: "dispatch",
        entity: "warehouse_transfer",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Dispatched warehouse transfer ${updated.transferNumber}`,
        },
        before,
        after: toWarehouseTransferLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "receive") {
      if (!access.can("warehouse_transfers.manage", transfer.destinationWarehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!["DISPATCHED", "PARTIALLY_DISPATCHED", "PARTIALLY_RECEIVED"].includes(transfer.status)) {
        return NextResponse.json(
          { error: "Only dispatched transfers can be received." },
          { status: 400 },
        );
      }

      const requestedItems = Array.isArray(body.items) ? body.items : [];
      const receiptItems =
        requestedItems.length > 0
          ? requestedItems
              .map((item, index) => {
                const itemId = Number(item.itemId);
                const quantity = Number(item.quantity);
                if (!Number.isInteger(itemId) || itemId <= 0) {
                  throw new Error(`Receipt item ${index + 1}: item id is required`);
                }
                if (!Number.isInteger(quantity) || quantity <= 0) {
                  throw new Error(`Receipt item ${index + 1}: quantity must be greater than 0`);
                }
                return { itemId, quantity };
              })
          : transfer.items
              .map((item) => ({
                itemId: item.id,
                quantity: item.quantityDispatched - item.quantityReceived,
              }))
              .filter((item) => item.quantity > 0);

      if (receiptItems.length === 0) {
        return NextResponse.json(
          { error: "No dispatched quantity is available to receive." },
          { status: 400 },
        );
      }

      const transferItemMap = new Map(transfer.items.map((item) => [item.id, item]));
      for (const item of receiptItems) {
        const transferItem = transferItemMap.get(item.itemId);
        if (!transferItem) {
          return NextResponse.json(
            { error: `Transfer item ${item.itemId} not found.` },
            { status: 400 },
          );
        }
        const remaining = transferItem.quantityDispatched - transferItem.quantityReceived;
        if (item.quantity > remaining) {
          return NextResponse.json(
            {
              error: `Receipt quantity for ${transferItem.productVariant.sku} exceeds dispatched balance.`,
            },
            { status: 400 },
          );
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        for (const item of receiptItems) {
          const transferItem = transferItemMap.get(item.itemId);
          if (!transferItem) {
            throw new Error("Transfer item lookup failed");
          }

          await receiveVariantInventory({
            tx,
            productId: transferItem.productVariant.productId,
            productVariantId: transferItem.productVariantId,
            warehouseId: transfer.destinationWarehouseId,
            quantity: item.quantity,
            reason: `Warehouse transfer ${transfer.transferNumber} receipt from ${transfer.sourceWarehouse.code}`,
          });

          await tx.warehouseTransferItem.update({
            where: { id: transferItem.id },
            data: {
              quantityReceived: {
                increment: item.quantity,
              },
            },
          });
        }

        await tx.warehouseTransfer.update({
          where: { id: transfer.id },
          data: {
            receivedById: access.userId,
          },
        });

        return refreshWarehouseTransferStatus(tx, transfer.id);
      });

      revalidateStorefrontCatalog();

      await logActivity({
        action: "receive",
        entity: "warehouse_transfer",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Received warehouse transfer ${updated.transferNumber}`,
        },
        before,
        after: toWarehouseTransferLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error: any) {
    console.error("SCM WAREHOUSE TRANSFER PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update warehouse transfer." },
      { status: 500 },
    );
  }
}
