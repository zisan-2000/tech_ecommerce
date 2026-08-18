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
   GET PRODUCT VARIANTS
   Optional query: ?productId=1
========================= */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const productIdParam = url.searchParams.get("productId");
    const productId = productIdParam ? Number(productIdParam) : null;

    const variants = await prisma.productVariant.findMany({
      where: productId ? { productId } : undefined,
      orderBy: { id: "desc" },
      include: {
        product: {
          select: {
            id: true,
            name: true,
          },
        },
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

    const colorImageMap = await getVariantColorImageMap(
      variants.map((variant) => Number(variant.id)),
    );

    return NextResponse.json(
      variants.map((variant) => ({
        ...variant,
        colorImage: colorImageMap.get(Number(variant.id)) ?? null,
      })),
    );
  } catch (error) {
    console.error("GET PRODUCT VARIANTS ERROR:", error);
    return NextResponse.json(
      { error: "Failed to fetch variants" },
      { status: 500 },
    );
  }
}

/* =========================
   CREATE PRODUCT VARIANT
========================= */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const productId = Number(body.productId);
    if (!productId || Number.isNaN(productId)) {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400 },
      );
    }

    const sku = String(body.sku || "")
      .trim()
      .toUpperCase();
    if (!sku) {
      return NextResponse.json({ error: "SKU is required" }, { status: 400 });
    }

    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: "Price is required" }, { status: 400 });
    }
    const costPrice =
      body.costPrice !== undefined && body.costPrice !== null && body.costPrice !== ""
        ? Number(body.costPrice)
        : null;
    if (costPrice !== null && (!Number.isFinite(costPrice) || costPrice < 0)) {
      return NextResponse.json(
        { error: "Cost price must be a number (0 or more)" },
        { status: 400 },
      );
    }

    const currency = String(body.currency || "USD").trim().toUpperCase();
    const stock = body.stock !== undefined ? Number(body.stock) : 0;
    const lowStockThreshold = normalizeLowStockThreshold(body.lowStockThreshold);
    if (!Number.isFinite(stock) || stock < 0) {
      return NextResponse.json(
        { error: "Stock must be a number (0 or more)" },
        { status: 400 },
      );
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, type: true },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const initialStock = product.type === "PHYSICAL" ? stock : 0;
    const colorImage =
      typeof body.colorImage === "string" && body.colorImage.trim()
        ? body.colorImage.trim()
        : null;

    const created = await prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.create({
        data: {
          productId,
          sku,
          price,
          costPrice,
          currency,
          stock: 0,
          lowStockThreshold,
          isDefault: false,
          digitalAssetId: body.digitalAssetId ? Number(body.digitalAssetId) : null,
          options: body.options ?? {},
        },
      });

      await tx.$executeRaw`
        UPDATE "ProductVariant"
        SET "colorImage" = ${colorImage}
        WHERE "id" = ${variant.id}
      `;

      await syncVariantWarehouseStock({
        tx,
        productId,
        productVariantId: variant.id,
        quantity: initialStock,
        reason: "Admin variant initial stock",
      });
      await ensureVariantCodes(tx, {
        productId,
        variantId: variant.id,
      });

      return tx.productVariant.findUnique({
        where: { id: variant.id },
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

    revalidateStorefrontCatalog();

    return NextResponse.json(
      created ? { ...created, colorImage } : created,
      { status: 201 },
    );
  } catch (error: any) {
    console.error("POST PRODUCT VARIANT ERROR:", error);
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "SKU already exists" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to create variant" },
      { status: 500 },
    );
  }
}
