import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { OrganizationCapabilityType, OrganizationCompanyType } from "@/generated/prisma";
import type { Prisma } from "@/generated/prisma";
import { requireAuthenticatedBusinessUser } from "@/lib/business-network/context";
import { BUSINESS_AUDIT_ACTIONS, writeBusinessAudit } from "@/lib/business-network/audit";
import { BusinessNetworkError } from "@/lib/business-network/business-error";
import { runSerializableTransaction } from "@/lib/business-network/transaction";

export const businessApplicationSchema = z.object({
  legalName: z.string().trim().min(2).max(240),
  displayName: z.string().trim().min(2).max(160).nullable().optional(),
  companyType: z.enum(OrganizationCompanyType),
  email: z.email().trim().toLowerCase().max(254),
  phone: z.string().trim().min(7).max(32),
  website: z.url().max(500).nullable().optional(),
  tradeLicenseNo: z.string().trim().max(120).nullable().optional(),
  tin: z.string().trim().max(120).nullable().optional(),
  bin: z.string().trim().max(120).nullable().optional(),
  capabilities: z.array(z.enum(OrganizationCapabilityType)).min(1).max(6).refine((values) => new Set(values).size === values.length, "Duplicate capabilities are not allowed."),
}).strict();

export async function createBusinessApplication(input: { data: z.infer<typeof businessApplicationSchema>; request: Request }) {
  const user = await requireAuthenticatedBusinessUser();
  return runSerializableTransaction(async (tx) => {
    const membershipCount = await tx.organizationMember.count({ where: { userId: user.id, status: { not: "REMOVED" } } });
    if (membershipCount >= 20) throw new BusinessNetworkError(409, "ORGANIZATION_LIMIT_REACHED", "The organization membership limit has been reached.");
    const code = `ORG-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
    const organization = await tx.organization.create({
      data: {
        code,
        legalName: input.data.legalName,
        displayName: input.data.displayName || null,
        companyType: input.data.companyType,
        status: "PENDING_VERIFICATION",
        email: input.data.email,
        phone: input.data.phone,
        website: input.data.website || null,
        tradeLicenseNo: input.data.tradeLicenseNo || null,
        tin: input.data.tin || null,
        bin: input.data.bin || null,
        capabilities: { create: input.data.capabilities.map((type) => ({ type, status: "PENDING" })) },
        members: { create: { userId: user.id, status: "ACTIVE", isPrimary: membershipCount === 0, roles: { create: { role: "OWNER", grantedBy: user.id } } } },
      },
      include: { members: { select: { id: true }, take: 1 }, capabilities: { select: { type: true, status: true } } },
    });
    await writeBusinessAudit({ tx: tx as Prisma.TransactionClient, request: input.request, organizationId: organization.id, memberId: organization.members[0]?.id, actorUserId: user.id, action: BUSINESS_AUDIT_ACTIONS.organizationApplicationCreated, entityType: "Organization", entityId: organization.id, after: organization });
    return { id: organization.id, code: organization.code, status: organization.status };
  });
}

