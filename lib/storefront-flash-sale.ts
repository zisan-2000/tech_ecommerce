import "server-only";

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  serializeStorefrontHomeProduct,
  storefrontHomeProductSelect,
} from "@/lib/storefront-home";

const readActiveFlashSales = unstable_cache(
  async () => {
    const now = new Date();
    const products = await prisma.product.findMany({
      where: {
        deleted: false,
        available: true,
        flashSaleEnabled: true,
        flashSalePrice: { not: null },
        flashSaleStartsAt: { lte: now },
        flashSaleEndsAt: { gt: now },
      },
      orderBy: [{ flashSaleSortOrder: "asc" }, { flashSaleEndsAt: "asc" }],
      take: 100,
      select: storefrontHomeProductSelect,
    });
    return products
      .map((product) => serializeStorefrontHomeProduct(product, now))
      .filter((product) => product.flashSale.active);
  },
  ["storefront-flash-sales-v1"],
  { revalidate: 30, tags: ["flash-sales", "products"] },
);

export async function getActiveFlashSaleProducts() {
  return readActiveFlashSales();
}
