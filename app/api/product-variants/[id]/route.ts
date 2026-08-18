import { prisma } from "@/lib/prisma";
import { syncVariantWarehouseStock } from "@/lib/inventory";
import { normalizeLowStockThreshold } from "@/lib/stock-status";
import { ensureVariantCodes } from "@/lib/product-codes";
import { Prisma } from "@/generated/prisma";
import { NextResponse } from "next/server";
import { revalidateStorefrontCatalog } from "@/lib/storefront-catalog-cache";

async function getVariantColorImageMap(variantIds: number[]) {
  const uniqueIds = Array.from(new Set(variantIds.filter(Number.isFinite)));
  if (uniqueIds.length === 0) return new Map<number, string | null>();

  const rows = await prisma.$queryRaw<Array<{ id: number; colorImage: string | null }>>(
    Prisma.sql`SELECT "id", "colorImage" FROM "ProductVariant" WHERE "id" IN (${Prisma.join(uniqueIds)})`,
  );

  return new Map(
    rows.map((row) => [Number(row.id), row.colorImage ?? null]),
  );
}

/* =========================
   UPDATE PRODUCT VARIANT
========================= */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();
    const existing = await prisma.productVariant.findUnique({
      where: { id },
      include: { product: { select: { id: true, type: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    }

    const sku =
      body.sku !== undefined
        ? String(body.sku || "")
            .trim()
            .toUpperCase()
        : existing.sku;
    if (!sku) {
      return NextResponse.json({ error: "SKU is required" }, { status: 400 });
    }

    const price =
      body.price !== undefined ? Number(body.price) : Number(existing.price);
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: "Price is required" }, { status: 400 });
    }
    const costPrice =
      body.costPrice !== undefined
        ? body.costPrice !== null && body.costPrice !== ""
          ? Number(body.costPrice)
          : null
        : existing.costPrice !== null
          ? Number(existing.costPrice)
          : null;
    if (costPrice !== null && (!Number.isFinite(costPrice) || costPrice < 0)) {
      return NextResponse.json(
        { error: "Cost price must be a number (0 or more)" },
        { status: 400 },
      );
    }

    const currency =
      body.currency !== undefined
        ? String(body.currency || "USD").trim().toUpperCase()
        : existing.currency;

    const hasStockUpdate = body.stock !== undefined;
    const newStockValue = Number(body.stock ?? 0);
    if (hasStockUpdate && (!Number.isFinite(newStockValue) || newStockValue < 0)) {
      return NextResponse.json(
        { error: "Stock must be a number (0 or more)" },
        { status: 400 },
      );
    }

    const stock =
      hasStockUpdate && existing.product.type === "PHYSICAL"
        ? newStockValue
        : 0;
    const nextColorImage =
      body.colorImage !== undefined
        ? typeof body.colorImage === "string" && body.colorImage.trim()
          ? body.colorImage.trim()
          : null
        : undefined;
    const lowStockThreshold =
      body.lowStockThreshold !== undefined
        ? normalizeLowStockThreshold(body.lowStockThreshold)
        : existing.lowStockThreshold;

    const updated = await prisma.$transaction(async (tx) => {
      const savedVariant = await tx.productVariant.update({
        where: { id },
        data: {
          sku,
          price,
          costPrice,
          currency,
          ...(hasStockUpdate ? { stock: 0 } : {}),
          lowStockThreshold,
          digitalAssetId:
            body.digitalAssetId !== undefined
              ? body.digitalAssetId
                ? Number(body.digitalAssetId)
                : null
              : existing.digitalAssetId,
          options:
            body.options !== undefined ? body.options ?? {} : existing.options,
        },
      });

      if (nextColorImage !== undefined) {
        await tx.$executeRaw`
          UPDATE "ProductVariant"
          SET "colorImage" = ${nextColorImage}
          WHERE "id" = ${savedVariant.id}
        `;
      }

      if (hasStockUpdate) {
        await syncVariantWarehouseStock({
          tx,
          productId: existing.product.id,
          productVariantId: id,
          quantity: stock,
          reason: "Admin variant stock adjustment",
        });
      }
      await ensureVariantCodes(tx, {
        productId: existing.product.id,
        variantId: id,
        regenerate: Boolean(body.regenerateCodes),
      });

      return tx.productVariant.findUnique({
        where: { id: savedVariant.id },
        include: {
          codes: {
            where: { isPrimary: true, status: "ACTIVE" },
            orderBy: { id: "asc" },
          },
          stockLevels: {
            include: { warehouse: true },
            orderBy: { id: "desc" },
          },
        },
      });
    });

    const colorImageMap = await getVariantColorImageMap([id]);
    revalidateStorefrontCatalog();
    return NextResponse.json(
      updated
        ? { ...updated, colorImage: colorImageMap.get(id) ?? null }
        : updated,
    );
  } catch (error: any) {
    console.error("PUT PRODUCT VARIANT ERROR:", error);
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "SKU already exists" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to update variant" },
      { status: 500 },
    );
  }
}

/* =========================
   DELETE PRODUCT VARIANT
========================= */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.productCode.deleteMany({ where: { variantId: id } });
      await tx.stockLevel.deleteMany({ where: { productVariantId: id } });
      await tx.inventoryLog.deleteMany({ where: { variantId: id } });
      await tx.productVariant.delete({ where: { id } });
    });

    revalidateStorefrontCatalog();

    return NextResponse.json({ message: "Deleted successfully" });
  } catch (error) {
    console.error("DELETE PRODUCT VARIANT ERROR:", error);
    return NextResponse.json(
      { error: "Failed to delete variant" },
      { status: 500 },
    );
  }
}
