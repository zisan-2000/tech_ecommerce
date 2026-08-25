import type {
  OrganizationMemberStatus,
  OrganizationPortalRole,
} from "@/generated/prisma";
import { BusinessNetworkError } from "./business-error";

export function isOrganizationOwner(
  roles: readonly OrganizationPortalRole[],
): boolean {
  return roles.includes("OWNER");
}

export function assertInvitationRoleAllowed(
  actorRoles: readonly OrganizationPortalRole[],
  invitedRole: OrganizationPortalRole,
): void {
  if (invitedRole === "OWNER" && !isOrganizationOwner(actorRoles)) {
    throw new BusinessNetworkError(
      403,
      "OWNER_ROLE_REQUIRES_OWNER",
      "Only an organization owner may invite another owner.",
    );
  }
}

export function assertRoleReplacementAllowed(input: {
  actorRoles: readonly OrganizationPortalRole[];
  currentRoles: readonly OrganizationPortalRole[];
  nextRoles: readonly OrganizationPortalRole[];
  targetIsActive: boolean;
  activeOwnerCount: number;
}): void {
  const actorIsOwner = isOrganizationOwner(input.actorRoles);
  const currentlyOwner = isOrganizationOwner(input.currentRoles);
  const nextIsOwner = isOrganizationOwner(input.nextRoles);

  if (currentlyOwner !== nextIsOwner && !actorIsOwner) {
    throw new BusinessNetworkError(
      403,
      "OWNER_ROLE_REQUIRES_OWNER",
      "Only an organization owner may grant or remove the owner role.",
    );
  }

  if (
    input.targetIsActive &&
    currentlyOwner &&
    !nextIsOwner &&
    input.activeOwnerCount <= 1
  ) {
    throw new BusinessNetworkError(
      409,
      "FINAL_ACTIVE_OWNER",
      "The final active organization owner cannot be demoted.",
    );
  }
}

export function assertMemberStatusChangeAllowed(input: {
  actorRoles: readonly OrganizationPortalRole[];
  targetRoles: readonly OrganizationPortalRole[];
  currentStatus: OrganizationMemberStatus;
  nextStatus: OrganizationMemberStatus;
  activeOwnerCount: number;
}): void {
  if (input.currentStatus === input.nextStatus) return;
  const targetIsOwner = isOrganizationOwner(input.targetRoles);
  if (!targetIsOwner || input.nextStatus === "ACTIVE") return;

  if (!isOrganizationOwner(input.actorRoles)) {
    throw new BusinessNetworkError(
      403,
      "OWNER_STATUS_REQUIRES_OWNER",
      "Only an organization owner may suspend or remove another owner.",
    );
  }
  if (input.activeOwnerCount <= 1) {
    throw new BusinessNetworkError(
      409,
      "FINAL_ACTIVE_OWNER",
      "The final active organization owner cannot be suspended or removed.",
    );
  }
}
