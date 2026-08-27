import "server-only";

import {
  OrganizationCapabilityType,
  PartnerAgreementStatus,
  PartnerAgreementVersionStatus,
  PartnerStatus,
  Prisma,
} from "@/generated/prisma";
import { db } from "@/lib/db";
import type { ActiveBusinessContext } from "./types";
import { BUSINESS_AUDIT_ACTIONS, writeBusinessAudit } from "./audit";
import { BusinessNetworkError } from "./business-error";
import {
  assertPartnerAgreementDates,
  assertPartnerAgreementTransition,
  assertPartnerAgreementVersionTransition,
  assertPartnerStatusTransition,
  formatPartnerAgreementNumber,
  formatPartnerCode,
} from "./partner-core";
import type {
  createPartnerAgreementSchema,
  createPartnerAgreementVersionSchema,
  partnerAgreementListSchema,
  partnerListSchema,
} from "./partner-schemas";
import { runSerializableTransaction } from "./transaction";
import type { z } from "zod";

type PartnerListInput = z.infer<typeof partnerListSchema>;
type AgreementListInput = z.infer<typeof partnerAgreementListSchema>;
type CreateAgreementInput = z.infer<typeof createPartnerAgreementSchema>;
type CreateVersionInput = z.infer<typeof createPartnerAgreementVersionSchema>;

const PARTNER_CAPABILITIES: OrganizationCapabilityType[] = [
  OrganizationCapabilityType.AFFILIATE,
  OrganizationCapabilityType.RESELLER,
  OrganizationCapabilityType.DEALER,
  OrganizationCapabilityType.MARKETING_PARTNER,
  OrganizationCapabilityType.SERVICE_PARTNER,
];

const profileDetailInclude = {
  organization: {
    include: {
      capabilities: {
        where: { type: { in: PARTNER_CAPABILITIES } },
        orderBy: { type: "asc" as const },
        select: { id: true, type: true, status: true, approvedAt: true, revokedAt: true },
      },
    },
  },
  agreements: {
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    include: {
      versions: { orderBy: { versionNumber: "desc" as const } },
    },
  },
} satisfies Prisma.PartnerProfileInclude;

const agreementDetailInclude = {
  partnerProfile: {
    include: {
      organization: {
        select: {
          id: true,
          code: true,
          legalName: true,
          displayName: true,
          status: true,
          currency: true,
          capabilities: {
            where: { type: { in: PARTNER_CAPABILITIES } },
            select: { type: true, status: true },
          },
        },
      },
    },
  },
  versions: { orderBy: { versionNumber: "desc" as const } },
} satisfies Prisma.PartnerAgreementInclude;

type ProfileDetail = Prisma.PartnerProfileGetPayload<{ include: typeof profileDetailInclude }>;
type AgreementDetail = Prisma.PartnerAgreementGetPayload<{ include: typeof agreementDetailInclude }>;

function serializeVersion<T extends {
  minimumSettlement: Prisma.Decimal;
}>(version: T) {
  return { ...version, minimumSettlement: version.minimumSettlement.toFixed(2) };
}

function serializeProfile(profile: ProfileDetail) {
  return {
    ...profile,
    agreements: profile.agreements.map((agreement) => ({
      ...agreement,
      versions: agreement.versions.map(serializeVersion),
    })),
  };
}

function serializeAgreement(agreement: AgreementDetail) {
  return { ...agreement, versions: agreement.versions.map(serializeVersion) };
}

async function nextSequence(
  tx: Prisma.TransactionClient,
  sequence: "PartnerProfileCode_seq" | "PartnerAgreementNumber_seq",
) {
  const rows = sequence === "PartnerProfileCode_seq"
    ? await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('"PartnerProfileCode_seq"') AS value`
    : await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('"PartnerAgreementNumber_seq"') AS value`;
  const value = rows[0]?.value;
  if (!value) {
    throw new BusinessNetworkError(503, "PARTNER_NUMBER_UNAVAILABLE", "Could not allocate a partner number.");
  }
  return value;
}

async function findPartnerProfile(
  tx: Prisma.TransactionClient | typeof db,
  id: string,
  organizationId?: string,
) {
  const profile = await tx.partnerProfile.findFirst({
    where: { id, ...(organizationId ? { organizationId } : {}) },
    include: profileDetailInclude,
  });
  if (!profile) {
    throw new BusinessNetworkError(404, "PARTNER_PROFILE_NOT_FOUND", "Partner profile not found.");
  }
  return profile;
}

async function findAgreement(tx: Prisma.TransactionClient | typeof db, id: string) {
  const agreement = await tx.partnerAgreement.findUnique({
    where: { id },
    include: agreementDetailInclude,
  });
  if (!agreement) {
    throw new BusinessNetworkError(404, "PARTNER_AGREEMENT_NOT_FOUND", "Partner agreement not found.");
  }
  return agreement;
}

function hasActivePartnerCapability(profile: ProfileDetail | AgreementDetail["partnerProfile"]) {
  return profile.organization.status === "ACTIVE"
    && profile.organization.capabilities.some((capability) => capability.status === "ACTIVE");
}

async function assertPartnerApplicationDependencies(
  tx: Prisma.TransactionClient,
  organizationId: string,
  accountManagerId?: string | null,
) {
  const [organization, manager] = await Promise.all([
    tx.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        status: true,
        capabilities: {
          where: { type: { in: PARTNER_CAPABILITIES }, status: { not: "REVOKED" } },
          select: { id: true },
        },
      },
    }),
    accountManagerId
      ? tx.user.findUnique({ where: { id: accountManagerId }, select: { id: true } })
      : null,
  ]);
  if (!organization) {
    throw new BusinessNetworkError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  }
  if (!organization.capabilities.length) {
    throw new BusinessNetworkError(
      422,
      "PARTNER_CAPABILITY_REQUIRED",
      "A non-revoked partner capability is required before a partner profile can be provisioned.",
    );
  }
  if (accountManagerId && !manager) {
    throw new BusinessNetworkError(404, "PARTNER_MANAGER_NOT_FOUND", "Partner account manager not found.");
  }
}

export async function provisionPartnerProfile(input: {
  organizationId: string;
  accountManagerId?: string | null;
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const existing = await tx.partnerProfile.findUnique({
      where: { organizationId: input.organizationId },
      include: profileDetailInclude,
    });
    if (existing) return serializeProfile(existing);
    await assertPartnerApplicationDependencies(tx, input.organizationId, input.accountManagerId);
    const value = await nextSequence(tx, "PartnerProfileCode_seq");
    const profile = await tx.partnerProfile.create({
      data: {
        organizationId: input.organizationId,
        partnerCode: formatPartnerCode(value),
        accountManagerId: input.accountManagerId ?? null,
      },
      include: profileDetailInclude,
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: profile.organizationId,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.partnerProfileApplied,
      entityType: "PartnerProfile",
      entityId: profile.id,
      after: profile,
    });
    return serializeProfile(profile);
  });
}

export async function listPartnerProfiles(input: PartnerListInput) {
  const where: Prisma.PartnerProfileWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.capability ? {
      organization: { capabilities: { some: { type: input.capability } } },
    } : {}),
    ...(input.search ? {
      OR: [
        { partnerCode: { contains: input.search, mode: "insensitive" } },
        { organization: { code: { contains: input.search, mode: "insensitive" } } },
        { organization: { legalName: { contains: input.search, mode: "insensitive" } } },
        { organization: { displayName: { contains: input.search, mode: "insensitive" } } },
      ],
    } : {}),
  };
  const [items, total] = await Promise.all([
    db.partnerProfile.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        organization: { select: { id: true, code: true, legalName: true, displayName: true, status: true } },
        _count: { select: { agreements: true } },
      },
    }),
    db.partnerProfile.count({ where }),
  ]);
  return {
    items,
    pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) },
  };
}

export async function getAdminPartnerProfile(id: string) {
  return serializeProfile(await findPartnerProfile(db, id));
}

export async function getPortalPartnerProfile(context: ActiveBusinessContext) {
  const profile = await db.partnerProfile.findUnique({
    where: { organizationId: context.activeMembership.organization.id },
    include: profileDetailInclude,
  });
  if (!profile) {
    throw new BusinessNetworkError(404, "PARTNER_PROFILE_NOT_FOUND", "Partner profile not found.");
  }
  return serializeProfile(profile);
}

async function updatePartnerWorkflow(input: {
  id: string;
  action: "approve" | "reject" | "suspend" | "reactivate";
  reason?: string;
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const before = await findPartnerProfile(tx, input.id);
    const now = new Date();
    if (input.action === "approve") {
      if (before.status === PartnerStatus.ACTIVE) return serializeProfile(before);
      if (!hasActivePartnerCapability(before)) {
        throw new BusinessNetworkError(
          422,
          "PARTNER_ACTIVATION_BLOCKED",
          "An active organization and active partner capability are required for approval.",
        );
      }
      if (before.status === PartnerStatus.APPLIED) {
        assertPartnerStatusTransition(before.status, PartnerStatus.UNDER_REVIEW);
        await tx.partnerProfile.update({
          where: { id: before.id },
          data: { status: PartnerStatus.UNDER_REVIEW },
        });
      } else if (before.status !== PartnerStatus.UNDER_REVIEW) {
        assertPartnerStatusTransition(before.status, PartnerStatus.ACTIVE);
      }
    } else if (input.action === "reject") {
      if (before.status === PartnerStatus.REJECTED) return serializeProfile(before);
      if (before.status === PartnerStatus.APPLIED) {
        assertPartnerStatusTransition(before.status, PartnerStatus.UNDER_REVIEW);
        await tx.partnerProfile.update({
          where: { id: before.id },
          data: { status: PartnerStatus.UNDER_REVIEW },
        });
      } else if (before.status !== PartnerStatus.UNDER_REVIEW) {
        assertPartnerStatusTransition(before.status, PartnerStatus.REJECTED);
      }
    } else if (input.action === "suspend") {
      if (before.status === PartnerStatus.SUSPENDED) return serializeProfile(before);
      assertPartnerStatusTransition(before.status, PartnerStatus.SUSPENDED);
    } else {
      if (before.status === PartnerStatus.ACTIVE) return serializeProfile(before);
      if (!hasActivePartnerCapability(before)) {
        throw new BusinessNetworkError(
          422,
          "PARTNER_REACTIVATION_BLOCKED",
          "An active organization and active partner capability are required for reactivation.",
        );
      }
      assertPartnerStatusTransition(before.status, PartnerStatus.ACTIVE);
    }

    const status = input.action === "approve" || input.action === "reactivate"
      ? PartnerStatus.ACTIVE
      : input.action === "reject"
        ? PartnerStatus.REJECTED
        : PartnerStatus.SUSPENDED;
    const updated = await tx.partnerProfile.update({
      where: { id: before.id },
      data: {
        status,
        ...(input.action === "approve" ? { approvedAt: now, rejectionReason: null } : {}),
        ...(input.action === "reject" ? { rejectionReason: input.reason } : {}),
        ...(input.action === "suspend" ? { suspendedAt: now } : {}),
        ...(input.action === "reactivate" ? { suspendedAt: null } : {}),
      },
      include: profileDetailInclude,
    });
    const action = input.action === "approve"
      ? BUSINESS_AUDIT_ACTIONS.partnerProfileApproved
      : input.action === "reject"
        ? BUSINESS_AUDIT_ACTIONS.partnerProfileRejected
        : input.action === "suspend"
          ? BUSINESS_AUDIT_ACTIONS.partnerProfileSuspended
          : BUSINESS_AUDIT_ACTIONS.partnerProfileReactivated;
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: before.organizationId,
      actorUserId: input.actorUserId,
      action,
      entityType: "PartnerProfile",
      entityId: before.id,
      before,
      after: updated,
    });
    return serializeProfile(updated);
  });
}

export const approvePartnerProfile = (input: Omit<Parameters<typeof updatePartnerWorkflow>[0], "action">) =>
  updatePartnerWorkflow({ ...input, action: "approve" });
export const rejectPartnerProfile = (input: Omit<Parameters<typeof updatePartnerWorkflow>[0], "action">) =>
  updatePartnerWorkflow({ ...input, action: "reject" });
export const suspendPartnerProfile = (input: Omit<Parameters<typeof updatePartnerWorkflow>[0], "action">) =>
  updatePartnerWorkflow({ ...input, action: "suspend" });
export const reactivatePartnerProfile = (input: Omit<Parameters<typeof updatePartnerWorkflow>[0], "action">) =>
  updatePartnerWorkflow({ ...input, action: "reactivate" });

function versionData(data: CreateVersionInput, versionNumber: number) {
  if (data.commissionPlanId) {
    throw new BusinessNetworkError(
      409,
      "COMMISSION_PLAN_MILESTONE_REQUIRED",
      "Commission plans become assignable in M10; leave commissionPlanId empty in M8.",
    );
  }
  const json = (value: Record<string, unknown> | null | undefined) =>
    value == null ? Prisma.DbNull : value as Prisma.InputJsonValue;
  return {
    versionNumber,
    commissionPlanId: null,
    attributionModel: data.attributionModel,
    attributionWindowDays: data.attributionWindowDays,
    allowSelfReferral: data.allowSelfReferral,
    minimumSettlement: new Prisma.Decimal(data.minimumSettlement).toDecimalPlaces(2),
    currency: data.currency,
    territoryRules: json(data.territoryRules),
    categoryRules: json(data.categoryRules),
    commercialTerms: json(data.commercialTerms),
  };
}

export async function createPartnerAgreement(input: {
  data: CreateAgreementInput;
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const profile = await findPartnerProfile(tx, input.data.partnerProfileId);
    if (profile.status !== PartnerStatus.ACTIVE || !hasActivePartnerCapability(profile)) {
      throw new BusinessNetworkError(
        409,
        "ACTIVE_PARTNER_REQUIRED",
        "Only an active partner with an active partner capability can receive an agreement.",
      );
    }
    assertPartnerAgreementDates(input.data.startsAt, input.data.endsAt);
    if (input.data.version.currency !== profile.organization.currency) {
      throw new BusinessNetworkError(
        422,
        "PARTNER_AGREEMENT_CURRENCY_MISMATCH",
        "Agreement currency must match the partner organization currency.",
      );
    }
    const value = await nextSequence(tx, "PartnerAgreementNumber_seq");
    const agreement = await tx.partnerAgreement.create({
      data: {
        agreementNumber: formatPartnerAgreementNumber(value),
        partnerProfileId: profile.id,
        startsAt: input.data.startsAt,
        endsAt: input.data.endsAt ?? null,
        versions: { create: versionData(input.data.version, 1) },
      },
      include: agreementDetailInclude,
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: profile.organizationId,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.partnerAgreementCreated,
      entityType: "PartnerAgreement",
      entityId: agreement.id,
      after: agreement,
    });
    return serializeAgreement(agreement);
  });
}

export async function createPartnerAgreementVersion(input: {
  id: string;
  data: CreateVersionInput;
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const before = await findAgreement(tx, input.id);
    if (before.status !== PartnerAgreementStatus.ACTIVE || before.partnerProfile.status !== PartnerStatus.ACTIVE) {
      throw new BusinessNetworkError(
        409,
        "PARTNER_AGREEMENT_NOT_VERSIONABLE",
        "Only an active agreement for an active partner can receive a new version.",
      );
    }
    if (before.versions.some((version) =>
      version.status === PartnerAgreementVersionStatus.DRAFT
      || version.status === PartnerAgreementVersionStatus.PENDING_APPROVAL
    )) {
      throw new BusinessNetworkError(
        409,
        "PARTNER_AGREEMENT_OPEN_VERSION_EXISTS",
        "Submit or resolve the existing open agreement version before creating another.",
      );
    }
    if (input.data.currency !== before.partnerProfile.organization.currency) {
      throw new BusinessNetworkError(422, "PARTNER_AGREEMENT_CURRENCY_MISMATCH", "Agreement currency must match the partner organization currency.");
    }
    const nextNumber = Math.max(...before.versions.map((version) => version.versionNumber)) + 1;
    await tx.partnerAgreementVersion.create({
      data: { agreementId: before.id, ...versionData(input.data, nextNumber) },
    });
    const updated = await findAgreement(tx, before.id);
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: before.partnerProfile.organizationId,
      actorUserId: input.actorUserId,
      action: BUSINESS_AUDIT_ACTIONS.partnerAgreementVersionCreated,
      entityType: "PartnerAgreementVersion",
      entityId: updated.versions[0].id,
      before,
      after: updated,
    });
    return serializeAgreement(updated);
  });
}

export async function listPartnerAgreements(input: AgreementListInput) {
  const where: Prisma.PartnerAgreementWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.partnerProfileId ? { partnerProfileId: input.partnerProfileId } : {}),
    ...(input.search ? {
      OR: [
        { agreementNumber: { contains: input.search, mode: "insensitive" } },
        { partnerProfile: { partnerCode: { contains: input.search, mode: "insensitive" } } },
        { partnerProfile: { organization: { legalName: { contains: input.search, mode: "insensitive" } } } },
      ],
    } : {}),
  };
  const [items, total] = await Promise.all([
    db.partnerAgreement.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        partnerProfile: {
          select: {
            id: true,
            partnerCode: true,
            status: true,
            organization: { select: { id: true, legalName: true, displayName: true } },
          },
        },
        versions: { orderBy: { versionNumber: "desc" }, take: 1 },
      },
    }),
    db.partnerAgreement.count({ where }),
  ]);
  return {
    items: items.map((item) => ({ ...item, versions: item.versions.map(serializeVersion) })),
    pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) },
  };
}

export async function getPartnerAgreement(id: string) {
  return serializeAgreement(await findAgreement(db, id));
}

async function updateAgreementWorkflow(input: {
  id: string;
  action: "submit" | "approve" | "suspend" | "terminate";
  actorUserId: string;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const before = await findAgreement(tx, input.id);
    const latest = before.versions[0];
    if (!latest) {
      throw new BusinessNetworkError(409, "PARTNER_AGREEMENT_VERSION_REQUIRED", "The agreement has no version.");
    }
    const now = new Date();

    if (input.action === "submit") {
      if (latest.status === PartnerAgreementVersionStatus.PENDING_APPROVAL) return serializeAgreement(before);
      assertPartnerAgreementVersionTransition(latest.status, PartnerAgreementVersionStatus.PENDING_APPROVAL);
      await tx.partnerAgreementVersion.update({
        where: { id: latest.id },
        data: { status: PartnerAgreementVersionStatus.PENDING_APPROVAL },
      });
      if (before.status === PartnerAgreementStatus.DRAFT) {
        assertPartnerAgreementTransition(before.status, PartnerAgreementStatus.PENDING_APPROVAL);
        await tx.partnerAgreement.update({
          where: { id: before.id },
          data: { status: PartnerAgreementStatus.PENDING_APPROVAL },
        });
      } else if (before.status !== PartnerAgreementStatus.ACTIVE) {
        throw new BusinessNetworkError(409, "PARTNER_AGREEMENT_NOT_SUBMITTABLE", "This agreement cannot be submitted.");
      }
    } else if (input.action === "approve") {
      if (latest.status === PartnerAgreementVersionStatus.ACTIVE && before.status === PartnerAgreementStatus.ACTIVE) {
        return serializeAgreement(before);
      }
      if (before.partnerProfile.status !== PartnerStatus.ACTIVE || !hasActivePartnerCapability(before.partnerProfile)) {
        throw new BusinessNetworkError(409, "ACTIVE_PARTNER_REQUIRED", "The partner must be active before agreement approval.");
      }
      if (before.endsAt && before.endsAt <= now) {
        throw new BusinessNetworkError(409, "PARTNER_AGREEMENT_EXPIRED", "An expired agreement cannot be approved.");
      }
      assertPartnerAgreementVersionTransition(latest.status, PartnerAgreementVersionStatus.ACTIVE);
      const previousActive = before.versions.find((version) => version.status === PartnerAgreementVersionStatus.ACTIVE);
      if (previousActive) {
        assertPartnerAgreementVersionTransition(previousActive.status, PartnerAgreementVersionStatus.SUPERSEDED);
        await tx.partnerAgreementVersion.update({
          where: { id: previousActive.id },
          data: { status: PartnerAgreementVersionStatus.SUPERSEDED },
        });
      }
      await tx.partnerAgreementVersion.update({
        where: { id: latest.id },
        data: {
          status: PartnerAgreementVersionStatus.ACTIVE,
          approvedById: input.actorUserId,
          approvedAt: now,
        },
      });
      if (before.status === PartnerAgreementStatus.PENDING_APPROVAL) {
        assertPartnerAgreementTransition(before.status, PartnerAgreementStatus.ACTIVE);
        await tx.partnerAgreement.update({ where: { id: before.id }, data: { status: PartnerAgreementStatus.ACTIVE } });
      } else if (before.status !== PartnerAgreementStatus.ACTIVE) {
        throw new BusinessNetworkError(409, "PARTNER_AGREEMENT_NOT_APPROVABLE", "This agreement cannot be approved.");
      }
    } else if (input.action === "suspend") {
      if (before.status === PartnerAgreementStatus.SUSPENDED) return serializeAgreement(before);
      assertPartnerAgreementTransition(before.status, PartnerAgreementStatus.SUSPENDED);
      await tx.partnerAgreement.update({ where: { id: before.id }, data: { status: PartnerAgreementStatus.SUSPENDED } });
    } else {
      if (before.status === PartnerAgreementStatus.TERMINATED) return serializeAgreement(before);
      assertPartnerAgreementTransition(before.status, PartnerAgreementStatus.TERMINATED);
      await tx.partnerAgreement.update({ where: { id: before.id }, data: { status: PartnerAgreementStatus.TERMINATED } });
    }

    const updated = await findAgreement(tx, before.id);
    const action = input.action === "submit"
      ? BUSINESS_AUDIT_ACTIONS.partnerAgreementSubmitted
      : input.action === "approve"
        ? BUSINESS_AUDIT_ACTIONS.partnerAgreementApproved
        : input.action === "suspend"
          ? BUSINESS_AUDIT_ACTIONS.partnerAgreementSuspended
          : BUSINESS_AUDIT_ACTIONS.partnerAgreementTerminated;
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: before.partnerProfile.organizationId,
      actorUserId: input.actorUserId,
      action,
      entityType: input.action === "submit" || input.action === "approve"
        ? "PartnerAgreementVersion"
        : "PartnerAgreement",
      entityId: input.action === "submit" || input.action === "approve" ? latest.id : before.id,
      before,
      after: updated,
    });
    return serializeAgreement(updated);
  });
}

export const submitPartnerAgreement = (input: Omit<Parameters<typeof updateAgreementWorkflow>[0], "action">) =>
  updateAgreementWorkflow({ ...input, action: "submit" });
export const approvePartnerAgreement = (input: Omit<Parameters<typeof updateAgreementWorkflow>[0], "action">) =>
  updateAgreementWorkflow({ ...input, action: "approve" });
export const suspendPartnerAgreement = (input: Omit<Parameters<typeof updateAgreementWorkflow>[0], "action">) =>
  updateAgreementWorkflow({ ...input, action: "suspend" });
export const terminatePartnerAgreement = (input: Omit<Parameters<typeof updateAgreementWorkflow>[0], "action">) =>
  updateAgreementWorkflow({ ...input, action: "terminate" });
