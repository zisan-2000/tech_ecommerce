import assert from "node:assert/strict";
import test from "node:test";
import {
  CouponValidationError,
  validateCouponForSubtotal,
} from "../lib/coupons.ts";
import { storefrontProductSelect } from "../lib/storefront-product.ts";
import { redactCustomerOrder } from "../lib/order-public.ts";
import { validateUpload } from "../lib/upload-security.ts";
import { isPrivateUploadPath } from "../lib/upload-storage.ts";
import { rateLimitRequest } from "../lib/request-security.ts";

function couponClient(coupon) {
  return {
    coupon: {
      findUnique: async () => coupon,
    },
  };
}

function baseCoupon(overrides = {}) {
  return {
    id: "coupon-1",
    code: "SAVE20",
    discountType: "percentage",
    discountValue: 20,
    minOrderValue: 100,
    maxDiscount: 150,
    usageLimit: 10,
    usedCount: 0,
    isValid: true,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

test("storefront product projection excludes internal pricing and asset fields", () => {
  assert.equal("digitalAssetId" in storefrontProductSelect, false);
  assert.equal("lowStockThreshold" in storefrontProductSelect, false);
  assert.equal("costPrice" in storefrontProductSelect.variants.select, false);
  assert.equal("digitalAssetId" in storefrontProductSelect.variants.select, false);
  assert.equal("codes" in storefrontProductSelect.variants.select, false);
});

test("customer order responses redact internal item costs", () => {
  const redacted = redactCustomerOrder({
    id: 1,
    orderItems: [
      { id: 10, price: 500, costPriceSnapshot: 325, product: { id: 2, name: "PC" } },
    ],
  });
  assert.equal("costPriceSnapshot" in redacted.orderItems[0], false);
  assert.equal(redacted.orderItems[0].price, 500);
});

test("coupon calculation is server-derived, capped and currency-rounded", async () => {
  const result = await validateCouponForSubtotal(couponClient(baseCoupon()), {
    code: "save20",
    subtotal: 1_000,
  });
  assert.equal(result?.discountAmount, 150);
  assert.equal(result?.coupon.id, "coupon-1");
});

test("coupon discount can never exceed the subtotal", async () => {
  const result = await validateCouponForSubtotal(
    couponClient(baseCoupon({ discountType: "fixed", discountValue: 999 })),
    { couponId: "coupon-1", subtotal: 120 },
  );
  assert.equal(result?.discountAmount, 120);
});

test("expired coupons are rejected", async () => {
  await assert.rejects(
    validateCouponForSubtotal(
      couponClient(baseCoupon({ expiresAt: new Date(Date.now() - 1_000) })),
      { code: "SAVE20", subtotal: 500 },
    ),
    (error) =>
      error instanceof CouponValidationError && error.message === "Coupon has expired",
  );
});

test("upload validation rejects content that does not match its image extension", () => {
  const fakeFile = { name: "proof.png", type: "image/png", size: 8 };
  const spoofed = validateUpload({
    file: fakeFile,
    bytes: new TextEncoder().encode("not-png!"),
    kind: "image",
  });
  assert.equal(spoofed.ok, false);

  const validPng = validateUpload({
    file: fakeFile,
    bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    kind: "image",
  });
  assert.equal(validPng.ok, true);
});

test("SCM document validation requires Office files to have a ZIP signature", () => {
  const file = {
    name: "quotation.docx",
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: 4,
  };
  assert.equal(
    validateUpload({ file, bytes: new TextEncoder().encode("fake"), kind: "document" }).ok,
    false,
  );
  assert.equal(
    validateUpload({
      file,
      bytes: Uint8Array.from([0x50, 0x4b, 0x03, 0x04]),
      kind: "document",
    }).ok,
    true,
  );
});

test("protected uploads are classified for private object storage", () => {
  assert.equal(isPrivateUploadPath("paymentScreenshot/proof.png"), true);
  assert.equal(isPrivateUploadPath("scm-proposals/quote.pdf"), true);
  assert.equal(isPrivateUploadPath("digital-assets/software.zip"), true);
  assert.equal(isPrivateUploadPath("products/desktop.webp"), false);
});

test("development rate limiter enforces a fixed-window limit", async () => {
  const request = new Request("http://localhost/test", {
    headers: { "x-forwarded-for": "203.0.113.9" },
  });
  const scope = `phase0-test-${Date.now()}`;
  const first = await rateLimitRequest(request, { scope, limit: 1, windowMs: 60_000 });
  const second = await rateLimitRequest(request, { scope, limit: 1, windowMs: 60_000 });
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
});
