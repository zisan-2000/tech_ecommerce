import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePcBuild } from "../lib/pc-builder.ts";

function component(id, overrides = {}) {
  const variantId = id * 10;
  return {
    selectionId: `${id}-${variantId}`,
    id,
    name: `Advanced Component ${id}`,
    slug: `advanced-component-${id}`,
    sku: `ADV-${id}`,
    image: null,
    price: id * 1000,
    originalPrice: null,
    currency: "BDT",
    brand: "Demo",
    categorySlug: "component",
    attributes: {},
    variantId,
    variantSku: `ADV-VARIANT-${variantId}`,
    variantLabel: null,
    stock: 5,
    ...overrides,
  };
}

function advancedCompatibleBuild() {
  return {
    processor: component(101, {
      attributes: {
        Socket: "AM5",
        TDP: "120W",
        "Integrated Graphics": "Yes",
        "Cooler Included": "No",
        "Supported Chipsets": "B650 / X670",
        "CPU Generation": "Ryzen 7000",
      },
    }),
    motherboard: component(102, {
      attributes: {
        Socket: "AM5",
        "Memory Type": "DDR5",
        "Form Factor": "Micro-ATX",
        Chipset: "B650",
        "Supported CPU Generations": "Ryzen 7000 / Ryzen 8000",
        "BIOS Update Required": "No",
        "M.2 Support": "PCIe Gen4 / PCIe Gen3",
        "Maximum Memory": "256GB",
        "ECC Support": "No",
      },
    }),
    memory: component(103, {
      attributes: {
        "Memory Type": "DDR5",
        Capacity: "16GB",
        Speed: "6000MHz",
        ECC: "No",
      },
    }),
    graphics: component(104, {
      attributes: {
        "Power Draw": "200W",
        "GPU Length": "306mm",
        "Power Connector": "2 x 8-pin PCIe",
      },
    }),
    storage: component(105, {
      attributes: {
        Capacity: "1TB",
        Interface: "PCIe Gen4 x4 NVMe",
        "Form Factor": "M.2 2280",
      },
    }),
    powerSupply: component(106, {
      attributes: {
        Wattage: "1000W",
        "Form Factor": "ATX",
        "PCIe Connectors": "4 x 6+2-pin PCIe",
      },
    }),
    case: component(107, {
      attributes: {
        "Motherboard Support": "Micro-ATX / Mini-ITX",
        "Max GPU Length": "320mm",
        "Max Cooler Height": "165mm",
        "PSU Support": "ATX",
      },
    }),
    cooler: component(108, {
      attributes: {
        "Socket Support": "AM4 / AM5",
        "Cooler Height": "150mm",
        "TDP Support": "220W",
      },
    }),
  };
}

function issueCodes(result) {
  return new Set(result.issues.map((item) => item.code));
}

test("advanced compatibility metadata accepts a fully compatible build", () => {
  const result = evaluatePcBuild(advancedCompatibleBuild());
  assert.equal(result.hasErrors, false);
  assert.equal(result.canAddToCart, true);
});

test("cooler TDP capacity must cover processor TDP", () => {
  const build = advancedCompatibleBuild();
  build.processor.attributes.TDP = "250W";

  const result = evaluatePcBuild(build);
  assert.equal(result.canAddToCart, false);
  assert.equal(issueCodes(result).has("cpu-cooler-tdp"), true);
});

test("RAM capacity cannot exceed the motherboard maximum", () => {
  const build = advancedCompatibleBuild();
  build.memory.attributes.Capacity = "512GB";

  const result = evaluatePcBuild(build);
  assert.equal(result.canAddToCart, false);
  assert.equal(issueCodes(result).has("motherboard-memory-capacity"), true);
});

test("M.2 SATA storage is blocked when the board only lists PCIe M.2 support", () => {
  const build = advancedCompatibleBuild();
  build.storage.attributes.Interface = "SATA III";

  const result = evaluatePcBuild(build);
  assert.equal(result.canAddToCart, false);
  assert.equal(issueCodes(result).has("motherboard-storage-interface"), true);
});

test("newer PCIe storage generation warns instead of falsely blocking a backward-compatible slot", () => {
  const build = advancedCompatibleBuild();
  build.storage.attributes.Interface = "PCIe Gen5 x4 NVMe";

  const result = evaluatePcBuild(build);
  assert.equal(result.canAddToCart, true);
  assert.equal(
    issueCodes(result).has("motherboard-storage-pcie-generation"),
    true,
  );
});

test("PSU form factor must be supported by the selected case", () => {
  const build = advancedCompatibleBuild();
  build.powerSupply.attributes["Form Factor"] = "SFX";

  const result = evaluatePcBuild(build);
  assert.equal(result.canAddToCart, false);
  assert.equal(issueCodes(result).has("psu-case-form-factor"), true);
});

test("GPU connector requirements must be covered by the PSU connector inventory", () => {
  const build = advancedCompatibleBuild();
  build.powerSupply.attributes["PCIe Connectors"] = "1 x 6+2-pin PCIe";

  const result = evaluatePcBuild(build);
  assert.equal(result.canAddToCart, false);
  assert.equal(issueCodes(result).has("gpu-psu-power-connectors"), true);
});

test("explicit chipset and CPU-generation mismatches are blocked", () => {
  const build = advancedCompatibleBuild();
  build.motherboard.attributes.Chipset = "A620";
  build.motherboard.attributes["Supported CPU Generations"] = "Ryzen 5000";

  const result = evaluatePcBuild(build);
  const codes = issueCodes(result);
  assert.equal(result.canAddToCart, false);
  assert.equal(codes.has("cpu-motherboard-chipset"), true);
  assert.equal(codes.has("cpu-motherboard-generation"), true);
});

test("a declared BIOS update requirement is a warning, not a false incompatibility", () => {
  const build = advancedCompatibleBuild();
  build.motherboard.attributes["BIOS Update Required"] = "Yes";

  const result = evaluatePcBuild(build);
  assert.equal(result.canAddToCart, true);
  assert.equal(issueCodes(result).has("motherboard-bios-update"), true);
});

test("ECC memory is blocked when the motherboard explicitly does not support ECC", () => {
  const build = advancedCompatibleBuild();
  build.memory.attributes.ECC = "Yes";

  const result = evaluatePcBuild(build);
  assert.equal(result.canAddToCart, false);
  assert.equal(issueCodes(result).has("motherboard-memory-ecc"), true);
});

test("memory above the listed motherboard speed limit produces a downclock warning", () => {
  const build = advancedCompatibleBuild();
  build.motherboard.attributes["Maximum Memory Speed"] = "5600MHz";

  const result = evaluatePcBuild(build);
  assert.equal(result.canAddToCart, true);
  assert.equal(issueCodes(result).has("motherboard-memory-speed"), true);
});
