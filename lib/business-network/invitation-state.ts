export type InvitationStateInput = {
  expiresAt: Date;
  revokedAt: Date | null;
  acceptedAt: Date | null;
};

export type InvitationState = "PENDING" | "EXPIRED" | "REVOKED" | "ACCEPTED";

export function getInvitationState(
  invitation: InvitationStateInput,
  now = new Date(),
): InvitationState {
  if (invitation.revokedAt) return "REVOKED";
  if (invitation.acceptedAt) return "ACCEPTED";
  if (invitation.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return "PENDING";
}

export function normalizeInvitationEmail(email: string): string {
  return email.trim().toLowerCase();
}

type AcceptanceMember = {
  status: "ACTIVE" | "INVITED" | "SUSPENDED" | "REMOVED";
  roles: readonly string[];
} | null;

export type InvitationAcceptanceDecision =
  | { kind: "ACCEPT_CREATE_MEMBER" }
  | { kind: "ACCEPT_EXISTING_MEMBER" }
  | { kind: "ACCEPT_ACTIVATE_INVITED_MEMBER" }
  | { kind: "IDEMPOTENT" }
  | {
      kind: "REJECT";
      code:
        | "INVITATION_EMAIL_MISMATCH"
        | "INVITATION_EXPIRED"
        | "INVITATION_REVOKED"
        | "INVITATION_ALREADY_ACCEPTED"
        | "MEMBERSHIP_ADMIN_REVIEW_REQUIRED";
    };

export function getInvitationAcceptanceDecision(input: {
  invitation: InvitationStateInput & { email: string; role: string };
  authenticatedEmail: string;
  member: AcceptanceMember;
  now?: Date;
}): InvitationAcceptanceDecision {
  if (
    normalizeInvitationEmail(input.invitation.email) !==
    normalizeInvitationEmail(input.authenticatedEmail)
  ) {
    return { kind: "REJECT", code: "INVITATION_EMAIL_MISMATCH" };
  }
  const state = getInvitationState(input.invitation, input.now);
  if (state === "ACCEPTED") {
    if (
      input.member?.status === "ACTIVE" &&
      input.member.roles.includes(input.invitation.role)
    ) {
      return { kind: "IDEMPOTENT" };
    }
    return { kind: "REJECT", code: "INVITATION_ALREADY_ACCEPTED" };
  }
  if (state === "EXPIRED") return { kind: "REJECT", code: "INVITATION_EXPIRED" };
  if (state === "REVOKED") return { kind: "REJECT", code: "INVITATION_REVOKED" };
  if (input.member?.status === "SUSPENDED" || input.member?.status === "REMOVED") {
    return { kind: "REJECT", code: "MEMBERSHIP_ADMIN_REVIEW_REQUIRED" };
  }
  if (!input.member) return { kind: "ACCEPT_CREATE_MEMBER" };
  if (input.member.status === "INVITED") {
    return { kind: "ACCEPT_ACTIVATE_INVITED_MEMBER" };
  }
  return { kind: "ACCEPT_EXISTING_MEMBER" };
}
