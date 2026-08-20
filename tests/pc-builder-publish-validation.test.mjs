import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getPcBuilderSlotForCategory,
  validatePcBuilderProductForActivation,
} from "../lib/pc-builder-publish-validation.ts";

function product(categorySlug, attributes = {}) {
  return {
    id: 501,
    name: "Publish Validation Product",
    category: { slug: categorySlug },
    attributes: Object.entries(attributes).map(([name, value]) => ({
      value,
      attribute: { name },
    })),
  };
}

test("PC Builder categories map to their activation validation slots", () => {
  assert.equal(getPcBuilderSlotForCategory("processor"), "processor");
  assert.equal(getPcBuilderSlotForCategory("desktop-ram"), "memory");
  assert.equal(getPcBuilderSlotForCategory("power-supply"), "powerSupply");
  assert.equal(getPcBuilderSlotForCategory("not-a-builder-category"), null);
});

test("non-PC products are not blocked by the PC Builder activation gate", () => {
  const result = validatePcBuilderProductForActivation(product("laptop"));
  assert.equal(result.applies, false);
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test("processor activation is blocked when required builder specs are incomplete", () => {
  const result = validatePcBuilderProductForActivation(
    product("processor", {
      Socket: "AM5",
      TDP: "120W",
      "Integrated Graphics": "Yes",
    }),
  );

  assert.equal(result.applies, true);
  assert.equal(result.ok, false);
  assert.equal(result.slot, "processor");
  assert.equal(
    result.issues.some((issue) =>
      issue.code.includes("pc-builder-spec-processor-cooler-included"),
    ),
    true,
  );
});

test("processor activation passes when all required builder specs are valid", () => {
  const result = validatePcBuilderProductForActivation(
    product("processor", {
      Socket: "AM5",
      TDP: "120W",
      "Integrated Graphics": "Yes",
      "Cooler Included": "No",
    }),
  );

  assert.equal(result.applies, true);
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test("placeholder compatibility values remain invalid at activation time", () => {
  const result = validatePcBuilderProductForActivation(
    product("motherboard", {
      Socket: "Unknown",
      "Memory Type": "DDR5",
      "Form Factor": "Micro-ATX",
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(
    result.issues.some((issue) => issue.code.includes("motherboard-socket")),
    true,
  );
});

test("availability route enforces readiness only on inactive-to-active transitions", async () => {
  const route = await readFile(
    new URL("../app/api/products/[id]/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /validatePcBuilderProductForActivation/);
  assert.match(route, /parsed\.value\.available\s*&&\s*!existing\.available/);
  assert.match(route, /PC_BUILDER_SPECS_INCOMPLETE/);
  assert.match(route, /return corePatch\(forwarded, ctx\)/);
});
