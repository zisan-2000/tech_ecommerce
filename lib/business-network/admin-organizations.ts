import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma";
import {
  OrganizationCapabilityStatus,
  OrganizationDocumentStatus,
  OrganizationStatus,
} from "@/generated/prisma";
import { db } from "@/lib/db";
import { BUSINESS_AUDIT_ACTIONS, writeBusinessAudit } from "./audit";
import { BusinessNetworkError } from "./business-error";
import { assertOrganizationIdentifiersAvailable } from "./organization-identifiers";
import {
  getOrganizationVerificationMetadata,
  ORGANIZATION_STATUS_TRANSITIONS,
  type OrganizationTransition,
} from "./organization-lifecycle";
import { runSerializableTransaction } from "./transaction";
import type { z } from "zod";
import type {
  adminOrganizationListSchema,
  createAdminOrganizationSchema,
  createOrganizationCapabilitySchema,
  updateAdminOrganizationSchema,
  updateOrganizationCapabilitySchema,
} from "./admin-organization-schemas";

type ActorInput = { actorUserId: string; request?: Request | null };

const organizationInclude = {
  capabilities: { orderBy: { type: "asc" as const } },
  members: {
    orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }],
    include: {
      roles: { orderBy: { role: "asc" as const } },
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  },
  documents: { orderBy: { createdAt: "desc" as const } },
  addresses: { orderBy: [{ isDefault: "desc" as const }, { createdAt: "asc" as const }] },
  branches: { orderBy: [{ isActive: "desc" as const }, { name: "asc" as const }] },
  businessAccount: { select: { id: true, accountNumber: true, status: true } },
  partnerProfile: { select: { id: true, partnerCode: true, status: true } },
  _count: { select: { salesRfqs: true, salesQuotations: true, customerPurchaseOrders: true, orders: true } },
} satisfies Prisma.OrganizationInclude;

function newOrganizationCode() {
  return `ORG-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
}

export async function listAdminOrganizations(input: z.infer<typeof adminOrganizationListSchema>) {
  const where: Prisma.OrganizationWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.search
      ? {
          OR: [
            { code: { contains: input.search, mode: "insensitive" } },
            { legalName: { contains: input.search, mode: "insensitive" } },
            { displayName: { contains: input.search, mode: "insensitive" } },
            { email: { contains: input.search, mode: "insensitive" } },
            { phone: { contains: input.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.organization.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      include: {
        capabilities: { select: { type: true, status: true } },
        businessAccount: { select: { id: true, accountNumber: true, status: true } },
        partnerProfile: { select: { id: true, partnerCode: true, status: true } },
        _count: { select: { members: true, documents: true, orders: true } },
      },
    }),
    db.organization.count({ where }),
  ]);
  return { items, pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) } };
}

export async function getAdminOrganization(id: string) {
  const organization = await db.organization.findUnique({ where: { id }, include: organizationInclude });
  if (!organization) throw new BusinessNetworkError(404, "ORGANIZATION_NOT_FOUND", "Organization was not found.");
  return organization;
}

export async function createAdminOrganization(
  input: { data: z.infer<typeof createAdminOrganizationSchema> } & ActorInput,
) {
  return runSerializableTransaction(async (tx) => {
    if (input.data.ownerUserId) {
      const owner = await tx.user.findUnique({ where: { id: input.data.ownerUserId }, select: { id: true } });
      if (!owner) throw new BusinessNetworkError(422, "OWNER_NOT_FOUND", "The selected owner user was not found.");
    }
    await assertOrganizationIdentifiersAvailable(tx, input.data);
    const organization = await tx.organization.create({
      data: {
        code: input.data.code || newOrganizationCode(),
        legalName: input.data.legalName,
        displayName: input.data.displayName ?? null,
        companyType: input.data.companyType,
        status: input.data.status,
        email: input.data.email ?? null,
        phone: input.data.phone ?? null,
        website: input.data.website ?? null,
        tradeLicenseNo: input.data.tradeLicenseNo ?? null,
        tin: input.data.tin ?? null,
        bin: input.data.bin ?? null,
        registrationNo: input.data.registrationNo ?? null,
        country: input.data.country,
        currency: input.data.currency,
        capabilities: { create: input.data.capabilities.map((type) => ({ type })) },
        ...(input.data.ownerUserId
          ? { members: { create: { userId: input.data.ownerUserId, isPrimary: true, roles: { create: { role: "OWNER", grantedBy: input.actorUserId } } } } }
          : {}),
      },
      include: organizationInclude,
    });
    await writeBusinessAudit({ tx, request: input.request, organizationId: organization.id, actorUserId: input.actorUserId, action: BUSINESS_AUDIT_ACTIONS.organizationCreated, entityType: "Organization", entityId: organization.id, after: organization });
    return organization;
  });
}

export async function updateAdminOrganization(
  input: { id: string; data: z.infer<typeof updateAdminOrganizationSchema> } & ActorInput,
) {
  return runSerializableTransaction(async (tx) => {
    const before = await tx.organization.findUnique({ where: { id: input.id } });
    if (!before) throw new BusinessNetworkError(404, "ORGANIZATION_NOT_FOUND", "Organization was not found.");
    if (
      input.data.tradeLicenseNo !== undefined
      || input.data.tin !== undefined
      || input.data.bin !== undefined
    ) {
      await assertOrganizationIdentifiersAvailable(
        tx,
        {
          tradeLicenseNo: input.data.tradeLicenseNo === undefined ? before.tradeLicenseNo : input.data.tradeLicenseNo,
          tin: input.data.tin === undefined ? before.tin : input.data.tin,
          bin: input.data.bin === undefined ? before.bin : input.data.bin,
        },
        before.id,
      );
    }
    const organization = await tx.organization.update({ where: { id: input.id }, data: input.data, include: organizationInclude });
    await writeBusinessAudit({ tx, request: input.request, organizationId: organization.id, actorUserId: input.actorUserId, action: BUSINESS_AUDIT_ACTIONS.organizationUpdated, entityType: "Organization", entityId: organization.id, before, after: organization });
    return organization;
  });
}

const statusActions = {
  verify: { ...ORGANIZATION_STATUS_TRANSITIONS.verify, action: BUSINESS_AUDIT_ACTIONS.organizationVerified },
  reject: { ...ORGANIZATION_STATUS_TRANSITIONS.reject, action: BUSINESS_AUDIT_ACTIONS.organizationRejected },
  suspend: { ...ORGANIZATION_STATUS_TRANSITIONS.suspend, action: BUSINESS_AUDIT_ACTIONS.organizationSuspended },
  activate: { ...ORGANIZATION_STATUS_TRANSITIONS.activate, action: BUSINESS_AUDIT_ACTIONS.organizationActivated },
} as const;

export async function transitionAdminOrganization(input: { id: string; transition: OrganizationTransition; reason?: string | null } & ActorInput) {
  return runSerializableTransaction(async (tx) => {
    const before = await tx.organization.findUnique({ where: { id: input.id } });
    if (!before) throw new BusinessNetworkError(404, "ORGANIZATION_NOT_FOUND", "Organization was not found.");
    const rule = statusActions[input.transition];
    if (!(rule.allowed as readonly OrganizationStatus[]).includes(before.status)) {
      throw new BusinessNetworkError(409, "INVALID_ORGANIZATION_TRANSITION", `The ${input.transition} action is not allowed while the organization is ${before.status}.`);
    }
    const verificationMetadata = getOrganizationVerificationMetadata(
      before,
      input.transition,
      input.actorUserId,
    );
    const organization = await tx.organization.update({
      where: { id: input.id },
      data: {
        status: rule.next,
        rejectionReason: input.transition === "reject" ? input.reason || null : null,
        ...verificationMetadata,
      },
      include: organizationInclude,
    });
    await writeBusinessAudit({ tx, request: input.request, organizationId: organization.id, actorUserId: input.actorUserId, action: rule.action, entityType: "Organization", entityId: organization.id, before, after: input.reason ? { organization, reason: input.reason } : organization });
    return organization;
  });
}

export async function upsertOrganizationCapability(input: { organizationId: string; data: z.infer<typeof createOrganizationCapabilitySchema> } & ActorInput) {
  return runSerializableTransaction(async (tx) => {
    const organization = await tx.organization.findUnique({ where: { id: input.organizationId }, select: { id: true } });
    if (!organization) throw new BusinessNetworkError(404, "ORGANIZATION_NOT_FOUND", "Organization was not found.");
    const before = await tx.organizationCapability.findUnique({ where: { organizationId_type: { organizationId: input.organizationId, type: input.data.type } } });
    const capability = await tx.organizationCapability.upsert({
      where: { organizationId_type: { organizationId: input.organizationId, type: input.data.type } },
      create: { organizationId: input.organizationId, ...input.data, approvedAt: input.data.status === OrganizationCapabilityStatus.ACTIVE ? new Date() : null, approvedById: input.data.status === OrganizationCapabilityStatus.ACTIVE ? input.actorUserId : null },
      update: { status: input.data.status, reason: input.data.reason ?? null, approvedAt: input.data.status === OrganizationCapabilityStatus.ACTIVE ? new Date() : null, approvedById: input.data.status === OrganizationCapabilityStatus.ACTIVE ? input.actorUserId : null, revokedAt: input.data.status === OrganizationCapabilityStatus.REVOKED ? new Date() : null },
    });
    await writeBusinessAudit({ tx, request: input.request, organizationId: input.organizationId, actorUserId: input.actorUserId, action: BUSINESS_AUDIT_ACTIONS.organizationCapabilityUpdated, entityType: "Organization", entityId: input.organizationId, before, after: capability });
    return capability;
  });
}

export async function updateOrganizationCapability(input: { organizationId: string; capabilityId: string; data: z.infer<typeof updateOrganizationCapabilitySchema> } & ActorInput) {
  return runSerializableTransaction(async (tx) => {
    const before = await tx.organizationCapability.findFirst({ where: { id: input.capabilityId, organizationId: input.organizationId } });
    if (!before) throw new BusinessNetworkError(404, "CAPABILITY_NOT_FOUND", "Organization capability was not found.");
    const capability = await tx.organizationCapability.update({ where: { id: before.id }, data: { ...input.data, approvedAt: input.data.status === OrganizationCapabilityStatus.ACTIVE ? new Date() : before.approvedAt, approvedById: input.data.status === OrganizationCapabilityStatus.ACTIVE ? input.actorUserId : before.approvedById, revokedAt: input.data.status === OrganizationCapabilityStatus.REVOKED ? new Date() : null } });
    await writeBusinessAudit({ tx, request: input.request, organizationId: input.organizationId, actorUserId: input.actorUserId, action: BUSINESS_AUDIT_ACTIONS.organizationCapabilityUpdated, entityType: "Organization", entityId: input.organizationId, before, after: capability });
    return capability;
  });
}

export async function decideOrganizationDocument(input: { organizationId: string; documentId: string; decision: "verify" | "reject"; reason?: string | null } & ActorInput) {
  return runSerializableTransaction(async (tx) => {
    const before = await tx.organizationDocument.findFirst({ where: { id: input.documentId, organizationId: input.organizationId } });
    if (!before) throw new BusinessNetworkError(404, "DOCUMENT_NOT_FOUND", "Organization document was not found.");
    const verified = input.decision === "verify";
    const document = await tx.organizationDocument.update({ where: { id: before.id }, data: { status: verified ? OrganizationDocumentStatus.VERIFIED : OrganizationDocumentStatus.REJECTED, verifiedAt: verified ? new Date() : null, verifiedById: verified ? input.actorUserId : null, rejectionReason: verified ? null : input.reason || null } });
    await writeBusinessAudit({ tx, request: input.request, organizationId: input.organizationId, actorUserId: input.actorUserId, action: verified ? BUSINESS_AUDIT_ACTIONS.organizationDocumentVerified : BUSINESS_AUDIT_ACTIONS.organizationDocumentRejected, entityType: "Organization", entityId: input.organizationId, before, after: document });
    return document;
  });
}
