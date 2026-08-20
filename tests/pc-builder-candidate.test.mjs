import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { evaluatePcBuilderCandidate } from "../lib/pc-builder.ts";

const CATEGORY_BY_SLOT = {
  processor: "processor",
  motherboard: "motherboard",
  memory: "desktop-ram",
  graphics: "graphics-card",
  storage: "ssd-storage",
  powerSupply: "power-supply",
  case: "pc-case",
  cooler: "cpu-cooler",
};

let sequence = 9000;
function component(slot, attributes, overrides = {}) {
  sequence += 1;
  const id = sequence;
  const variantId = sequence + 10000;
  return {
    selectionId: `${id}-${variantId}`,
    id,
    name: `${slot}-${id}`,
    slug: `${slot}-${id}`,
    sku: `${slot}-${id}`,
    image: null,
    price: 100,
    originalPrice: null,
    currency: "BDT",
    brand: "Test",
    categorySlug: CATEGORY_BY_SLOT[slot],
    attributes,
    variantId,
    variantSku: `${slot}-variant-${variantId}`,
    variantLabel: null,
    stock: 10,
    ...overrides,
  };
}

test("candidate evaluator blocks a new hard relational incompatibility", () => {
  const motherboard = component("motherboard", {
    Socket: "AM5",
    "Memory Type": "DDR5",
    "Form Factor": "ATX",
  });
  const processor = component("processor", {
    Socket: "AM4",
    TDP: "65W",
    "Integrated Graphics": "Yes",
    "Cooler Included": "Yes",
  });

  const result = evaluatePcBuilderCandidate(
    { motherboard },
    "processor",
    processor,
  );

  assert.equal(result.builderReady, true);
  assert.equal(result.compatible, false);
  assert.equal(result.canSelect, false);
  assert.ok(
    result.blockingIssues.some(
      (item) => item.code === "cpu-motherboard-socket",
    ),
  );
});

test("CPU dependencies that can be satisfied later do not hide the processor", () => {
  const processor = component("processor", {
    Socket: "AM5",
    TDP: "65W",
    "Integrated Graphics": "No",
    "Cooler Included": "No",
  });

  const result = evaluatePcBuilderCandidate({}, "processor", processor);

  assert.equal(result.builderReady, true);
  assert.equal(result.compatible, true);
  assert.equal(result.canSelect, true);
  assert.ok(
    result.relevantIssues.some((item) => item.code === "graphics-required"),
  );
  assert.ok(
    result.relevantIssues.some((item) => item.code === "cooler-required"),
  );
});

test("warning-only compatibility findings remain selectable", () => {
  const motherboard = component("motherboard", {
    Socket: "AM5",
    "Memory Type": "DDR5",
    "Form Factor": "ATX",
    "M.2 Support": "PCIe Gen4 NVMe",
  });
  const storage = component("storage", {
    Interface: "PCIe Gen5 NVMe",
    "Form Factor": "M.2",
  });

  const result = evaluatePcBuilderCandidate(
    { motherboard },
    "storage",
    storage,
  );

  assert.equal(result.compatible, true);
  assert.equal(result.canSelect, true);
  assert.ok(
    result.warningIssues.some(
      (item) => item.code === "motherboard-storage-pcie-generation",
    ),
  );
});

test("out-of-stock is separate from compatibility and still disables selection", () => {
  const processor = component(
    "processor",
    {
      Socket: "AM5",
      TDP: "65W",
      "Integrated Graphics": "Yes",
      "Cooler Included": "Yes",
    },
    { stock: 0 },
  );

  const result = evaluatePcBuilderCandidate({}, "processor", processor);

  assert.equal(result.compatible, true);
  assert.equal(result.inStock, false);
  assert.equal(result.canSelect, false);
});

test("component picker defaults to compatible filtering and disables shown conflicts", async () => {
  const client = await readFile(
    new URL(
      "../components/ecommarce/pc-builder/PcBuilderClient.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(client, /evaluatePcBuilderCandidate/);
  assert.match(client, /compatibleOnly/);
  assert.match(
    client,
    /product\.stock < 1 \|\| notBuilderReady \|\| incompatible/,
  );
  assert.match(client, /Compatible only/);
  assert.match(client, /Show all components/);
  assert.match(client, /Incompatible/);
});
