import "server-only";

import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import type { OrganizationStatus } from "@/generated/prisma";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { deriveEffectivePermissions } from "./permissions";
import { selectActiveMembership } from "./context-selection";
import { BusinessNetworkError } from "./errors";
import type {
  ActiveBusinessContext,
  BusinessContext,
  BusinessMembershipContext,
} from "./types";

export const BUSINESS_ACTIVE_ORGANIZATION_COOKIE = "business_active_org";
export const BUSINESS_ACTIVE_ORGANIZATION_MAX_AGE = 60 * 60 * 24 * 30;

const PORTAL_ACCESSIBLE_STATUSES: readonly OrganizationStatus[] = [
  "DRAFT",
  "PENDING_VERIFICATION",
  "ACTIVE",
];

export function isPortalAccessibleOrganizationStatus(
  status: OrganizationStatus,
): boolean {
  return PORTAL_ACCESSIBLE_STATUSES.includes(status);
}

/**
 * Lightweight, deterministic landing-route check for an already-authenticated
 * user. This intentionally does not depend on the active-organization cookie
 * or perform another session lookup, so post-login routing cannot fluctuate
 * because of client/session timing.
 */
export async function hasPortalAccessibleBusinessMembership(
  userId: string,
): Promise<boolean> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return false;

  const membership = await db.organizationMember.findFirst({
    where: {
      userId: normalizedUserId,
      status: "ACTIVE",
      organization: {
        status: { in: [...PORTAL_ACCESSIBLE_STATUSES] },
      },
    },
    select: { id: true },
  });

  return Boolean(membership);
}

export async function requireAuthenticatedBusinessUser() {
  const session = await getServerSession(authOptions);
  const id = typeof session?.user?.id === "string" ? session.user.id : null;
  if (!id) {
    throw new BusinessNetworkError(
      401,
      "UNAUTHENTICATED",
      "Authentication is required.",
    );
  }
  return {
    id,
    email:
      typeof session?.user?.email === "string"
        ? session.user.email.trim().toLowerCase()
        : null,
  };
}

export async function getBusinessContext(): Promise<BusinessContext> {
  const user = await requireAuthenticatedBusinessUser();
  const rows = await db.organizationMember.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      isPrimary: true,
      organization: {
        select: {
          id: true,
          code: true,
          legalName: true,
          displayName: true,
          status: true,
          country: true,
          currency: true,
          capabilities: {
            where: { status: "ACTIVE" },
            orderBy: { type: "asc" },
            select: { type: true },
          },
        },
      },
      roles: {
        orderBy: [{ grantedAt: "asc" }, { role: "asc" }],
        select: { role: true },
      },
    },
  });

  const organizations: BusinessMembershipContext[] = rows.map((row) => {
    const roles = row.roles.map((grant) => grant.role);
    const activeCapabilities = row.organization.capabilities.map(
      (capability) => capability.type,
    );
    return {
      memberId: row.id,
      isPrimary: row.isPrimary,
      organization: {
        id: row.organization.id,
        code: row.organization.code,
        legalName: row.organization.legalName,
        displayName: row.organization.displayName,
        status: row.organization.status,
        country: row.organization.country,
        currency: row.organization.currency,
      },
      roles,
      activeCapabilities,
      permissions: deriveEffectivePermissions(roles, activeCapabilities),
    };
  });

  const cookieStore = await cookies();
  const cookieValue = cookieStore
    .get(BUSINESS_ACTIVE_ORGANIZATION_COOKIE)
    ?.value.slice(0, 64);
  const activeMembership = selectActiveMembership(organizations, cookieValue);

  return { user, organizations, activeMembership };
}

export async function resolveActiveOrganization() {
  return (await getBusinessContext()).activeMembership;
}

export async function requireBusinessContext(): Promise<ActiveBusinessContext> {
  const context = await getBusinessContext();
  if (!context.activeMembership) {
    throw new BusinessNetworkError(
      403,
      "ORGANIZATION_MEMBERSHIP_REQUIRED",
      "An active organization membership is required.",
    );
  }
  if (
    !isPortalAccessibleOrganizationStatus(
      context.activeMembership.organization.status,
    )
  ) {
    throw new BusinessNetworkError(
      403,
      "ORGANIZATION_UNAVAILABLE",
      "This organization is not currently available in the business portal.",
    );
  }
  return context as ActiveBusinessContext;
}
