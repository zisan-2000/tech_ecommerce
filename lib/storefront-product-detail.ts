import { unstable_cache } from "next/cache";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { storefrontProductSelect } from "@/lib/storefront-product";
import { resolveFlashSalePricing } from "@/lib/flash-sale";

type RawProduct = Prisma.ProductGetPayload<{
  select: typeof storefrontProductSelect;
}>;

function serializeProduct(product: RawProduct) {
  const flashSale = resolveFlashSalePricing(product);
  return {
    ...product,
    basePrice: flashSale.salePrice,
    originalPrice: flashSale.active
      ? flashSale.regularPrice
      : product.originalPrice === null
        ? null
        : Number(product.originalPrice),
    flashSale,
    flashSalePrice:
      product.flashSalePrice === null ? null : Number(product.flashSalePrice),
    flashSaleStartsAt: product.flashSaleStartsAt?.toISOString() ?? null,
    flashSaleEndsAt: product.flashSaleEndsAt?.toISOString() ?? null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    variants: product.variants.map((variant) => ({
      ...variant,
      price: resolveFlashSalePricing(product, variant.price).salePrice,
    })),
  };
}

const readProductDetail = unstable_cache(
  async (id: number) => {
    const product = await prisma.product.findFirst({
      where: { id, deleted: false, available: true },
      select: storefrontProductSelect,
    });
    return product ? serializeProduct(product) : null;
  },
  ["storefront-product-detail-v2"],
  { revalidate: 30, tags: ["storefront-product-detail", "products", "flash-sales"] },
);

export type StorefrontProductDetail = NonNullable<
  Awaited<ReturnType<typeof readProductDetail>>
>;

export async function getStorefrontProductDetail(id: number) {
  return readProductDetail(id);
}
