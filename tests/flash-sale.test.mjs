import assert from "node:assert/strict";
import test from "node:test";
import {
  applyFlashSalePricingToProduct,
  parseFlashSaleConfiguration,
  resolveFlashSalePricing,
} from "../lib/flash-sale.ts";

const scheduledProduct = {
  basePrice: 10_000,
  flashSaleEnabled: true,
  flashSalePrice: 8_000,
  flashSaleStartsAt: "2026-08-18T10:00:00.000Z",
  flashSaleEndsAt: "2026-08-18T12:00:00.000Z",
};

test("flash price is active only inside the configured half-open time window", () => {
  assert.equal(
    resolveFlashSalePricing(scheduledProduct, 10_000, new Date("2026-08-18T09:59:59.999Z")).active,
    false,
  );
  assert.deepEqual(
    resolveFlashSalePricing(scheduledProduct, 10_000, new Date("2026-08-18T10:00:00.000Z")),
    {
      active: true,
      regularPrice: 10_000,
      salePrice: 8_000,
      savings: 2_000,
      discountPercent: 20,
      startsAt: "2026-08-18T10:00:00.000Z",
      endsAt: "2026-08-18T12:00:00.000Z",
    },
  );
  assert.equal(
    resolveFlashSalePricing(scheduledProduct, 10_000, new Date("2026-08-18T12:00:00.000Z")).active,
    false,
  );
});

test("variant prices receive the same discount ratio without mutating stock data", () => {
  const product = applyFlashSalePricingToProduct(
    {
      ...scheduledProduct,
      originalPrice: 11_000,
      variants: [{ id: 1, price: 12_500, stock: 7 }],
    },
    new Date("2026-08-18T11:00:00.000Z"),
  );
  assert.equal(product.basePrice, 8_000);
  assert.equal(product.originalPrice, 10_000);
  assert.equal(product.variants?.[0].price, 10_000);
  assert.equal(product.variants?.[0].stock, 7);
});

test("configuration validation rejects unsafe prices, dates and stale versions", () => {
  const valid = parseFlashSaleConfiguration(
    {
      enabled: true,
      salePrice: 7_999.99,
      startsAt: "2026-08-18T10:00:00.000Z",
      endsAt: "2026-08-19T10:00:00.000Z",
      sortOrder: 3,
      expectedUpdatedAt: "2026-08-18T09:00:00.000Z",
    },
    10_000,
  );
  assert.equal(valid.ok, true);
  assert.equal(parseFlashSaleConfiguration({ enabled: true, salePrice: 10_000 }, 10_000).ok, false);
  assert.equal(
    parseFlashSaleConfiguration(
      {
        enabled: true,
        salePrice: 8_000,
        startsAt: "2026-08-19T10:00:00.000Z",
        endsAt: "2026-08-18T10:00:00.000Z",
        sortOrder: 0,
      },
      10_000,
    ).ok,
    false,
  );
});

test("disabled and invalid configurations never reduce the authoritative price", () => {
  assert.equal(
    resolveFlashSalePricing({ ...scheduledProduct, flashSaleEnabled: false }, 10_000, new Date("2026-08-18T11:00:00.000Z")).salePrice,
    10_000,
  );
  assert.equal(
    resolveFlashSalePricing({ ...scheduledProduct, flashSalePrice: 12_000 }, 10_000, new Date("2026-08-18T11:00:00.000Z")).salePrice,
    10_000,
  );
});
