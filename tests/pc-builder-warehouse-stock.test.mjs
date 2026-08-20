import assert from "node:assert/strict";
import test from "node:test";

import {
  computeAvailableStock,
  computeVariantAvailableStock,
} from "../lib/warehouse-stock.ts";

test("warehouse stock subtracts reservations across locations", () => {
  assert.equal(
    computeAvailableStock([
      { quantity: 8, reserved: 3 },
      { quantity: 5, reserved: 1 },
    ]),
    9,
  );
});

test("warehouse availability cannot become negative", () => {
  assert.equal(computeAvailableStock([{ quantity: 2, reserved: 7 }]), 0);
});

test("warehouse rows override stale legacy variant stock", () => {
  assert.equal(
    computeVariantAvailableStock({
      stock: 99,
      stockLevels: [{ quantity: 4, reserved: 4 }],
    }),
    0,
  );
});

test("legacy variant stock is only a fallback without warehouse rows", () => {
  assert.equal(computeVariantAvailableStock({ stock: 7, stockLevels: [] }), 7);
  assert.equal(computeVariantAvailableStock({ stock: -4 }), 0);
});

test("PC Builder storefront reads live warehouse stock without stock caching", async () => {
  const { readFile } = await import("node:fs/promises");
  const storefront = await readFile(
    new URL("../lib/storefront-pc-builder.ts", import.meta.url),
    "utf8",
  );
  const cart = await readFile(
    new URL("../app/api/cart/route.ts", import.meta.url),
    "utf8",
  );
  const orders = await readFile(
    new URL("../app/api/orders/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(storefront, /stockLevels/);
  assert.match(storefront, /computeVariantAvailableStock/);
  assert.doesNotMatch(storefront, /unstable_cache/);
  assert.match(cart, /validatePcBuilderSelectionLive/);
  assert.match(cart, /PC_BUILDER_CART_REVALIDATION_FAILED/);
  assert.match(orders, /validatePcBuilderSelectionLive/);
  assert.match(orders, /PC_BUILDER_CHECKOUT_REVALIDATION_FAILED/);
});
