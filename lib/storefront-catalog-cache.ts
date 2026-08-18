import "server-only";

import { revalidateTag } from "next/cache.js";

export function revalidateStorefrontCatalog() {
  revalidateTag("storefront-catalog", "max");
  revalidateTag("products", "max");
  revalidateTag("categories", "max");
}
