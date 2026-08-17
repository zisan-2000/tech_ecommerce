import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  getDefaultPurchaseVariant,
  getProductAvailableStock,
  parseStorefrontProductId,
  toProductPurchaseData,
} from "../lib/product-purchase.ts";
import {
  normalizeCompareProductIds,
  productCompareHref,
  toggleCompareProductId,
} from "../lib/product-compare.ts";

const variant = (overrides = {}) => ({
  id: 1,
  sku: "SKU-1",
  price: 1_000,
  stock: 2,
  options: { Color: "Black" },
  colorImage: null,
  isDefault: false,
  active: true,
  ...overrides,
});

test("product route accepts only positive integer IDs", () => {
  assert.equal(parseStorefrontProductId("42"), 42);
  assert.equal(parseStorefrontProductId("0"), null);
  assert.equal(parseStorefrontProductId("2.5"), null);
  assert.equal(parseStorefrontProductId("product"), null);
});

test("default variant prefers an available default", () => {
  const selected = getDefaultPurchaseVariant([
    variant({ id: 1, isDefault: true, stock: 0 }),
    variant({ id: 2, isDefault: true, stock: 4 }),
    variant({ id: 3, stock: 8 }),
  ]);

  assert.equal(selected?.id, 2);
});

test("physical stock counts only active non-negative variant stock", () => {
  const stock = getProductAvailableStock({
    type: "PHYSICAL",
    bundleStockLimit: null,
    variants: [
      variant({ stock: 3 }),
      variant({ id: 2, stock: 99, active: false }),
      variant({ id: 3, stock: -5 }),
    ],
  });

  assert.equal(stock, 3);
});

test("bundle and non-inventory product stock use their own rules", () => {
  assert.equal(
    getProductAvailableStock({
      type: "BUNDLE",
      bundleStockLimit: 6,
      variants: [],
    }),
    6,
  );
  assert.equal(
    getProductAvailableStock({
      type: "DIGITAL",
      bundleStockLimit: null,
      variants: [],
    }),
    99,
  );
});

test("purchase projection excludes server-only product and variant fields", () => {
  const purchase = toProductPurchaseData({
    id: 7,
    name: "Laptop",
    type: "PHYSICAL",
    sku: "LAP-7",
    image: "/laptop.jpg",
    gallery: [],
    basePrice: 80_000,
    originalPrice: 85_000,
    currency: "BDT",
    ratingAvg: 4.8,
    ratingCount: 9,
    bundleStockLimit: null,
    description: "must stay on the server",
    variants: [
      {
        ...variant(),
        productId: 7,
        currency: "BDT",
      },
    ],
  });

  assert.equal("description" in purchase, false);
  assert.equal("productId" in purchase.variants[0], false);
  assert.equal("currency" in purchase.variants[0], false);
});

test("comparison IDs are valid, unique and limited to four products", () => {
  assert.deepEqual(normalizeCompareProductIds([3, "3", 1, 0, "bad", 5, 8, 9]), [3, 1, 5, 8]);
  assert.equal(productCompareHref([3, 1]), "/ecommerce/compare?ids=3,1");
});

test("comparison toggle removes existing products and protects the limit", () => {
  assert.deepEqual(toggleCompareProductId([1, 2], 2), {
    ids: [1],
    added: false,
    limitReached: false,
  });
  assert.equal(toggleCompareProductId([1, 2, 3, 4], 5).limitReached, true);
});

test("cart loads only the product being added instead of the entire catalog", async () => {
  const source = await readFile(new URL("../components/ecommarce/CartContext.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\/api\/products\?view=storefront/);
  assert.match(source, /\/api\/products\/\$\{encodeURIComponent\(pid\)\}\?view=storefront/);
});

test("product questions enforce rate limiting and staff permission checks", async () => {
  const source = await readFile(new URL("../app/api/product-questions/route.ts", import.meta.url), "utf8");
  assert.match(source, /rateLimitRequest/);
  assert.match(source, /access\.has\("products\.manage"\)/);
  assert.match(source, /question\.length > 500/);
});
