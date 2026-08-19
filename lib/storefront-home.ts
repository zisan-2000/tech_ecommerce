import { unstable_cache } from "next/cache";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { resolveFlashSalePricing } from "@/lib/flash-sale";

export const storefrontHomeProductSelect = {
  id: true,
  name: true,
  slug: true,
  type: true,
  categoryId: true,
  basePrice: true,
  originalPrice: true,
  flashSaleEnabled: true,
  flashSalePrice: true,
  flashSaleStartsAt: true,
  flashSaleEndsAt: true,
  flashSaleSortOrder: true,
  currency: true,
  available: true,
  featured: true,
  image: true,
  shortDesc: true,
  soldCount: true,
  ratingAvg: true,
  ratingCount: true,
  createdAt: true,
  updatedAt: true,
  bundleStockLimit: true,
  attributes: {
    orderBy: { id: "asc" as const },
    take: 4,
    select: {
      value: true,
      attribute: { select: { name: true } },
    },
  },
  variants: {
    orderBy: { id: "asc" as const },
    select: {
      id: true,
      productId: true,
      sku: true,
      price: true,
      currency: true,
      stock: true,
      options: true,
      colorImage: true,
      isDefault: true,
      active: true,
    },
  },
  bundleItems: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      id: true,
      productId: true,
      quantity: true,
      sortOrder: true,
      product: {
        select: { id: true, name: true, image: true, available: true },
      },
    },
  },
} as const satisfies Prisma.ProductSelect;

type RawStorefrontProduct = Prisma.ProductGetPayload<{
  select: typeof storefrontHomeProductSelect;
}>;

export function serializeStorefrontHomeProduct(
  product: RawStorefrontProduct,
  now = new Date(),
) {
  const regularBasePrice = Number(product.basePrice);
  const flashSale = resolveFlashSalePricing(product, regularBasePrice, now);
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
      price: resolveFlashSalePricing(product, variant.price, now).salePrice,
    })),
  };
}

const readStorefrontHomeData = unstable_cache(
  async () => {
    const now = new Date();
    const [products, discountedProducts, topSelling, categories, banners, settings] =
      await Promise.all([
        prisma.product.findMany({
          where: { deleted: false, available: true },
          orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
          take: 160,
          select: storefrontHomeProductSelect,
        }),
        prisma.product.findMany({
          where: {
            deleted: false,
            available: true,
            flashSaleEnabled: true,
            flashSalePrice: { not: null },
            flashSaleStartsAt: { lte: now },
            flashSaleEndsAt: { gt: now },
          },
          orderBy: [{ flashSaleSortOrder: "asc" }, { flashSaleEndsAt: "asc" }],
          take: 80,
          select: storefrontHomeProductSelect,
        }),
        prisma.product.findMany({
          where: { deleted: false, available: true, soldCount: { gt: 0 } },
          orderBy: [{ soldCount: "desc" }, { updatedAt: "desc" }],
          take: 20,
          select: storefrontHomeProductSelect,
        }),
        prisma.category.findMany({
          where: { deleted: false },
          orderBy: { id: "desc" },
          select: {
            id: true,
            name: true,
            slug: true,
            image: true,
            parentId: true,
            _count: {
              select: {
                products: {
                  where: { deleted: false, available: true },
                },
              },
            },
          },
        }),
        prisma.banner.findMany({
          where: {
            isActive: true,
            OR: [{ startDate: null }, { startDate: { lte: now } }],
            AND: [
              { OR: [{ endDate: null }, { endDate: { gte: now } }] },
            ],
          },
          orderBy: { position: "asc" },
          select: {
            id: true,
            title: true,
            subtitle: true,
            description: true,
            image: true,
            mobileImage: true,
            buttonText: true,
            buttonLink: true,
            position: true,
            isActive: true,
            startDate: true,
            endDate: true,
            type: true,
          },
        }),
        prisma.sitesettings.findFirst({
          orderBy: { id: "asc" },
          select: {
            id: true,
            logo: true,
            siteTitle: true,
            footerDescription: true,
            contactNumber: true,
            contactEmail: true,
            address: true,
            facebookLink: true,
            instagramLink: true,
            twitterLink: true,
            tiktokLink: true,
            youtubeLink: true,
          },
        }),
      ]);

    const directCounts = new Map(
      categories.map((category) => [category.id, category._count.products]),
    );
    const categoryNames = new Map(
      categories.map((category) => [category.id, category.name]),
    );
    const childIds = new Map<number, number[]>();
    for (const category of categories) {
      if (category.parentId === null) continue;
      const children = childIds.get(category.parentId) ?? [];
      children.push(category.id);
      childIds.set(category.parentId, children);
    }
    const totalCountCache = new Map<number, number>();
    const totalProductCount = (categoryId: number, trail = new Set<number>()): number => {
      const cached = totalCountCache.get(categoryId);
      if (cached !== undefined) return cached;
      if (trail.has(categoryId)) return directCounts.get(categoryId) ?? 0;

      const nextTrail = new Set(trail).add(categoryId);
      const total =
        (directCounts.get(categoryId) ?? 0) +
        (childIds.get(categoryId) ?? []).reduce(
          (sum, childId) => sum + totalProductCount(childId, nextTrail),
          0,
        );
      totalCountCache.set(categoryId, total);
      return total;
    };

    const serializedProducts = products.map((product) =>
      serializeStorefrontHomeProduct(product, now),
    );
    const flashSaleProducts = discountedProducts
      .map((product) => serializeStorefrontHomeProduct(product, now))
      .filter((product) => product.flashSale.active)
      .slice(0, 20);

    return {
      products: serializedProducts,
      flashSaleProducts,
      topSellingProducts: topSelling.map((product, index) => ({
        ...serializeStorefrontHomeProduct(product, now),
        totalSold: product.soldCount,
        rank: index + 1,
      })),
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        image: category.image,
        parentId: category.parentId,
        parentName:
          category.parentId === null
            ? null
            : categoryNames.get(category.parentId) ?? null,
        productCount: totalProductCount(category.id),
        childrenCount: (childIds.get(category.id) ?? []).length,
      })),
      banners: banners.map((banner) => ({
        ...banner,
        startDate: banner.startDate?.toISOString() ?? null,
        endDate: banner.endDate?.toISOString() ?? null,
      })),
      siteSettings: settings ?? {
        id: 0,
        logo: null,
        siteTitle: null,
        footerDescription: null,
        contactNumber: null,
        contactEmail: null,
        address: null,
        facebookLink: null,
        instagramLink: null,
        twitterLink: null,
        tiktokLink: null,
        youtubeLink: null,
      },
    };
  },
  ["storefront-home-v2"],
  {
    revalidate: 30,
    tags: ["storefront-home", "products", "flash-sales", "categories", "banners", "site-settings"],
  },
);

export type StorefrontHomeData = Awaited<
  ReturnType<typeof readStorefrontHomeData>
>;

export async function getStorefrontHomeData() {
  return readStorefrontHomeData();
}

export function emptyStorefrontHomeData(): StorefrontHomeData {
  return {
    products: [],
    flashSaleProducts: [],
    topSellingProducts: [],
    categories: [],
    banners: [],
    siteSettings: {
      id: 0,
      logo: null,
      siteTitle: null,
      footerDescription: null,
      contactNumber: null,
      contactEmail: null,
      address: null,
      facebookLink: null,
      instagramLink: null,
      twitterLink: null,
      tiktokLink: null,
      youtubeLink: null,
    },
  };
}
