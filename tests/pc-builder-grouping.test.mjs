import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createPcBuildId,
  normalizePcBuildId,
  pcBuildSelectionId,
} from "../lib/pc-builder-grouping.ts";
import {
  appendPcBuilderCheckoutBuild,
  createPcBuilderCheckoutBuild,
  findPcBuilderBuildMatches,
} from "../lib/pc-builder-checkout.ts";

const BUILD_A = createPcBuildId(
  () => "123e4567-e89b-12d3-a456-426614174000",
);
const BUILD_B = createPcBuildId(
  () => "123e4567-e89b-12d3-a456-426614174001",
);

test("PC build IDs use a strict server-generated shape", () => {
  assert.equal(normalizePcBuildId(BUILD_A), BUILD_A);
  assert.equal(normalizePcBuildId("pcb_bad"), null);
  assert.equal(pcBuildSelectionId({ productId: 10, variantId: 20 }), "10-20");
});

test("checkout state can retain multiple distinct validated builds", () => {
  const first = createPcBuilderCheckoutBuild(BUILD_A, {
    processor: "1-2",
    motherboard: "3-4",
  });
  const second = createPcBuilderCheckoutBuild(BUILD_B, {
    processor: "5-6",
    motherboard: "7-8",
  });
  const one = appendPcBuilderCheckoutBuild(null, first);
  const two = appendPcBuilderCheckoutBuild(one, second);
  assert.equal(two?.builds.length, 2);
  assert.equal(findPcBuilderBuildMatches(two, "7-8")[0]?.slot, "motherboard");
});

test("Step 7 routes preserve old cart/order cores and add durable grouping", async () => {
  const [cartRoute, cartItemRoute, orderRoute, migration, validationRoute] =
    await Promise.all([
      readFile(new URL("../app/api/cart/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/cart/[id]/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../prisma/migrations/20260820_add_pc_build_grouping/migration.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../app/api/pc-builder/validate/route.ts", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(cartRoute, /from "\.\/route-core"/);
  assert.match(cartRoute, /PcBuildCartItem/);
  assert.match(cartItemRoute, /PC_BUILD_COMPONENT_QUANTITY_LOCKED/);
  assert.match(cartItemRoute, /removeBuild/);
  assert.match(orderRoute, /PcBuildOrderItem/);
  assert.match(orderRoute, /validatePcBuilderSelectionLive/);
  assert.match(validationRoute, /createPcBuildId/);
  assert.match(validationRoute, /buildId/);
  assert.match(migration, /CREATE TABLE "PcBuildCartItem"/);
  assert.match(migration, /CREATE TABLE "PcBuildOrderItem"/);
});
