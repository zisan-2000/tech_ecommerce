import assert from "node:assert/strict";
import test from "node:test";

import {
  createPcBuilderCheckoutManifest,
  parsePcBuilderCheckoutCookie,
  parsePcBuilderCheckoutManifest,
  pcBuilderCheckoutManifestTouchesItems,
  serializePcBuilderCheckoutManifest,
  validatePcBuilderCheckoutManifestItems,
} from "../lib/pc-builder-checkout.ts";

const selections = {
  processor: "101-1001",
  motherboard: "102-1002",
  memory: "103-1003",
  storage: "104-1004",
  powerSupply: "105-1005",
  case: "106-1006",
};

function checkoutItems() {
  return [
    { productId: 101, variantId: 1001, quantity: 1 },
    { productId: 102, variantId: 1002, quantity: 1 },
    { productId: 103, variantId: 1003, quantity: 2 },
    { productId: 104, variantId: 1004, quantity: 1 },
    { productId: 105, variantId: 1005, quantity: 1 },
    { productId: 106, variantId: 1006, quantity: 1 },
    { productId: 999, variantId: 9999, quantity: 1 },
  ];
}

test("checkout manifest round-trips through the HttpOnly cookie format", () => {
  const manifest = createPcBuilderCheckoutManifest(selections);
  const encoded = serializePcBuilderCheckoutManifest(manifest);
  assert.deepEqual(parsePcBuilderCheckoutCookie(encoded), manifest);
});

test("checkout manifest rejects unknown slots and malformed selection ids", () => {
  assert.equal(
    parsePcBuilderCheckoutManifest({
      version: 1,
      selections: { processor: "101-1001", attacker: "102-1002" },
    }),
    null,
  );
  assert.equal(
    parsePcBuilderCheckoutManifest({
      version: 1,
      selections: { processor: "101" },
    }),
    null,
  );
});

test("component removal or variant swap is detected before live revalidation", () => {
  const manifest = createPcBuilderCheckoutManifest(selections);
  const swapped = checkoutItems().map((item) =>
    item.productId === 105 ? { ...item, variantId: 5555 } : item,
  );
  const result = validatePcBuilderCheckoutManifestItems(manifest, swapped);
  assert.equal(result.ok, false);
  assert.equal(result.missingSlots.includes("powerSupply"), true);
});

test("stale manifest does not attach to an unrelated cart", () => {
  const manifest = createPcBuilderCheckoutManifest(selections);
  assert.equal(
    pcBuilderCheckoutManifestTouchesItems(manifest, [
      { productId: 999, variantId: 9999, quantity: 1 },
    ]),
    false,
  );
});

test("extra non-builder products do not invalidate an intact build", () => {
  const manifest = createPcBuilderCheckoutManifest(selections);
  assert.equal(
    validatePcBuilderCheckoutManifestItems(manifest, checkoutItems()).ok,
    true,
  );
});

test("validation route issues checkout state only for a checkout-ready live build", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../app/api/pc-builder/validate/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /result\.missingSlots\.length === 0/);
  assert.match(source, /result\.evaluation\.canAddToCart/);
  assert.match(source, /httpOnly: true/);
  assert.match(source, /PC_BUILDER_CHECKOUT_COOKIE/);
});

test("order route verifies membership and live compatibility before delegating", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../app/api/orders/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /validatePcBuilderCheckoutManifestItems/);
  assert.match(source, /validatePcBuilderSelectionLive/);
  assert.match(source, /PC_BUILDER_CART_CHANGED/);
  assert.match(source, /PC_BUILDER_CHECKOUT_REVALIDATION_FAILED/);
  assert.match(source, /corePOST\(requestForCore\)/);
});
