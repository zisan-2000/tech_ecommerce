import "server-only";

import type {
  Prisma,
  OrganizationMemberStatus,
  OrganizationPortalRole,
} from "@/generated/prisma";
import { db } from "@/lib/db";
import { BUSINESS_AUDIT_ACTIONS, writeBusinessAudit } from "./audit";
import { BusinessNetworkError } from "./errors";
import {
  assertMemberStatusChangeAllowed,
  assertRoleReplacementAllowed,
} from "./membership-policy";
import { runSerializableTransaction } from "./transaction";
import type { ActiveBusinessContext } from "./types";

export async function listOrganizationMembers(context: ActiveBusinessContext) {
  return db.organizationMember.findMany({
    where: { organizationId: context.activeMembership.organization.id },
    orderBy: [{ status: "asc" }, { joinedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      status: true,
      title: true,
      department: true,
      phone: true,
      isPrimary: true,
      joinedAt: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, name: true, email: true, image: true } },
      roles: {
        orderBy: { role: "asc" },
        select: { role: true, grantedAt: true },
      },
    },
  });
}

async function countActiveOwners(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<number> {
  return tx.organizationMember.count({
    where: {
      organizationId,
      status: "ACTIVE",
      roles: { some: { role: "OWNER" } },
    },
  });
}

export async function replaceOrganizationMemberRoles(input: {
  context: ActiveBusinessContext;
  memberId: string;
  roles: OrganizationPortalRole[];
  request: Request;
}) {
  const organizationId = input.context.activeMembership.organization.id;
  return runSerializableTransaction(async (tx) => {
    const member = await tx.organizationMember.findFirst({
      where: { id: input.memberId, organizationId },
      select: {
        id: true,
        status: true,
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
    const currentRoles = member.roles.map((grant) => grant.role);
    const activeOwnerCount = await countActiveOwners(tx, organizationId);
    assertRoleReplacementAllowed({
      actorRoles: input.context.activeMembership.roles,
      currentRoles,
      nextRoles: input.roles,
      targetIsActive: member.status === "ACTIVE",
      activeOwnerCount,
    });

    await tx.organizationMemberRoleGrant.deleteMany({
      where: { memberId: member.id },
    });
    await tx.organizationMemberRoleGrant.createMany({
      data: input.roles.map((role) => ({
        memberId: member.id,
        role,
        grantedBy: input.context.user.id,
      })),
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId,
      memberId: member.id,
      actorUserId: input.context.user.id,
      action: BUSINESS_AUDIT_ACTIONS.memberRolesUpdated,
      entityType: "OrganizationMember",
      entityId: member.id,
      before: { roles: currentRoles },
      after: { roles: input.roles },
    });
    return {
      id: member.id,
      status: member.status,
      roles: [...input.roles].sort(),
    };
  });
}

export async function updateOrganizationMemberStatus(input: {
  context: ActiveBusinessContext;
  memberId: string;
  status: OrganizationMemberStatus;
  request: Request;
}) {
  const organizationId = input.context.activeMembership.organization.id;
  return runSerializableTransaction(async (tx) => {
    const member = await tx.organizationMember.findFirst({
      where: { id: input.memberId, organizationId },
      select: {
        id: true,
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
    const targetRoles = member.roles.map((grant) => grant.role);
    const activeOwnerCount = await countActiveOwners(tx, organizationId);
    assertMemberStatusChangeAllowed({
      actorRoles: input.context.activeMembership.roles,
      targetRoles,
      currentStatus: member.status,
      nextStatus: input.status,
      activeOwnerCount,
    });

    if (member.status === input.status) {
      return { id: member.id, status: member.status, roles: targetRoles };
    }
    const updated = await tx.organizationMember.update({
      where: { id: member.id },
      data: {
        status: input.status,
        ...(input.status === "ACTIVE" ? {} : { isPrimary: false }),
      },
      select: { id: true, status: true },
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId,
      memberId: member.id,
      actorUserId: input.context.user.id,
      action: BUSINESS_AUDIT_ACTIONS.memberStatusUpdated,
      entityType: "OrganizationMember",
      entityId: member.id,
      before: { status: member.status, isPrimary: member.isPrimary },
      after: {
        status: updated.status,
        isPrimary: input.status === "ACTIVE" ? member.isPrimary : false,
      },
    });
    return { id: updated.id, status: updated.status, roles: targetRoles };
  });
}
