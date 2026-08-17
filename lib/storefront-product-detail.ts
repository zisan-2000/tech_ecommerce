import { unstable_cache } from "next/cache";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { storefrontProductSelect } from "@/lib/storefront-product";

type RawProduct = Prisma.ProductGetPayload<{
  select: typeof storefrontProductSelect;
}>;

function serializeProduct(product: RawProduct) {
  return {
    ...product,
    basePrice: Number(product.basePrice),
    originalPrice:
      product.originalPrice === null ? null : Number(product.originalPrice),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    variants: product.variants.map((variant) => ({
      ...variant,
      price: Number(variant.price),
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
  ["storefront-product-detail-v1"],
  { revalidate: 120, tags: ["storefront-product-detail", "products"] },
);

export type StorefrontProductDetail = NonNullable<
  Awaited<ReturnType<typeof readProductDetail>>
>;

export async function getStorefrontProductDetail(id: number) {
  return readProductDetail(id);
}
