import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  appendPcBuilderCheckoutBuild,
  createPcBuilderCheckoutBuild,
  findPcBuilderBuildMatches,
  removePcBuilderCheckoutBuild,
} from "../lib/pc-builder-checkout.ts";
import { createPcBuildId } from "../lib/pc-builder-grouping.ts";

const BUILD_A = createPcBuildId(
  () => "123e4567-e89b-12d3-a456-426614174010",
);
const BUILD_B = createPcBuildId(
  () => "123e4567-e89b-12d3-a456-426614174011",
);

const selections = {
  processor: "201-2001",
  motherboard: "202-2002",
  memory: "203-2003",
  storage: "204-2004",
  powerSupply: "205-2005",
  case: "206-2006",
};

test("revalidating the same component selections replaces the stale build ID", () => {
  const first = createPcBuilderCheckoutBuild(BUILD_A, selections);
  const second = createPcBuilderCheckoutBuild(BUILD_B, selections);
  const state = appendPcBuilderCheckoutBuild(
    appendPcBuilderCheckoutBuild(null, first),
    second,
  );

  assert.ok(state);
  assert.equal(state.builds.length, 1);
  assert.equal(state.builds[0]?.buildId, BUILD_B);
  assert.equal(findPcBuilderBuildMatches(state, "205-2005").length, 1);
});

test("removing a cart build prunes only that build from checkout state", () => {
  const first = createPcBuilderCheckoutBuild(BUILD_A, selections);
  const second = createPcBuilderCheckoutBuild(BUILD_B, {
    ...selections,
    processor: "301-3001",
  });
  const state = appendPcBuilderCheckoutBuild(
    appendPcBuilderCheckoutBuild(null, first),
    second,
  );

  assert.ok(state);
  const next = removePcBuilderCheckoutBuild(state, BUILD_A);
  assert.deepEqual(next.builds.map((build) => build.buildId), [BUILD_B]);
});

test("cart build removal synchronizes and clears the checkout cookie safely", async () => {
  const source = await readFile(
    new URL("../app/api/cart/[id]/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /removePcBuilderCheckoutBuild/);
  assert.match(source, /serializePcBuilderCheckoutState/);
  assert.match(source, /maxAge:\s*0/);
  assert.match(source, /c\."userId" = \$2/);
});

test("successful checkout clears the completed PC Builder draft in every payment flow", async () => {
  const [checkout, paymentResult] = await Promise.all([
    readFile(
      new URL("../app/ecommerce/checkout/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/ecommerce/payment-result/PaymentResultClient.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  for (const source of [checkout, paymentResult]) {
    assert.match(source, /PC_BUILDER_STORAGE_KEY/);
    assert.match(source, /PC_BUILDER_EXTRA_ITEMS_STORAGE_KEY/);
    assert.match(source, /clearCompletedPcBuilderDraft\(\)/);
  }
  assert.match(paymentResult, /if \(!success\) return/);
});
