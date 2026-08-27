import assert from "node:assert/strict";
import test from "node:test";
import {
  PartnerAssetStatus,
  PartnerAssetType,
  PartnerAttributionSource,
  PartnerAttributionStatus,
  PartnerLeadStatus,
} from "../generated/prisma";
import { BusinessNetworkError } from "../lib/business-network/business-error";
import {
  assertPartnerAssetDates,
  assertPartnerAttributionTransition,
  assertPartnerLeadTransition,
  attributionExpiry,
  formatPartnerLeadNumber,
  isPartnerAssetUsable,
  isSafePartnerDestinationPath,
  normalizePartnerAssetCode,
  sourceForPartnerAsset,
} from "../lib/business-network/partner-referral-core";
import {
  capturePartnerAttributionSchema,
  createPartnerAssetSchema,
  createPartnerLeadSchema,
} from "../lib/business-network/partner-referral-schemas";

test("partner lead happy path and terminal states follow the frozen lifecycle", () => {
  assert.doesNotThrow(() => assertPartnerLeadTransition(PartnerLeadStatus.SUBMITTED, PartnerLeadStatus.VALIDATING));
  assert.doesNotThrow(() => assertPartnerLeadTransition(PartnerLeadStatus.VALIDATING, PartnerLeadStatus.ACCEPTED));
  assert.doesNotThrow(() => assertPartnerLeadTransition(PartnerLeadStatus.ACCEPTED, PartnerLeadStatus.ASSIGNED));
  assert.doesNotThrow(() => assertPartnerLeadTransition(PartnerLeadStatus.ASSIGNED, PartnerLeadStatus.IN_PROGRESS));
  assert.doesNotThrow(() => assertPartnerLeadTransition(PartnerLeadStatus.IN_PROGRESS, PartnerLeadStatus.WON));
  assert.throws(
    () => assertPartnerLeadTransition(PartnerLeadStatus.WON, PartnerLeadStatus.ASSIGNED),
    (error) => error instanceof BusinessNetworkError && error.code === "INVALID_PARTNER_LEAD_TRANSITION",
  );
});

test("attribution can convert, expire, or reject only from active", () => {
  for (const target of [PartnerAttributionStatus.CONVERTED, PartnerAttributionStatus.EXPIRED, PartnerAttributionStatus.REJECTED]) {
    assert.doesNotThrow(() => assertPartnerAttributionTransition(PartnerAttributionStatus.ACTIVE, target));
  }
  assert.throws(
    () => assertPartnerAttributionTransition(PartnerAttributionStatus.CONVERTED, PartnerAttributionStatus.ACTIVE),
    (error) => error instanceof BusinessNetworkError && error.code === "INVALID_PARTNER_ATTRIBUTION_TRANSITION",
  );
});

test("asset codes, destinations, source mapping, and dates are deterministic", () => {
  assert.equal(normalizePartnerAssetCode(" abc_01 "), "ABC_01");
  assert.equal(formatPartnerLeadNumber(42n), "LEAD-00000042");
  assert.equal(sourceForPartnerAsset(PartnerAssetType.PROMO_CODE), PartnerAttributionSource.PROMO_CODE);
  assert.equal(isSafePartnerDestinationPath("/laptops?campaign=summer"), true);
  assert.equal(isSafePartnerDestinationPath("//evil.example"), false);
  assert.equal(isSafePartnerDestinationPath("https://evil.example"), false);
  assert.throws(
    () => assertPartnerAssetDates(new Date("2026-09-02"), new Date("2026-09-01")),
    (error) => error instanceof BusinessNetworkError && error.code === "INVALID_PARTNER_ASSET_DATES",
  );
});

test("asset availability and attribution expiry respect exact timestamps", () => {
  const now = new Date("2026-08-27T00:00:00.000Z");
  assert.equal(isPartnerAssetUsable({ status: PartnerAssetStatus.ACTIVE, startsAt: null, endsAt: null }, now), true);
  assert.equal(isPartnerAssetUsable({ status: PartnerAssetStatus.DISABLED, startsAt: null, endsAt: null }, now), false);
  assert.equal(isPartnerAssetUsable({ status: PartnerAssetStatus.ACTIVE, startsAt: null, endsAt: now }, now), false);
  assert.equal(attributionExpiry(now, 30).toISOString(), "2026-09-26T00:00:00.000Z");
});

test("M9 request schemas normalize safe input and reject spoofable or incomplete data", () => {
  const asset = createPartnerAssetSchema.parse({ type: "REFERRAL_LINK", code: "demo-ref", destinationPath: "/laptops" });
  assert.equal(asset.code, "DEMO-REF");
  const capture = capturePartnerAttributionSchema.parse({ code: "demo-ref", visitorId: "visitor-12345", landingPath: "/laptops" });
  assert.equal(capture.code, "DEMO-REF");
  assert.throws(() => capturePartnerAttributionSchema.parse({ code: "demo-ref", visitorId: "short", partnerProfileId: "spoof" }));
  assert.throws(() => createPartnerLeadSchema.parse({ companyName: "ACME", contactName: "Buyer", currency: "BDT" }));
  const lead = createPartnerLeadSchema.parse({
    companyName: "ACME Ltd",
    contactName: "Buyer One",
    contactEmail: "BUYER@EXAMPLE.COM",
    estimatedValue: "100000.00",
    currency: "bdt",
  });
  assert.equal(lead.contactEmail, "buyer@example.com");
  assert.equal(lead.currency, "BDT");
});

