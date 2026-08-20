import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { matchPcBuilderBuildsToOrderItems } from "../lib/pc-builder-order-match.ts";

const buildA = {
  buildId: "pcb_123e4567-e89b-12d3-a456-426614174101",
  selections: {
    processor: "101-1001",
    motherboard: "102-1002",
    memory: "103-1003",
    storage: "104-1004",
    powerSupply: "900-9001",
    case: "106-1006",
  },
};

const buildB = {
  buildId: "pcb_123e4567-e89b-12d3-a456-426614174102",
  selections: {
    processor: "201-2001",
    motherboard: "202-2002",
    memory: "203-2003",
    storage: "204-2004",
    powerSupply: "900-9001",
    case: "206-2006",
  },
};

function item(selectionId, quantity = 1) {
  const [productId, variantId] = selectionId.split("-").map(Number);
  return { productId, variantId, quantity };
}

function itemsFor(build) {
  return Object.values(build.selections).map((selectionId) => item(selectionId));
}

test("one build does not falsely touch another build through a shared component", () => {
  const result = matchPcBuilderBuildsToOrderItems(
    [buildA, buildB],
    itemsFor(buildA),
  );

  assert.equal(result.error, null);
  assert.deepEqual(result.builds.map((build) => build.buildId), [buildA.buildId]);
});

test("two builds may consume two separate rows of the exact same variant", () => {
  const result = matchPcBuilderBuildsToOrderItems(
    [buildA, buildB],
    [...itemsFor(buildA), ...itemsFor(buildB)],
  );

  assert.equal(result.error, null);
  assert.deepEqual(
    new Set(result.builds.map((build) => build.buildId)),
    new Set([buildA.buildId, buildB.buildId]),
  );
});

test("a shared component still requires one locked row per build", () => {
  const bothWithoutSecondShared = [
    ...itemsFor(buildA),
    ...itemsFor(buildB).filter(
      (row) => `${row.productId}-${row.variantId}` !== "900-9001",
    ),
  ];
  const result = matchPcBuilderBuildsToOrderItems(
    [buildA, buildB],
    bothWithoutSecondShared,
  );

  assert.equal(result.error?.code, "PC_BUILDER_CART_CHANGED");
});

test("quantity two cannot stand in for two grouped build rows", () => {
  const rows = [...itemsFor(buildA), ...itemsFor(buildB)];
  const firstShared = rows.find(
    (row) => `${row.productId}-${row.variantId}` === "900-9001",
  );
  firstShared.quantity = 2;
  const result = matchPcBuilderBuildsToOrderItems([buildA, buildB], rows);

  assert.equal(result.error?.code, "PC_BUILD_COMPONENT_QUANTITY_LOCKED");
});

test("cart identity migration and routes keep build-specific rows distinct", async () => {
  const [migration, cartRoute, cartCore, orderCore, context] = await Promise.all([
    readFile(
      new URL(
        "../prisma/migrations/20260820_support_shared_pc_builder_cart_variants/migration.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../app/api/cart/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/cart/route-core.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/orders/route-core.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../components/ecommarce/CartContext.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(migration, /ADD COLUMN "lineKey" VARCHAR\(80\)/);
  assert.match(migration, /productId", "variantId", "lineKey"/);
  assert.match(cartRoute, /pcBuilderCartLineKey/);
  assert.match(cartRoute, /PC_BUILDER_CART_LINE_UNAVAILABLE/);
  assert.match(cartCore, /lineKey" = 'standard'/);
  assert.match(orderCore, /Array\.from\(new Set/);
  assert.match(orderCore, /selectionQueues/);
  assert.match(context, /window\.location\.pathname\.includes\("\/pc-builder"\)/);
});
