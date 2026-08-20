import assert from "node:assert/strict";
import test from "node:test";

import {
  appendPcBuilderCheckoutBuild,
  createPcBuilderCheckoutBuild,
  findPcBuilderBuildMatches,
  parsePcBuilderCheckoutCookie,
  serializePcBuilderCheckoutState,
} from "../lib/pc-builder-checkout.ts";
import { createPcBuildId } from "../lib/pc-builder-grouping.ts";

const buildId = createPcBuildId(
  () => "123e4567-e89b-12d3-a456-426614174000",
);
const selections = {
  processor: "101-1001",
  motherboard: "102-1002",
  memory: "103-1003",
  storage: "104-1004",
  powerSupply: "105-1005",
  case: "106-1006",
};

test("checkout build state round-trips through the HttpOnly cookie format", () => {
  const build = createPcBuilderCheckoutBuild(buildId, selections);
  const state = appendPcBuilderCheckoutBuild(null, build);
  assert.ok(state);
  const encoded = serializePcBuilderCheckoutState(state);
  assert.deepEqual(parsePcBuilderCheckoutCookie(encoded), state);
});

test("checkout state can resolve the build and slot for a validated component", () => {
  const build = createPcBuilderCheckoutBuild(buildId, selections);
  const state = appendPcBuilderCheckoutBuild(null, build);
  assert.ok(state);
  const matches = findPcBuilderBuildMatches(state, "105-1005");
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.build.buildId, buildId);
  assert.equal(matches[0]?.slot, "powerSupply");
});

test("validation route issues a server build ID only for checkout-ready live builds", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../app/api/pc-builder/validate/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /createPcBuildId/);
  assert.match(source, /result\.missingSlots\.length > 0/);
  assert.match(source, /!result\.evaluation\.canAddToCart/);
  assert.match(source, /httpOnly: true/);
  assert.match(source, /PC_BUILDER_CHECKOUT_COOKIE/);
});

test("order route verifies occurrence-based grouping and live compatibility before delegating", async () => {
  const { readFile } = await import("node:fs/promises");
  const [wrapper, core] = await Promise.all([
    readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/orders/route-core.ts", import.meta.url), "utf8"),
  ]);
  assert.match(wrapper, /matchPcBuilderBuildsToOrderItems/);
  assert.match(wrapper, /PC_BUILDER_CART_CHANGED/);
  assert.match(wrapper, /PC_BUILD_COMPONENT_QUANTITY_LOCKED/);
  assert.match(wrapper, /validatePcBuilderSelectionLive/);
  assert.match(wrapper, /PC_BUILDER_CHECKOUT_REVALIDATION_FAILED/);
  assert.match(wrapper, /pcBuilderBuilds: matched\.builds/);
  assert.match(core, /PcBuildOrderItem/);
  assert.match(core, /persistPcBuilderOrderGrouping/);
  assert.match(core, /selectionQueues/);
});
