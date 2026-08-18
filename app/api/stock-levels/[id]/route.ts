import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { refreshVariantStock } from "@/lib/inventory";
import { revalidateStorefrontCatalog } from "@/lib/storefront-catalog-cache";
import { getAccessContext } from "@/lib/rbac";
import { captureVariantInventoryDailySnapshots } from "@/lib/report-history";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

function toStockLevelLogSnapshot(stockLevel: {
  id: number;
  warehouseId: number;
  productVariantId: number;
  quantity: unknown;
  reserved: unknown;
}) {
  return {
    id: stockLevel.id,
    warehouseId: stockLevel.warehouseId,
    productVariantId: stockLevel.productVariantId,
    quantity: Number(stockLevel.quantity),
    reserved: Number(stockLevel.reserved),
  };
}

/* =========================
   DELETE STOCK LEVEL
========================= */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.has("inventory.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await prisma.stockLevel.findUnique({
      where: { id },
      include: {
        warehouse: true,
        variant: {
          include: { product: { select: { id: true, type: true } } },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Stock level not found" },
        { status: 404 },
      );
    }

    if (!access.can("inventory.manage", existing.warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.stockLevel.delete({ where: { id } });

    await refreshVariantStock(prisma, existing.productVariantId);
    revalidateStorefrontCatalog();
    await captureVariantInventoryDailySnapshots(prisma, existing.productVariantId);

    const change = -Number(existing.quantity);
    if (change !== 0 && existing.variant.product.type === "PHYSICAL") {
      await prisma.inventoryLog.create({
        data: {
          productId: existing.variant.product.id,
          variantId: existing.productVariantId,
          warehouseId: existing.warehouseId,
          change,
          reason: `Admin stock level deleted (${existing.warehouse.code})`,
        },
      });
    }

    await logActivity({
      action: "delete_stock_level",
      entity: "stock_level",
      entityId: existing.id,
      access,
      request: req,
      metadata: {
        message: `Stock level deleted for variant #${existing.productVariantId} in warehouse ${existing.warehouse.code}`,
        warehouseCode: existing.warehouse.code,
        stockChange: change,
      },
      before: toStockLevelLogSnapshot(existing),
    });

    return NextResponse.json({ message: "Deleted successfully" });
  } catch (error) {
    console.error("DELETE STOCK LEVEL ERROR:", error);
    return NextResponse.json(
      { error: "Failed to delete stock level" },
      { status: 500 },
    );
  }
}
