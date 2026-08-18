import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateTaxForItems } from "@/lib/tax";
import { resolveFlashSalePricing } from "@/lib/flash-sale";

type QuoteRequestItem = {
  productId: number;
  variantId: number | null;
  quantity: number;
};

type ProductTaxLookup = {
  id: number;
  basePrice: unknown;
  currency: string;
  flashSaleEnabled: boolean;
  flashSalePrice: unknown | null;
  flashSaleStartsAt: Date | null;
  flashSaleEndsAt: Date | null;
  VatClass: {
    id: number;
    name: string;
    code: string;
  } | null;
  variants: Array<{
    id: number;
    productId: number;
    price: unknown;
    currency: string;
    isDefault: boolean;
    active: boolean;
  }>;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const country = String(body?.country || "").trim();
    const district = String(body?.district || "").trim();
    const items = Array.isArray(body?.items) ? body.items : [];

    if (!country || items.length === 0) {
      return NextResponse.json(
        { error: "country and items are required" },
        { status: 400 },
      );
    }

    const normalizedItems: QuoteRequestItem[] = items
      .map((item: any) => ({
        productId: Number(item?.productId),
        variantId:
          item?.variantId !== undefined && item?.variantId !== null
            ? Number(item.variantId)
            : null,
        quantity: Number(item?.quantity || 0),
      }))
      .filter(
        (item: QuoteRequestItem) =>
          Number.isInteger(item.productId) &&
          item.productId > 0 &&
          Number.isInteger(item.quantity) &&
          item.quantity > 0,
      );

    if (normalizedItems.length === 0) {
      return NextResponse.json(
        { error: "Valid items are required" },
        { status: 400 },
      );
    }

    const productIds = Array.from(new Set(normalizedItems.map((item) => item.productId)));
    const products = (await prisma.product.findMany({
      where: { id: { in: productIds }, deleted: false },
      include: {
        VatClass: true,
        variants: {
          orderBy: [{ isDefault: "desc" }, { id: "asc" }],
          select: {
            id: true,
            productId: true,
            price: true,
            currency: true,
            isDefault: true,
            active: true,
          },
        },
      },
    })) as ProductTaxLookup[];

    const quoteItems = normalizedItems
      .map((item) => {
        const product = products.find((entry) => entry.id === item.productId);
        if (!product) return null;

        const variant =
          item.variantId !== null
            ? product.variants.find((entry) => entry.id === item.variantId) ?? null
            : product.variants.find((entry) => entry.isDefault) ??
              product.variants[0] ??
              null;

        if (!variant) return null;

        return {
          productId: product.id,
          variantId: variant.id,
          quantity: item.quantity,
          unitPrice: resolveFlashSalePricing(
            product,
            variant.price ?? product.basePrice,
          ).salePrice,
          currency: String(variant.currency || product.currency || "BDT"),
          vatClassId: product.VatClass?.id ?? null,
          vatClassName: product.VatClass?.name ?? null,
          vatClassCode: product.VatClass?.code ?? null,
        };
      })
      .filter(Boolean);

    if (quoteItems.length === 0) {
      return NextResponse.json({
        country,
        totalVAT: 0,
        totalTaxCharge: 0,
        totalInclusiveVAT: 0,
        totalExclusiveVAT: 0,
        breakdown: [],
        items: [],
      });
    }

    const quote = await calculateTaxForItems(prisma, {
      country,
      district,
      currency: quoteItems[0]?.currency || "BDT",
      items: quoteItems as any,
    });

    return NextResponse.json(quote);
  } catch (error) {
    console.error("TAX QUOTE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to calculate tax quote" },
      { status: 500 },
    );
  }
}
