import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evaluatePcBuild,
  parseSharedBuild,
  selectionFromIds,
  serializeSharedBuild,
} from "../lib/pc-builder.ts";
import { parseProductAttributeInput } from "../lib/product-attribute-input.ts";

function component(id, overrides = {}) {
  const variantId = id * 10;
  return {
    selectionId: `${id}-${variantId}`,
    id,
    name: `Component ${id}`,
    slug: `component-${id}`,
    sku: `PRODUCT-${id}`,
    image: null,
    price: id * 1000,
    originalPrice: null,
    currency: "BDT",
    brand: "Demo",
    categorySlug: "component",
    attributes: {},
    variantId,
    variantSku: `VARIANT-${variantId}`,
    variantLabel: null,
    stock: 5,
    ...overrides,
  };
}

function compatibleBuild() {
  return {
    processor: component(1, {
      attributes: {
        Socket: "AM5",
        TDP: "120W",
        "Integrated Graphics": "Yes",
        "Cooler Included": "No",
      },
    }),
    motherboard: component(2, {
      attributes: {
        Socket: "AM5",
        "Memory Type": "DDR5",
        "Form Factor": "Micro-ATX",
      },
    }),
    memory: component(3, { attributes: { "Memory Type": "DDR5" } }),
    graphics: component(4, {
      attributes: { "Power Draw": "200W", "GPU Length": "306mm" },
    }),
    storage: component(5, { attributes: { "Power Draw": "8W" } }),
    powerSupply: component(6, { attributes: { Wattage: "650W" } }),
    case: component(7, {
      attributes: {
        "Motherboard Support": "Micro-ATX, Mini-ITX",
        "Max GPU Length": "320mm",
        "Max Cooler Height": "165mm",
      },
    }),
    cooler: component(8, {
      attributes: { "Socket Support": "AM4, AM5", "Cooler Height": "150mm" },
    }),
  };
}

test("a complete compatible build is checkout-ready with PSU headroom", () => {
  const result = evaluatePcBuild(compatibleBuild());

  assert.equal(result.requiredComplete, true);
  assert.equal(result.hasErrors, false);
  assert.equal(result.canAddToCart, true);
  assert.equal(result.estimatedWattage, 425);
  assert.equal(result.recommendedPsuWattage, 600);
});

test("socket, memory, case clearance and PSU conflicts block checkout", () => {
  const build = compatibleBuild();
  build.motherboard.attributes.Socket = "AM4";
  build.motherboard.attributes["Memory Type"] = "DDR4";
  build.motherboard.attributes["Form Factor"] = "ATX";
  build.case.attributes["Max GPU Length"] = "250mm";
  build.case.attributes["Max Cooler Height"] = "140mm";
  build.powerSupply.attributes.Wattage = "450W";

  const result = evaluatePcBuild(build);
  const codes = new Set(result.issues.map((issue) => issue.code));

  assert.equal(result.canAddToCart, false);
  assert.equal(codes.has("cpu-motherboard-socket"), true);
  assert.equal(codes.has("motherboard-memory-type"), true);
  assert.equal(codes.has("motherboard-case-form-factor"), true);
  assert.equal(codes.has("gpu-case-clearance"), true);
  assert.equal(codes.has("cooler-case-clearance"), true);
  assert.equal(codes.has("insufficient-power-supply"), true);
});

test("out-of-stock and mixed-currency selections are rejected", () => {
  const build = compatibleBuild();
  build.storage.stock = 0;
  build.memory.currency = "USD";

  const result = evaluatePcBuild(build);
  const codes = new Set(result.issues.map((issue) => issue.code));

  assert.equal(result.canAddToCart, false);
  assert.equal(codes.has("out-of-stock-storage"), true);
  assert.equal(codes.has("mixed-currencies"), true);
});

test("conditionally required graphics and cooling block unsafe builds", () => {
  const build = compatibleBuild();
  delete build.graphics;
  delete build.cooler;
  build.processor.attributes["Integrated Graphics"] = "No";
  build.processor.attributes["Cooler Included"] = "No";

  const result = evaluatePcBuild(build);
  const codes = new Set(result.issues.map((issue) => issue.code));

  assert.equal(result.requiredComplete, true);
  assert.equal(result.canAddToCart, false);
  assert.equal(codes.has("graphics-required"), true);
  assert.equal(codes.has("cooler-required"), true);
});

test("critical compatibility metadata must be complete before checkout", () => {
  const build = compatibleBuild();
  delete build.motherboard.attributes.Socket;
  delete build.powerSupply.attributes.Wattage;

  const result = evaluatePcBuild(build);
  const codes = new Set(result.issues.map((issue) => issue.code));

  assert.equal(result.canAddToCart, false);
  assert.equal(codes.has("cpu-motherboard-data"), true);
  assert.equal(codes.has("power-supply-data"), true);
});

test("common technical formatting aliases do not create false conflicts", () => {
  const build = compatibleBuild();
  build.processor.attributes.Socket = "AM-5";
  build.motherboard.attributes.Socket = "AM5 (LGA1718)";
  build.motherboard.attributes["Form Factor"] = "Micro ATX";
  build.case.attributes["Motherboard Support"] = "Micro-ATX, Mini-ITX";

  const result = evaluatePcBuild(build);

  assert.equal(result.hasErrors, false);
  assert.equal(result.canAddToCart, true);
});

test("power and length units are normalized before compatibility checks", () => {
  const build = compatibleBuild();
  build.processor.attributes.TDP = "0.12 kW";
  build.graphics.attributes["Power Draw"] = "0.2kW";
  build.graphics.attributes["GPU Length"] = "12 in";
  build.case.attributes["Max GPU Length"] = "32 cm";
  build.cooler.attributes["Cooler Height"] = "15 cm";
  build.case.attributes["Max Cooler Height"] = "0.165 m";
  build.powerSupply.attributes.Wattage = "0.65 kW";

  const result = evaluatePcBuild(build);

  assert.equal(result.hasErrors, false);
  assert.equal(result.canAddToCart, true);
  assert.equal(result.estimatedWattage, 425);
  assert.equal(result.recommendedPsuWattage, 600);
});

test("unsupported measurement units fail closed instead of being guessed", () => {
  const build = compatibleBuild();
  build.processor.attributes.TDP = "120 BTU";
  build.graphics.attributes["GPU Length"] = "12 cubits";
  build.powerSupply.attributes.Wattage = "650 VA";

  const result = evaluatePcBuild(build);
  const codes = new Set(result.issues.map((issue) => issue.code));

  assert.equal(result.canAddToCart, false);
  assert.equal(codes.has("processor-power-data"), true);
  assert.equal(codes.has("gpu-case-data"), true);
  assert.equal(codes.has("power-supply-data"), true);
});

test("ambiguous boolean compatibility data fails closed", () => {
  const build = compatibleBuild();
  delete build.graphics;
  delete build.cooler;
  build.processor.attributes["Integrated Graphics"] = "Maybe";
  build.processor.attributes["Cooler Included"] = "Unknown";

  const result = evaluatePcBuild(build);
  const codes = new Set(result.issues.map((issue) => issue.code));

  assert.equal(result.canAddToCart, false);
  assert.equal(codes.has("graphics-capability-data"), true);
  assert.equal(codes.has("cooler-included-data"), true);
});

test("common negative boolean phrases are treated as explicit false values", () => {
  const build = compatibleBuild();
  delete build.graphics;
  delete build.cooler;
  build.processor.attributes["Integrated Graphics"] = "No iGPU";
  build.processor.attributes["Cooler Included"] = "Not Included";

  const result = evaluatePcBuild(build);
  const codes = new Set(result.issues.map((issue) => issue.code));

  assert.equal(result.canAddToCart, false);
  assert.equal(codes.has("graphics-required"), true);
  assert.equal(codes.has("cooler-required"), true);
});

test("share links preserve the selected product variant and ignore hostile input", () => {
  const build = compatibleBuild();
  const serialized = serializeSharedBuild(build);
  const parsed = parseSharedBuild(`${serialized},constructor:1-1,bad:7,<script>:2`);

  assert.equal(parsed.processor, build.processor.selectionId);
  assert.equal(parsed.storage, build.storage.selectionId);
  assert.equal(Object.hasOwn(parsed, "constructor"), false);
  assert.deepEqual(parseSharedBuild("x".repeat(501)), {});
});

test("saved builds restore the exact variant with legacy product-id fallback", () => {
  const primary = component(10, { variantLabel: "Capacity: 1TB" });
  const alternate = component(10, {
    selectionId: "10-101",
    variantId: 101,
    variantSku: "VARIANT-101",
    variantLabel: "Capacity: 2TB",
  });
  const catalog = {
    processor: [],
    motherboard: [],
    memory: [],
    graphics: [],
    storage: [primary, alternate],
    powerSupply: [],
    case: [],
    cooler: [],
  };

  assert.equal(
    selectionFromIds(catalog, { storage: "10-101" }).storage?.variantId,
    101,
  );
  assert.equal(
    selectionFromIds(catalog, { storage: 10 }).storage?.variantId,
    primary.variantId,
  );
});

test("PC Builder data mutations require product-management permission", async () => {
  const route = await readFile(
    new URL("../app/api/product-attributes/route.ts", import.meta.url),
    "utf8",
  );
  const itemRoute = await readFile(
    new URL("../app/api/product-attributes/[id]/route.ts", import.meta.url),
    "utf8",
  );
  const accessHelper = await readFile(
    new URL("../lib/product-management-access.ts", import.meta.url),
    "utf8",
  );

  for (const source of [route, itemRoute]) {
    assert.match(source, /requireProductManager\(\)/);
    assert.match(source, /revalidateStorefrontCatalog\(\)/);
  }
  assert.match(accessHelper, /getServerSession\(authOptions\)/);
  assert.match(accessHelper, /"products\.manage"/);
});

test("cart submission performs an uncached live validation first", async () => {
  const client = await readFile(
    new URL(
      "../components/ecommarce/pc-builder/PcBuilderClient.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const validationRoute = await readFile(
    new URL("../app/api/pc-builder/validate/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(client, /fetch\("\/api\/pc-builder\/validate"/);
  assert.match(client, /cache: "no-store"/);
  assert.match(validationRoute, /rateLimitRequest/);
  assert.match(validationRoute, /validatePcBuilderSelectionLive/);
  assert.match(validationRoute, /private, no-store/);
});

test("demo catalog includes every required PC component category", async () => {
  const seed = await readFile(
    new URL("../prisma/seed-data/storefront/constants.ts", import.meta.url),
    "utf8",
  );

  for (const slug of [
    "processor",
    "motherboard",
    "desktop-ram",
    "graphics-card",
    "ssd-storage",
    "power-supply",
    "pc-case",
    "cpu-cooler",
  ]) {
    assert.match(seed, new RegExp(`slug: "${slug}"`));
  }
  for (const attribute of [
    "Socket",
    "Memory Type",
    "Motherboard Support",
    "Max GPU Length",
    "Wattage",
  ]) {
    assert.match(seed, new RegExp(attribute));
  }
});

test("admin product attributes are bounded and deduplicated safely", () => {
  const parsed = parseProductAttributeInput([
    { attributeId: 7, value: "AM4" },
    { attributeId: 7, value: "AM5" },
    { attributeId: 8, value: "DDR5" },
  ]);

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.value, [
      { attributeId: 7, value: "AM5" },
      { attributeId: 8, value: "DDR5" },
    ]);
  }
  assert.equal(
    parseProductAttributeInput([{ attributeId: 1, value: "x".repeat(501) }])
      .ok,
    false,
  );
});
