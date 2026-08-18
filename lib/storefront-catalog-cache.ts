import "server-only";

import { revalidateTag } from "next/cache.js";

export function revalidateStorefrontCatalog() {
  // Commerce mutations (availability, price and stock) must not deliberately
  // serve a stale response on the next request. Route Handlers cannot use
  // updateTag, so expire the tagged data immediately.
  revalidateTag("storefront-catalog", { expire: 0 });
  revalidateTag("products", { expire: 0 });
  revalidateTag("flash-sales", { expire: 0 });
  revalidateTag("categories", { expire: 0 });
}
