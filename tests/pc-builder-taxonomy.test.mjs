import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalPcBuilderAttributeName,
  canonicalPcBuilderToken,
  normalizePcBuilderCompatibilityAttributes,
  pcBuilderTokenListSupports,
  readPcBuilderAttribute,
  splitPcBuilderTokens,
} from "../lib/pc-builder-taxonomy.ts";
import { evaluatePcBuild } from "../lib/pc-builder.ts";

test("attribute-name taxonomy ignores punctuation, spaces and underscores", () => {
  assert.equal(canonicalPcBuilderAttributeName("CPU_Socket"), "cpusocket");
  assert.equal(canonicalPcBuilderAttributeName("CPU Socket"), "cpusocket");
  assert.equal(canonicalPcBuilderAttributeName("M.2 Support"), "m2support");
  assert.equal(
    readPcBuilderAttribute({ "CPU_Socket": "AM5" }, ["CPU Socket"]),
    "AM5",
  );
});

test("safe hardware aliases canonicalize without conflating distinct standards", () => {
  assert.equal(canonicalPcBuilderToken("AMD Socket AM5", "socket"), "am5");
  assert.equal(canonicalPcBuilderToken("Intel LGA-1700", "socket"), "lga1700");
  assert.equal(canonicalPcBuilderToken("DDR5 SDRAM", "memory-type"), "ddr5");
  assert.equal(canonicalPcBuilderToken("LPDDR5", "memory-type"), "lpddr5");
  assert.notEqual(
    canonicalPcBuilderToken("LPDDR5", "memory-type"),
    canonicalPcBuilderToken("DDR5", "memory-type"),
  );
  assert.equal(canonicalPcBuilderToken("Micro ATX", "form-factor"), "matx");
  assert.equal(canonicalPcBuilderToken("mATX", "form-factor"), "matx");
  assert.equal(canonicalPcBuilderToken("AMD B650 Chipset", "chipset"), "b650");
});

test("taxonomy understands common supported-list vendor phrasing", () => {
  assert.equal(
    pcBuilderTokenListSupports(
      "AMD B650 Chipset / X670E",
      "B650",
      "chipset",
    ),
    true,
  );
  assert.equal(
    pcBuilderTokenListSupports(
      "AMD Ryzen 7000 Series / Ryzen 8000 Series",
      "Ryzen 7000",
      "cpu-generation",
    ),
    true,
  );
  assert.deepEqual(
    splitPcBuilderTokens(
      "AMD Ryzen 7000 Series / Ryzen 8000 Series",
      "cpu-generation",
    ),
    ["ryzen7000", "ryzen8000"],
  );
});

test("attribute normalization adds canonical keys while preserving raw vendor fields", () => {
  const raw = {
    CPU_Socket: "AMD Socket AM5",
    RAM_Type: "DDR5 SDRAM",
    "Supported-Motherboards": "Micro ATX / Mini ITX",
  };
  const normalized = normalizePcBuilderCompatibilityAttributes(raw);

  assert.equal(normalized.CPU_Socket, raw.CPU_Socket);
  assert.equal(normalized["CPU Socket"], "am5");
  assert.equal(normalized["RAM Type"], "ddr5");
  assert.equal(normalized["Supported Motherboards"], "matx / mitx");
});

function component(id, attributes) {
  return {
    selectionId: `${id}-${id * 10}`,
    id,
    name: `Taxonomy Component ${id}`,
    slug: `taxonomy-${id}`,
    sku: `TAX-${id}`,
    image: null,
    price: 1000,
    originalPrice: null,
    currency: "BDT",
    brand: "Vendor",
    categorySlug: "component",
    attributes,
    variantId: id * 10,
    variantSku: `TAX-V-${id * 10}`,
    variantLabel: null,
    stock: 5,
  };
}

test("end-to-end compatibility accepts semantically identical vendor taxonomy", () => {
  const selection = {
    processor: component(1, {
      CPU_Socket: "AMD Socket AM5",
      TDP: "65 W",
      "Integrated Graphics": "Yes",
      "Cooler Included": "Yes",
      "Supported Chipsets": "AMD B650 Chipset / X670E",
      "CPU Generation": "AMD Ryzen 7000 Series",
    }),
    motherboard: component(2, {
      "CPU Socket": "AM5",
      RAM_Type: "DDR5",
      "Form-Factor": "mATX",
      Chipset: "B650",
      "Supported CPU Generations": "Ryzen 7000 / Ryzen 8000",
      "M2 Support": "PCI Express Gen4 NVMe",
    }),
    memory: component(3, {
      "Memory-Type": "DDR5 SDRAM",
      Capacity: "16GB",
      Speed: "6000 MT/s",
    }),
    storage: component(4, {
      Capacity: "1TB",
      Interface: "PCI Express Gen4 x4 NVMe",
      "Form Factor": "M.2 2280",
    }),
    powerSupply: component(5, {
      Wattage: "650W",
      "Form Factor": "ATX",
    }),
    case: component(6, {
      "Supported-Motherboards": "Micro ATX / Mini ITX",
      "Max GPU Length": "320mm",
      "Max Cooler Height": "165mm",
      "Power Supply Support": "ATX",
    }),
  };

  const result = evaluatePcBuild(selection);
  const codes = new Set(result.issues.map((issue) => issue.code));
  assert.equal(result.canAddToCart, true);
  assert.equal(codes.has("cpu-motherboard-socket"), false);
  assert.equal(codes.has("motherboard-memory-type"), false);
  assert.equal(codes.has("motherboard-case-form-factor"), false);
  assert.equal(codes.has("cpu-motherboard-chipset"), false);
  assert.equal(codes.has("cpu-motherboard-generation"), false);
});
