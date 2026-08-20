import assert from "node:assert/strict";
import test from "node:test";

import { validatePcBuilderProductReadiness } from "../lib/pc-builder.ts";

function product(attributes) {
  return {
    selectionId: "901-1901",
    id: 901,
    name: "Placeholder Test Product",
    slug: "placeholder-test-product",
    sku: "PLACEHOLDER-TEST",
    image: null,
    price: 100,
    originalPrice: null,
    currency: "BDT",
    brand: "Test",
    categorySlug: "motherboard",
    attributes,
    variantId: 1901,
    variantSku: "PLACEHOLDER-TEST-V1",
    variantLabel: null,
    stock: 5,
  };
}

test("critical token specs reject punctuation variants of N/A", () => {
  for (const placeholder of ["N/A", "n/a", "N.A.", "N / A", "N-A", "NA", "--", "Not specified"]) {
    const issues = validatePcBuilderProductReadiness(
      "motherboard",
      product({
        Socket: placeholder,
        "Memory Type": "DDR5",
        "Form Factor": "ATX",
      }),
    );

    assert.equal(
      issues.some((issue) => issue.code === "pc-builder-spec-motherboard-socket"),
      true,
      `${placeholder} must not satisfy the motherboard socket requirement`,
    );
  }
});

test("token-list specs reject N/A fragments but retain real supported values", () => {
  const invalid = validatePcBuilderProductReadiness(
    "case",
    product({
      "Motherboard Support": "N/A / Unknown / --",
      "Max GPU Length": "350mm",
      "Max Cooler Height": "170mm",
    }),
  );
  assert.equal(
    invalid.some((issue) => issue.code === "pc-builder-spec-case-motherboard-support"),
    true,
  );

  const valid = validatePcBuilderProductReadiness(
    "case",
    product({
      "Motherboard Support": "N/A / Micro-ATX",
      "Max GPU Length": "350mm",
      "Max Cooler Height": "170mm",
    }),
  );
  assert.equal(
    valid.some((issue) => issue.code === "pc-builder-spec-case-motherboard-support"),
    false,
  );
});
