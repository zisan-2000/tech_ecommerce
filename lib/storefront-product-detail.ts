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

type ProductIdentifier = { id: number } | { slug: string };

export function parseStorefrontProductIdentifier(
  value: string,
): ProductIdentifier | null {
  let normalized: string;
  try {
    normalized = decodeURIComponent(value).trim().toLowerCase();
  } catch {
    return null;
  }
  if (/^[1-9]\d*$/.test(normalized)) {
    const id = Number(normalized);
    return Number.isSafeInteger(id) ? { id } : null;
  }
  if (
    normalized.length > 0 &&
    normalized.length <= 191 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)
  ) {
    return { slug: normalized };
  }
  return null;
}

const readProductDetail = unstable_cache(
  async (identifier: string) => {
    const where = parseStorefrontProductIdentifier(identifier);
    if (!where) return null;
    const product = await prisma.product.findFirst({
      where: { ...where, deleted: false, available: true },
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

export async function getStorefrontProductDetail(identifier: string | number) {
  return readProductDetail(String(identifier));
}
