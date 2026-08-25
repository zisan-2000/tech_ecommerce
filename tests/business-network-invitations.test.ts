import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { sanitizeBusinessAuditValue } from "../lib/business-network/audit-sanitization";
import {
  getInvitationAcceptanceDecision,
  getInvitationState,
} from "../lib/business-network/invitation-state";

const future = new Date("2030-01-01T00:00:00.000Z");
const past = new Date("2020-01-01T00:00:00.000Z");
const now = new Date("2025-01-01T00:00:00.000Z");

function invitation(overrides: Partial<{
  email: string;
  role: string;
  expiresAt: Date;
  revokedAt: Date | null;
  acceptedAt: Date | null;
}> = {}) {
  return {
    email: "buyer@example.com",
    role: "BUYER",
    expiresAt: future,
    revokedAt: null,
    acceptedAt: null,
    ...overrides,
  };
}

test("wrong authenticated email cannot accept an invitation", () => {
  assert.deepEqual(
    getInvitationAcceptanceDecision({
      invitation: invitation(),
      authenticatedEmail: "other@example.com",
      member: null,
      now,
    }),
    { kind: "REJECT", code: "INVITATION_EMAIL_MISMATCH" },
  );
});

test("expired and revoked invitations cannot be accepted", () => {
  assert.equal(getInvitationState(invitation({ expiresAt: past }), now), "EXPIRED");
  assert.equal(getInvitationState(invitation({ revokedAt: now }), now), "REVOKED");
  for (const candidate of [
    invitation({ expiresAt: past }),
    invitation({ revokedAt: now }),
  ]) {
    assert.equal(
      getInvitationAcceptanceDecision({
        invitation: candidate,
        authenticatedEmail: candidate.email,
        member: null,
        now,
      }).kind,
      "REJECT",
    );
  }
});

test("acceptance plans membership creation and repeated valid acceptance is idempotent", () => {
  assert.deepEqual(
    getInvitationAcceptanceDecision({
      invitation: invitation(),
      authenticatedEmail: " BUYER@example.com ",
      member: null,
      now,
    }),
    { kind: "ACCEPT_CREATE_MEMBER" },
  );
  assert.deepEqual(
    getInvitationAcceptanceDecision({
      invitation: invitation({ acceptedAt: now }),
      authenticatedEmail: "buyer@example.com",
      member: { status: "ACTIVE", roles: ["BUYER"] },
      now,
    }),
    { kind: "IDEMPOTENT" },
  );
});

test("suspended or removed members require administrator review", () => {
  for (const status of ["SUSPENDED", "REMOVED"] as const) {
    assert.deepEqual(
      getInvitationAcceptanceDecision({
        invitation: invitation(),
        authenticatedEmail: "buyer@example.com",
        member: { status, roles: [] },
        now,
      }),
      { kind: "REJECT", code: "MEMBERSHIP_ADMIN_REVIEW_REQUIRED" },
    );
  }
});

test("audit sanitization recursively removes raw tokens and secrets", () => {
  const sanitized = sanitizeBusinessAuditValue({
    email: "buyer@example.com",
    token: "raw-secret-token",
    nested: { tokenHash: "also-sensitive", role: "BUYER" },
  });
  assert.deepEqual(sanitized, {
    email: "buyer@example.com",
    nested: { role: "BUYER" },
  });
  assert.doesNotMatch(JSON.stringify(sanitized), /raw-secret-token|also-sensitive/);
});

test("acceptance implementation performs membership, role, invitation and audit writes in one serializable transaction", async () => {
  const source = await readFile(
    new URL("../lib/business-network/invitations.ts", import.meta.url),
    "utf8",
  );
  const acceptance = source.slice(source.indexOf("export async function acceptOrganizationInvitation"));
  assert.match(acceptance, /runSerializableTransaction\(async \(tx\) =>/);
  assert.match(acceptance, /tx\.organizationMember\.(?:create|update)/);
  assert.match(acceptance, /tx\.organizationMemberRoleGrant\.createMany/);
  assert.match(acceptance, /tx\.organizationInvitation\.updateMany/);
  assert.match(acceptance, /writeBusinessAudit/);
});
