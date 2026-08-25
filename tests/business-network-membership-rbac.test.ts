import assert from "node:assert/strict";
import test from "node:test";
import {
  ORGANIZATION_PERMISSION_REGISTRY,
  ORGANIZATION_ROLE_PERMISSIONS,
  deriveEffectivePermissions,
  deriveRolePermissions,
} from "../lib/business-network/permissions";
import { selectActiveMembership } from "../lib/business-network/context-selection";
import {
  assertMemberStatusChangeAllowed,
  assertRoleReplacementAllowed,
} from "../lib/business-network/membership-policy";
import { assertOrganizationScope } from "../lib/business-network/tenant-policy";
import { BusinessNetworkError } from "../lib/business-network/business-error";

test("OWNER maps to every portal permission while capability filtering remains effective", () => {
  assert.deepEqual(
    deriveRolePermissions(["OWNER"]),
    [...ORGANIZATION_PERMISSION_REGISTRY],
  );
  const effective = deriveEffectivePermissions(["OWNER"], []);
  assert.ok(effective.includes("organization.members.manage"));
  assert.ok(!effective.includes("rfq.create"));
  assert.ok(!effective.includes("partner.leads.create"));
});

test("VIEWER is read-only, BUYER cannot manage members, and PARTNER_MARKETER cannot manage payouts", () => {
  assert.ok(
    ORGANIZATION_ROLE_PERMISSIONS.VIEWER.every((permission) =>
      permission.endsWith(".read"),
    ),
  );
  assert.ok(!deriveRolePermissions(["BUYER"]).includes("organization.members.manage"));
  assert.ok(
    !deriveRolePermissions(["PARTNER_MARKETER"]).includes(
      "partner.payout_accounts.manage",
    ),
  );
});

test("untrusted active organization cookie is ignored unless it matches an ACTIVE membership", () => {
  const activeMemberships = [
    { organization: { id: "org-primary" }, isPrimary: true },
    { organization: { id: "org-secondary" }, isPrimary: false },
  ];
  assert.equal(
    selectActiveMembership(activeMemberships, "org-from-another-tenant")
      ?.organization.id,
    "org-primary",
  );
  assert.equal(
    selectActiveMembership(activeMemberships, "org-secondary")?.organization.id,
    "org-secondary",
  );
});

test("cross-organization resource scope is rejected with a safe not-found error", () => {
  assert.throws(
    () => assertOrganizationScope("org-a", "org-b"),
    (error) =>
      error instanceof BusinessNetworkError &&
      error.status === 404 &&
      error.code === "BUSINESS_RESOURCE_NOT_FOUND",
  );
});

test("only an owner can grant OWNER and the final active OWNER cannot be demoted", () => {
  assert.throws(
    () =>
      assertRoleReplacementAllowed({
        actorRoles: ["ADMIN"],
        currentRoles: ["ADMIN"],
        nextRoles: ["OWNER"],
        targetIsActive: true,
        activeOwnerCount: 1,
      }),
    (error) =>
      error instanceof BusinessNetworkError &&
      error.code === "OWNER_ROLE_REQUIRES_OWNER",
  );
  assert.throws(
    () =>
      assertRoleReplacementAllowed({
        actorRoles: ["OWNER"],
        currentRoles: ["OWNER"],
        nextRoles: ["ADMIN"],
        targetIsActive: true,
        activeOwnerCount: 1,
      }),
    (error) =>
      error instanceof BusinessNetworkError && error.code === "FINAL_ACTIVE_OWNER",
  );
});

test("final active OWNER cannot be suspended/removed and non-owner cannot change owner status", () => {
  for (const status of ["SUSPENDED", "REMOVED"] as const) {
    assert.throws(
      () =>
        assertMemberStatusChangeAllowed({
          actorRoles: ["OWNER"],
          targetRoles: ["OWNER"],
          currentStatus: "ACTIVE",
          nextStatus: status,
          activeOwnerCount: 1,
        }),
      (error) =>
        error instanceof BusinessNetworkError && error.code === "FINAL_ACTIVE_OWNER",
    );
  }
  assert.throws(
    () =>
      assertMemberStatusChangeAllowed({
        actorRoles: ["ADMIN"],
        targetRoles: ["OWNER"],
        currentStatus: "ACTIVE",
        nextStatus: "SUSPENDED",
        activeOwnerCount: 2,
      }),
    (error) =>
      error instanceof BusinessNetworkError &&
      error.code === "OWNER_STATUS_REQUIRES_OWNER",
  );
});
