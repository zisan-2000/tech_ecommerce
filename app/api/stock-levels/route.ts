import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { refreshVariantStock } from "@/lib/inventory";
import { revalidateStorefrontCatalog } from "@/lib/storefront-catalog-cache";
import { getAccessContext } from "@/lib/rbac";
import { captureVariantInventoryDailySnapshots } from "@/lib/report-history";
import { resolveWarehouseScope } from "@/lib/warehouse-scope";
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
   GET STOCK LEVELS
   Query: ?productVariantId=1 or ?productId=1
========================= */
export async function GET(req: Request) {
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

    const url = new URL(req.url);
    const variantIdParam = url.searchParams.get("productVariantId");
    const productIdParam = url.searchParams.get("productId");
    const warehouseIdParam = url.searchParams.get("warehouseId");

    const productVariantId = variantIdParam ? Number(variantIdParam) : null;
    const productId = productIdParam ? Number(productIdParam) : null;
    const requestedWarehouseId = warehouseIdParam ? Number(warehouseIdParam) : null;
    const warehouseScope = resolveWarehouseScope(access, "inventory.manage", requestedWarehouseId);

    if (warehouseScope.mode === "none") {
      return NextResponse.json([], { status: 200 });
    }

    const warehouseWhere =
      warehouseScope.mode === "assigned"
        ? { warehouseId: { in: warehouseScope.warehouseIds } }
        : {};

    if (productVariantId && !Number.isNaN(productVariantId)) {
      const levels = await prisma.stockLevel.findMany({
        where: { productVariantId, ...warehouseWhere },
        orderBy: { id: "desc" },
        include: { warehouse: true },
      });
      return NextResponse.json(levels);
    }

    if (productId && !Number.isNaN(productId)) {
      const variants = await prisma.productVariant.findMany({
        where: { productId },
        orderBy: { id: "desc" },
        include: {
          stockLevels: {
            where: warehouseWhere,
            include: { warehouse: true },
            orderBy: { id: "desc" },
          },
        },
      });
      return NextResponse.json(variants);
    }

    const levels = await prisma.stockLevel.findMany({
      where: warehouseWhere,
      orderBy: { id: "desc" },
      include: { warehouse: true, variant: true },
    });
    return NextResponse.json(levels);
  } catch (error) {
    console.error("GET STOCK LEVELS ERROR:", error);
    return NextResponse.json(
      { error: "Failed to fetch stock levels" },
      { status: 500 },
    );
  }
}

/* =========================
   UPSERT STOCK LEVEL
========================= */
export async function POST(req: Request) {
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

    const body = await req.json();
    const warehouseId = Number(body.warehouseId);
    const productVariantId = Number(body.productVariantId);
    const quantity = Number(body.quantity);

    if (!warehouseId || Number.isNaN(warehouseId)) {
      return NextResponse.json(
        { error: "warehouseId is required" },
        { status: 400 },
      );
    }
    if (!productVariantId || Number.isNaN(productVariantId)) {
      return NextResponse.json(
        { error: "productVariantId is required" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      return NextResponse.json(
        { error: "Quantity must be 0 or more" },
        { status: 400 },
      );
    }

    if (!access.can("inventory.manage", warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const variant = await prisma.productVariant.findUnique({
      where: { id: productVariantId },
      include: { product: { select: { id: true, type: true } } },
    });

    if (!variant) {
      return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    }

    if (variant.product.type !== "PHYSICAL") {
      return NextResponse.json(
        { error: "Stock levels are only available for PHYSICAL products" },
        { status: 400 },
      );
    }

    const existing = await prisma.stockLevel.findUnique({
      where: {
        warehouseId_productVariantId: { warehouseId, productVariantId },
      },
    });

    const updated = await prisma.stockLevel.upsert({
      where: {
        warehouseId_productVariantId: { warehouseId, productVariantId },
      },
      create: {
        warehouseId,
        productVariantId,
        quantity,
        reserved: 0,
      },
      update: {
        quantity,
      },
      include: { warehouse: true },
    });

    const oldQty = existing ? Number(existing.quantity) : 0;
    const change = quantity - oldQty;

    await refreshVariantStock(prisma, productVariantId);
    revalidateStorefrontCatalog();
    await captureVariantInventoryDailySnapshots(prisma, productVariantId);

    if (change !== 0) {
      await prisma.inventoryLog.create({
        data: {
          productId: variant.product.id,
          variantId: productVariantId,
          warehouseId,
          change,
          reason: `Admin stock level adjustment (${updated.warehouse.code})`,
        },
      });
    }

    await logActivity({
      action: existing ? "update_stock_level" : "create_stock_level",
      entity: "stock_level",
      entityId: updated.id,
      access,
      request: req,
      metadata: {
        message: existing
          ? `Stock updated for variant #${productVariantId} in warehouse ${updated.warehouse.code}`
          : `Stock created for variant #${productVariantId} in warehouse ${updated.warehouse.code}`,
        warehouseCode: updated.warehouse.code,
        stockChange: change,
      },
      before: existing ? toStockLevelLogSnapshot(existing) : null,
      after: toStockLevelLogSnapshot(updated),
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("POST STOCK LEVEL ERROR:", error);
    return NextResponse.json(
      { error: "Failed to save stock level" },
      { status: 500 },
    );
  }
}
