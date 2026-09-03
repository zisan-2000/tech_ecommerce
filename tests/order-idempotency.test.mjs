import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildOrderIdempotencyContext,
  OrderIdempotencyError,
} from "../lib/order-idempotency.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const baseCheckout = {
  clientKey: "checkout-12345678-abcdef",
  userId: "user-1",
  name: "Checkout User",
  email: "USER@example.com",
  phoneNumber: "01700000000",
  altPhoneNumber: null,
  country: "Bangladesh",
  district: "Dhaka",
  area: "Inside Dhaka",
  addressDetails: "Road 1",
  paymentMethod: "CashOnDelivery",
  items: [
    { productId: 2, variantId: 20, quantity: 1 },
    { productId: 1, variantId: 10, quantity: 2 },
  ],
  transactionId: null,
  image: null,
  couponId: null,
  couponCode: null,
};

test("same logical checkout produces the same idempotency fingerprint", () => {
  const first = buildOrderIdempotencyContext(baseCheckout);
  const second = buildOrderIdempotencyContext({
    ...baseCheckout,
    email: " user@example.com ",
    items: [...baseCheckout.items].reverse(),
  });

  assert.equal(first.storageKey, second.storageKey);
  assert.equal(first.requestHash, second.requestHash);
  assert.equal(first.mode, "client");
});

test("same client key cannot silently protect a different checkout payload", () => {
  const first = buildOrderIdempotencyContext(baseCheckout);
  const changed = buildOrderIdempotencyContext({
    ...baseCheckout,
    addressDetails: "Road 2",
  });

  assert.equal(first.storageKey, changed.storageKey);
  assert.notEqual(first.requestHash, changed.requestHash);
});

test("malformed client idempotency keys are rejected", () => {
  assert.throws(
    () =>
      buildOrderIdempotencyContext({
        ...baseCheckout,
        clientKey: "short",
      }),
    (error) =>
      error instanceof OrderIdempotencyError &&
      error.code === "INVALID_IDEMPOTENCY_KEY" &&
      error.status === 400,
  );
});

test("checkout route performs replay lookup before stock validation and rechecks under a transaction lock", async () => {
  const [route, helper, migration] = await Promise.all([
    read("../app/api/orders/route-core.ts"),
    read("../lib/order-idempotency.ts"),
    read("../prisma/migrations/20260903_order_checkout_idempotency/migration.sql"),
  ]);

  const earlyReplay = route.indexOf("findExistingOrderIdempotencyOrderId(prisma");
  const productLookup = route.indexOf("prisma.product.findMany");

  assert.ok(earlyReplay >= 0, "expected an early replay lookup");
  assert.ok(productLookup >= 0, "expected the normal product lookup");
  assert.ok(
    earlyReplay < productLookup,
    "idempotent replay must happen before product/stock checks",
  );
  assert.match(route, /acquireOrderIdempotencyLock\(tx, idempotency\)/);
  assert.match(route, /findExistingOrderIdempotencyOrderId\(tx, idempotency\)/);
  assert.match(
    route,
    /commercialContext:\s*orderIdempotencyCommercialContext\(idempotency\)/,
  );
  assert.match(route, /if \(!transactionResult\.replayed\)/);
  assert.match(helper, /pg_advisory_xact_lock/);
  assert.match(helper, /IDEMPOTENCY_KEY_REUSED/);
  assert.match(migration, /Order_checkoutIdempotency_key_idx/);
  assert.match(migration, /checkoutIdempotency,key/);
});
