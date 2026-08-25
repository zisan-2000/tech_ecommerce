import "server-only";

import type { OrganizationPortalRole } from "@/generated/prisma";
import { db } from "@/lib/db";
import { BUSINESS_AUDIT_ACTIONS, writeBusinessAudit } from "./audit";
import type { ActiveBusinessContext } from "./types";
import { BusinessNetworkError } from "./errors";
import {
  assertInvitationDeliveryReady,
  deliverOrganizationInvitation,
} from "./invitation-delivery";
import {
  getInvitationAcceptanceDecision,
  getInvitationState,
  normalizeInvitationEmail,
} from "./invitation-state";
import { createInvitationToken, hashInvitationToken } from "./invitation-tokens";
import { assertInvitationRoleAllowed } from "./membership-policy";
import { runSerializableTransaction } from "./transaction";
import { isPortalAccessibleOrganizationStatus } from "./context";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function safeInvitation<T extends {
  id: string;
  email: string;
  role: OrganizationPortalRole;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}>(invitation: T) {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
    revokedAt: invitation.revokedAt,
    createdAt: invitation.createdAt,
    state: getInvitationState(invitation),
  };
}

function maskInvitationEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

export async function listOrganizationInvitations(
  context: ActiveBusinessContext,
) {
  const invitations = await db.organizationInvitation.findMany({
    where: { organizationId: context.activeMembership.organization.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  return invitations.map(safeInvitation);
}

export async function createOrganizationInvitation(input: {
  context: ActiveBusinessContext;
  email: string;
  role: OrganizationPortalRole;
  request: Request;
}) {
  assertInvitationRoleAllowed(input.context.activeMembership.roles, input.role);
  assertInvitationDeliveryReady();
  const email = normalizeInvitationEmail(input.email);
  const token = createInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const organizationId = input.context.activeMembership.organization.id;

  const invitation = await runSerializableTransaction(async (tx) => {
    const [activeMember, pendingInvitation] = await Promise.all([
      tx.organizationMember.findFirst({
        where: {
          organizationId,
          status: "ACTIVE",
          user: { email: { equals: email, mode: "insensitive" } },
        },
        select: { id: true },
      }),
      tx.organizationInvitation.findFirst({
        where: {
          organizationId,
          email: { equals: email, mode: "insensitive" },
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      }),
    ]);
    if (activeMember) {
      throw new BusinessNetworkError(
        409,
        "MEMBER_ALREADY_ACTIVE",
        "This user is already an active organization member.",
      );
    }
    if (pendingInvitation) {
      throw new BusinessNetworkError(
        409,
        "INVITATION_ALREADY_PENDING",
        "A valid invitation is already pending for this email address.",
      );
    }

    const created = await tx.organizationInvitation.create({
      data: { organizationId, email, role: input.role, tokenHash, expiresAt },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId,
      memberId: input.context.activeMembership.memberId,
      actorUserId: input.context.user.id,
      action: BUSINESS_AUDIT_ACTIONS.invitationCreated,
      entityType: "OrganizationInvitation",
      entityId: created.id,
      after: {
        email: created.email,
        role: created.role,
        expiresAt: created.expiresAt,
        state: "PENDING",
      },
    });
    return created;
  });

  try {
    const delivery = await deliverOrganizationInvitation({
      email,
      organizationName:
        input.context.activeMembership.organization.displayName ||
        input.context.activeMembership.organization.legalName,
      role: input.role,
      token,
    });
    return { invitation: safeInvitation(invitation), delivery };
  } catch (error) {
    await runSerializableTransaction(async (tx) => {
      const revokedAt = new Date();
      const changed = await tx.organizationInvitation.updateMany({
        where: {
          id: invitation.id,
          organizationId,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt },
      });
      if (changed.count > 0) {
        await writeBusinessAudit({
          tx,
          request: input.request,
          organizationId,
          memberId: input.context.activeMembership.memberId,
          actorUserId: input.context.user.id,
          action: BUSINESS_AUDIT_ACTIONS.invitationRevoked,
          entityType: "OrganizationInvitation",
          entityId: invitation.id,
          before: { state: "PENDING" },
          after: { state: "REVOKED", reason: "DELIVERY_FAILED" },
        });
      }
    });
    throw error;
  }
}

export async function revokeOrganizationInvitation(input: {
  context: ActiveBusinessContext;
  invitationId: string;
  request: Request;
}) {
  const organizationId = input.context.activeMembership.organization.id;
  return runSerializableTransaction(async (tx) => {
    const invitation = await tx.organizationInvitation.findFirst({
      where: { id: input.invitationId, organizationId },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
    if (!invitation) {
      throw new BusinessNetworkError(
        404,
        "INVITATION_NOT_FOUND",
        "Organization invitation not found.",
      );
    }
    if (invitation.acceptedAt) {
      throw new BusinessNetworkError(
        409,
        "INVITATION_ALREADY_ACCEPTED",
        "An accepted invitation cannot be revoked.",
      );
    }
    if (invitation.revokedAt) return safeInvitation(invitation);

    const revokedAt = new Date();
    const updated = await tx.organizationInvitation.update({
      where: { id: invitation.id },
      data: { revokedAt },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId,
      memberId: input.context.activeMembership.memberId,
      actorUserId: input.context.user.id,
      action: BUSINESS_AUDIT_ACTIONS.invitationRevoked,
      entityType: "OrganizationInvitation",
      entityId: invitation.id,
      before: { state: getInvitationState(invitation) },
      after: { state: "REVOKED" },
    });
    return safeInvitation(updated);
  });
}

export async function readOrganizationInvitation(token: string) {
  const invitation = await db.organizationInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      createdAt: true,
      organization: {
        select: { legalName: true, displayName: true, status: true },
      },
    },
  });
  if (!invitation) {
    throw new BusinessNetworkError(404, "INVITATION_NOT_FOUND", "Invitation not found.");
  }
  const state = getInvitationState(invitation);
  if (state !== "PENDING") {
    throw new BusinessNetworkError(
      409,
      `INVITATION_${state}`,
      `This invitation is ${state.toLowerCase()} and cannot be used.`,
    );
  }
  if (!isPortalAccessibleOrganizationStatus(invitation.organization.status)) {
    throw new BusinessNetworkError(
      409,
      "ORGANIZATION_UNAVAILABLE",
      "The inviting organization is not currently available.",
    );
  }
  return {
    invitation: {
      ...safeInvitation(invitation),
      email: maskInvitationEmail(invitation.email),
    },
    organization: {
      legalName: invitation.organization.legalName,
      displayName: invitation.organization.displayName,
    },
  };
}

export async function acceptOrganizationInvitation(input: {
  token: string;
  user: { id: string; email: string | null };
  request: Request;
}) {
  if (!input.user.email) {
    throw new BusinessNetworkError(
      403,
      "VERIFIED_EMAIL_REQUIRED",
      "An authenticated email address is required to accept this invitation.",
    );
  }
  const authenticatedEmail = input.user.email;
  const tokenHash = hashInvitationToken(input.token);

  return runSerializableTransaction(async (tx) => {
    const invitation = await tx.organizationInvitation.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        organizationId: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        organization: { select: { status: true } },
      },
    });
    if (!invitation) {
      throw new BusinessNetworkError(404, "INVITATION_NOT_FOUND", "Invitation not found.");
    }
    if (!isPortalAccessibleOrganizationStatus(invitation.organization.status)) {
      throw new BusinessNetworkError(
        409,
        "ORGANIZATION_UNAVAILABLE",
        "The inviting organization is not currently available.",
      );
    }

    const existingMember = await tx.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: invitation.organizationId,
          userId: input.user.id,
        },
      },
      select: {
        id: true,
        status: true,
        isPrimary: true,
        roles: { select: { role: true } },
      },
    });

    const decision = getInvitationAcceptanceDecision({
      invitation,
      authenticatedEmail,
      member: existingMember
        ? {
            status: existingMember.status,
            roles: existingMember.roles.map((grant) => grant.role),
          }
        : null,
    });
    if (decision.kind === "REJECT") {
      const status = decision.code === "INVITATION_EMAIL_MISMATCH" ? 403 : 409;
      const messages: Record<typeof decision.code, string> = {
        INVITATION_EMAIL_MISMATCH:
          "This invitation belongs to a different email address.",
        INVITATION_EXPIRED: "This invitation has expired.",
        INVITATION_REVOKED: "This invitation has been revoked.",
        INVITATION_ALREADY_ACCEPTED: "This invitation has already been accepted.",
        MEMBERSHIP_ADMIN_REVIEW_REQUIRED:
          "This membership requires organization administrator review.",
      };
      throw new BusinessNetworkError(status, decision.code, messages[decision.code]);
    }
    if (decision.kind === "IDEMPOTENT" && existingMember) {
      return {
        accepted: true,
        idempotent: true,
        organizationId: invitation.organizationId,
        memberId: existingMember.id,
        role: invitation.role,
      };
    }

    let member = existingMember;
    if (decision.kind === "ACCEPT_CREATE_MEMBER") {
      const activeMembershipCount = await tx.organizationMember.count({
        where: { userId: input.user.id, status: "ACTIVE" },
      });
      member = await tx.organizationMember.create({
        data: {
          organizationId: invitation.organizationId,
          userId: input.user.id,
          status: "ACTIVE",
          isPrimary: activeMembershipCount === 0,
        },
        select: { id: true, status: true, isPrimary: true, roles: { select: { role: true } } },
      });
    } else if (decision.kind === "ACCEPT_ACTIVATE_INVITED_MEMBER" && member) {
      member = await tx.organizationMember.update({
        where: { id: member.id },
        data: { status: "ACTIVE", joinedAt: new Date() },
        select: { id: true, status: true, isPrimary: true, roles: { select: { role: true } } },
      });
    }

    if (!member) {
      throw new BusinessNetworkError(
        409,
        "MEMBERSHIP_STATE_CHANGED",
        "The membership state changed. Please refresh and try again.",
      );
    }
    await tx.organizationMemberRoleGrant.createMany({
      data: [{ memberId: member.id, role: invitation.role, grantedBy: input.user.id }],
      skipDuplicates: true,
    });
    const acceptedAt = new Date();
    const accepted = await tx.organizationInvitation.updateMany({
      where: {
        id: invitation.id,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: acceptedAt },
      },
      data: { acceptedAt },
    });
    if (accepted.count !== 1) {
      throw new BusinessNetworkError(
        409,
        "INVITATION_STATE_CHANGED",
        "The invitation state changed. Please refresh and try again.",
      );
    }
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: invitation.organizationId,
      memberId: member.id,
      actorUserId: input.user.id,
      action: BUSINESS_AUDIT_ACTIONS.invitationAccepted,
      entityType: "OrganizationInvitation",
      entityId: invitation.id,
      before: { state: "PENDING" },
      after: { state: "ACCEPTED", memberId: member.id, role: invitation.role },
    });
    return {
      accepted: true,
      idempotent: false,
      organizationId: invitation.organizationId,
      memberId: member.id,
      role: invitation.role,
    };
  });
}
