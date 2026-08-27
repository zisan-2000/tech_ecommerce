import assert from "node:assert/strict";
import test from "node:test";
import {
  PartnerAgreementStatus,
  PartnerAgreementVersionStatus,
  PartnerStatus,
} from "../generated/prisma";
import { BusinessNetworkError } from "../lib/business-network/business-error";
import {
  assertPartnerAgreementDates,
  assertPartnerAgreementTransition,
  assertPartnerAgreementVersionTransition,
  assertPartnerStatusTransition,
  formatPartnerAgreementNumber,
  formatPartnerCode,
} from "../lib/business-network/partner-core";
import { createPartnerAgreementSchema } from "../lib/business-network/partner-schemas";

test("partner profile follows applied-review-active and suspension lifecycle", () => {
  assert.doesNotThrow(() => assertPartnerStatusTransition(PartnerStatus.APPLIED, PartnerStatus.UNDER_REVIEW));
  assert.doesNotThrow(() => assertPartnerStatusTransition(PartnerStatus.UNDER_REVIEW, PartnerStatus.ACTIVE));
  assert.doesNotThrow(() => assertPartnerStatusTransition(PartnerStatus.ACTIVE, PartnerStatus.SUSPENDED));
  assert.doesNotThrow(() => assertPartnerStatusTransition(PartnerStatus.SUSPENDED, PartnerStatus.ACTIVE));
});

test("partner rejection/revocation terminals fail closed", () => {
  assert.doesNotThrow(() => assertPartnerStatusTransition(PartnerStatus.UNDER_REVIEW, PartnerStatus.REJECTED));
  assert.doesNotThrow(() => assertPartnerStatusTransition(PartnerStatus.ACTIVE, PartnerStatus.REVOKED));
  assert.throws(
    () => assertPartnerStatusTransition(PartnerStatus.REJECTED, PartnerStatus.ACTIVE),
    (error) => error instanceof BusinessNetworkError && error.code === "INVALID_PARTNER_STATUS_TRANSITION",
  );
});

test("agreement and version workflows match the frozen lifecycle", () => {
  assert.doesNotThrow(() => assertPartnerAgreementTransition(
    PartnerAgreementStatus.DRAFT,
    PartnerAgreementStatus.PENDING_APPROVAL,
  ));
  assert.doesNotThrow(() => assertPartnerAgreementTransition(
    PartnerAgreementStatus.PENDING_APPROVAL,
    PartnerAgreementStatus.ACTIVE,
  ));
  assert.doesNotThrow(() => assertPartnerAgreementVersionTransition(
    PartnerAgreementVersionStatus.DRAFT,
    PartnerAgreementVersionStatus.PENDING_APPROVAL,
  ));
  assert.doesNotThrow(() => assertPartnerAgreementVersionTransition(
    PartnerAgreementVersionStatus.ACTIVE,
    PartnerAgreementVersionStatus.SUPERSEDED,
  ));
});

test("agreement dates, identifiers, and request schema are deterministic", () => {
  assert.equal(formatPartnerCode(12n), "PAR-00000012");
  assert.equal(formatPartnerAgreementNumber(34n), "AGR-00000034");
  assert.throws(
    () => assertPartnerAgreementDates(
      new Date("2026-08-27T00:00:00.000Z"),
      new Date("2026-08-26T00:00:00.000Z"),
    ),
    (error) => error instanceof BusinessNetworkError && error.code === "PARTNER_AGREEMENT_DATES_INVALID",
  );
  const parsed = createPartnerAgreementSchema.parse({
    partnerProfileId: "partner-1",
    startsAt: "2026-09-01T00:00:00.000Z",
    endsAt: "2027-08-31T00:00:00.000Z",
    version: {
      currency: "bdt",
      minimumSettlement: "5000.00",
      attributionWindowDays: 45,
      commercialTerms: { noticeDays: 30 },
    },
  });
  assert.equal(parsed.version.currency, "BDT");
  assert.equal(parsed.version.attributionWindowDays, 45);
});
