import "server-only";

import type { OrganizationCapabilityType } from "@/generated/prisma";
import { db } from "@/lib/db";
import { BusinessNetworkError } from "./errors";
import { requireBusinessContext } from "./context";
import type { ActiveBusinessContext } from "./types";
import type { OrganizationPermission } from "./permissions";

export async function requireBusinessPermission(
  permission: OrganizationPermission,
  suppliedContext?: ActiveBusinessContext,
): Promise<ActiveBusinessContext> {
  const context = suppliedContext ?? (await requireBusinessContext());
  if (!context.activeMembership.permissions.includes(permission)) {
    throw new BusinessNetworkError(
      403,
      "ORGANIZATION_PERMISSION_DENIED",
      "You do not have permission to perform this organization action.",
    );
  }
  return context;
}

export async function requireOrganizationCapability(
  capability: OrganizationCapabilityType,
  suppliedContext?: ActiveBusinessContext,
): Promise<ActiveBusinessContext> {
  const context = suppliedContext ?? (await requireBusinessContext());
  if (context.activeMembership.organization.status !== "ACTIVE") {
    throw new BusinessNetworkError(
      403,
      "ORGANIZATION_NOT_ACTIVE",
      "This operation requires an active organization.",
    );
  }
  if (!context.activeMembership.activeCapabilities.includes(capability)) {
    throw new BusinessNetworkError(
      403,
      "ORGANIZATION_CAPABILITY_REQUIRED",
      "The organization does not have the required active capability.",
    );
  }
  return context;
}

export async function requireAnyOrganizationCapability(
  capabilities: readonly OrganizationCapabilityType[],
  suppliedContext?: ActiveBusinessContext,
): Promise<ActiveBusinessContext> {
  const context = suppliedContext ?? (await requireBusinessContext());
  if (context.activeMembership.organization.status !== "ACTIVE") {
    throw new BusinessNetworkError(
      403,
      "ORGANIZATION_NOT_ACTIVE",
      "This operation requires an active organization.",
    );
  }
  if (
    !capabilities.some((capability) =>
      context.activeMembership.activeCapabilities.includes(capability),
    )
  ) {
    throw new BusinessNetworkError(
      403,
      "ORGANIZATION_CAPABILITY_REQUIRED",
      "The organization does not have a required active capability.",
    );
  }
  return context;
}

export async function assertMemberBelongsToActiveOrganization(
  memberId: string,
  suppliedContext?: ActiveBusinessContext,
) {
  const context = suppliedContext ?? (await requireBusinessContext());
  const member = await db.organizationMember.findFirst({
    where: {
      id: memberId,
      organizationId: context.activeMembership.organization.id,
    },
    select: {
      id: true,
      userId: true,
      status: true,
      isPrimary: true,
      roles: { orderBy: { role: "asc" }, select: { role: true } },
    },
  });
  if (!member) {
    throw new BusinessNetworkError(
      404,
      "ORGANIZATION_MEMBER_NOT_FOUND",
      "Organization member not found.",
    );
  }
  return member;
}
