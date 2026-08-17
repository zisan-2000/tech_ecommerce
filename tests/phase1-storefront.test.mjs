import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeStorefrontCategories,
  normalizeStorefrontProducts,
  normalizeStorefrontReviews,
} from "../lib/storefront-client-data.ts";

test("storefront categories are normalized into stable tab values", () => {
  assert.deepEqual(
    normalizeStorefrontCategories({
      data: [{ id: 7, name: "Laptops", slug: null }],
    }),
    [{ id: 7, name: "Laptops", slug: "" }],
  );
});

test("storefront products exclude unavailable records and derive variant stock", () => {
  const products = normalizeStorefrontProducts([
    {
      id: 1,
      name: "Gaming Laptop",
      slug: "gaming-laptop",
      categoryId: 7,
      basePrice: "125,000",
      currency: "BDT",
      variants: [{ stock: 2 }, { stock: "3" }],
    },
    { id: 2, name: "Hidden", available: false },
    { id: 3, name: "Deleted", deleted: true },
  ]);

  assert.equal(products.length, 1);
  assert.equal(products[0].basePrice, 125_000);
  assert.equal(products[0].stock, 5);
});

test("bundle stock uses the explicit bundle limit", () => {
  const [bundle] = normalizeStorefrontProducts([
    {
      id: 9,
      name: "Desktop Bundle",
      type: "BUNDLE",
      bundleStockLimit: "4",
      variants: [{ stock: 99 }],
    },
  ]);

  assert.equal(bundle.stock, 4);
});

test("best-selling normalization keeps only products with sales", () => {
  const products = normalizeStorefrontProducts(
    [
      { id: 1, name: "No sales", soldCount: 0 },
      { id: 2, name: "Popular", totalSold: 12 },
    ],
    { requireSold: true },
  );

  assert.deepEqual(products.map((product) => product.id), [2]);
});

test("review payloads accept the API wrapper shape", () => {
  const reviews = normalizeStorefrontReviews({
    reviews: [{ id: 3, productId: 2, rating: "5" }],
  });

  assert.equal(reviews[0].productId, 2);
  assert.equal(reviews[0].rating, "5");
});
