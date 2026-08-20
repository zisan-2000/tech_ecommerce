import assert from "node:assert/strict";
import test from "node:test";

import {
  computeAvailableStock,
  computeVariantAvailableStock,
  computeWarehouseAvailableStock,
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

test("legacy variant stock remains a storefront-only fallback without warehouse rows", () => {
  assert.equal(computeVariantAvailableStock({ stock: 7, stockLevels: [] }), 7);
  assert.equal(computeVariantAvailableStock({ stock: -4 }), 0);
});

test("strict checkout warehouse availability never falls back to legacy stock", () => {
  assert.equal(computeWarehouseAvailableStock({ stockLevels: [] }), null);
  assert.equal(computeWarehouseAvailableStock({}), null);
  assert.equal(
    computeWarehouseAvailableStock({
      stockLevels: [
        { quantity: 10, reserved: 3 },
        { quantity: 4, reserved: 1 },
      ],
    }),
    10,
  );
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
  assert.match(cart, /computeWarehouseAvailableStock/);
  assert.match(cart, /PC_BUILDER_CART_REVALIDATION_FAILED/);
  assert.match(orders, /validatePcBuilderSelectionLive/);
  assert.match(orders, /PC_BUILDER_CHECKOUT_REVALIDATION_FAILED/);
});

test("generic cart and order cores use strict warehouse stock for checkout", async () => {
  const { readFile } = await import("node:fs/promises");
  const [cartCore, orderCore] = await Promise.all([
    readFile(new URL("../app/api/cart/route-core.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/orders/route-core.ts", import.meta.url), "utf8"),
  ]);

  assert.match(cartCore, /computeWarehouseAvailableStock/);
  assert.match(cartCore, /stockLevels/);
  assert.doesNotMatch(cartCore, /Number\(targetVariant\.stock\)/);
  assert.match(orderCore, /computeWarehouseAvailableStock/);
  assert.match(orderCore, /assertWarehouseDemandAvailable/);
  assert.doesNotMatch(orderCore, /Number\(targetVariant\.stock\)/);
});
