import "server-only";

import { randomBytes } from "node:crypto";
import {
  OrganizationCapabilityType,
  OrganizationCapabilityStatus,
  PartnerAgreementStatus,
  PartnerAgreementVersionStatus,
  PartnerAssetStatus,
  PartnerAttributionModel,
  PartnerAttributionStatus,
  PartnerLeadStatus,
  PartnerStatus,
  Prisma,
} from "@/generated/prisma";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/request-security";
import { BUSINESS_AUDIT_ACTIONS, writeBusinessAudit } from "./audit";
import type { AttributionCookieClaim } from "./partner-attribution-cookie";
import { hashPartnerAttributionFingerprint } from "./partner-attribution-cookie";
import { BusinessNetworkError } from "./business-error";
import {
  assertPartnerAssetDates,
  assertPartnerAttributionTransition,
  assertPartnerLeadTransition,
  attributionExpiry,
  formatPartnerLeadNumber,
  isPartnerAssetUsable,
  normalizePartnerAssetCode,
  sourceForPartnerAsset,
} from "./partner-referral-core";
import type {
  CapturePartnerAttributionInput,
  CreatePartnerAssetInput,
  CreatePartnerLeadInput,
  PartnerAssetListInput,
  PartnerLeadListInput,
  UpdatePartnerAssetInput,
} from "./partner-referral-schemas";
import { runSerializableTransaction } from "./transaction";
import type { ActiveBusinessContext } from "./types";

type DatabaseClient = Prisma.TransactionClient | typeof db;

const PARTNER_CAPABILITY_TYPES: OrganizationCapabilityType[] = [
  OrganizationCapabilityType.AFFILIATE,
  OrganizationCapabilityType.RESELLER,
  OrganizationCapabilityType.DEALER,
  OrganizationCapabilityType.MARKETING_PARTNER,
  OrganizationCapabilityType.SERVICE_PARTNER,
];

const ACTIVE_PARTNER_CAPABILITY: Prisma.OrganizationCapabilityWhereInput = {
  status: OrganizationCapabilityStatus.ACTIVE,
  type: { in: PARTNER_CAPABILITY_TYPES },
};

const OPEN_LEAD_STATUSES: PartnerLeadStatus[] = [
  PartnerLeadStatus.SUBMITTED,
  PartnerLeadStatus.VALIDATING,
  PartnerLeadStatus.ACCEPTED,
  PartnerLeadStatus.ASSIGNED,
  PartnerLeadStatus.IN_PROGRESS,
];

const TERMINAL_LEAD_STATUSES = new Set<PartnerLeadStatus>([
  PartnerLeadStatus.DUPLICATE,
  PartnerLeadStatus.WON,
  PartnerLeadStatus.LOST,
  PartnerLeadStatus.EXPIRED,
  PartnerLeadStatus.REJECTED,
]);

const leadDetailInclude = {
  partnerProfile: {
    select: {
      id: true,
      partnerCode: true,
      status: true,
      organization: { select: { id: true, legalName: true, displayName: true, currency: true } },
    },
  },
  assignedToUser: { select: { id: true, name: true, email: true } },
  wonOrder: { select: { id: true, status: true, grand_total: true, currency: true, order_date: true } },
  duplicateOf: { select: { id: true, leadNumber: true, companyName: true, status: true } },
} satisfies Prisma.PartnerLeadInclude;

type LeadDetail = Prisma.PartnerLeadGetPayload<{ include: typeof leadDetailInclude }>;

function serializeLead<T extends { estimatedValue: Prisma.Decimal | null }>(lead: T) {
  return { ...lead, estimatedValue: lead.estimatedValue?.toFixed(2) ?? null };
}

async function nextLeadNumber(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('"PartnerLeadNumber_seq"') AS value`;
  const value = rows[0]?.value;
  if (!value) {
    throw new BusinessNetworkError(503, "PARTNER_LEAD_NUMBER_UNAVAILABLE", "Could not allocate a partner lead number.");
  }
  return formatPartnerLeadNumber(value);
}

async function requireActivePortalPartner(tx: DatabaseClient, organizationId: string) {
  const profile = await tx.partnerProfile.findUnique({
    where: { organizationId },
    include: {
      organization: {
        select: {
          id: true,
          status: true,
          currency: true,
          capabilities: { where: ACTIVE_PARTNER_CAPABILITY, select: { id: true } },
        },
      },
    },
  });
  if (
    !profile
    || profile.status !== PartnerStatus.ACTIVE
    || profile.organization.status !== "ACTIVE"
    || profile.organization.capabilities.length === 0
  ) {
    throw new BusinessNetworkError(403, "ACTIVE_PARTNER_REQUIRED", "An active partner profile is required.");
  }
  return profile;
}

function generatedAssetCode(): string {
  return `REF-${randomBytes(12).toString("base64url").toUpperCase()}`;
}

async function uniqueAssetCode(tx: Prisma.TransactionClient, requested?: string): Promise<string> {
  if (requested) {
    const code = normalizePartnerAssetCode(requested);
    const exists = await tx.partnerAsset.findUnique({ where: { code }, select: { id: true } });
    if (exists) throw new BusinessNetworkError(409, "PARTNER_ASSET_CODE_EXISTS", "This referral code is already in use.");
    return code;
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generatedAssetCode();
    const exists = await tx.partnerAsset.findUnique({ where: { code }, select: { id: true } });
    if (!exists) return code;
  }
  throw new BusinessNetworkError(503, "PARTNER_ASSET_CODE_UNAVAILABLE", "Could not allocate a referral code.");
}

export async function listPortalPartnerAssets(context: ActiveBusinessContext, input: PartnerAssetListInput) {
  const profile = await requireActivePortalPartner(db, context.activeMembership.organization.id);
  const where: Prisma.PartnerAssetWhereInput = {
    partnerProfileId: profile.id,
    ...(input.status ? { status: input.status } : {}),
    ...(input.type ? { type: input.type } : {}),
  };
  const [items, total] = await Promise.all([
    db.partnerAsset.findMany({
      where,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { _count: { select: { attributions: true } } },
    }),
    db.partnerAsset.count({ where }),
  ]);
  return {
    items,
    pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) },
  };
}

export async function createPortalPartnerAsset(input: {
  context: ActiveBusinessContext;
  data: CreatePartnerAssetInput;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const profile = await requireActivePortalPartner(tx, input.context.activeMembership.organization.id);
    assertPartnerAssetDates(input.data.startsAt, input.data.endsAt);
    const activeAgreement = await tx.partnerAgreement.findFirst({
      where: {
        partnerProfileId: profile.id,
        status: PartnerAgreementStatus.ACTIVE,
        startsAt: { lte: new Date() },
        OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
        versions: { some: { status: PartnerAgreementVersionStatus.ACTIVE } },
      },
      select: { id: true },
    });
    if (!activeAgreement) {
      throw new BusinessNetworkError(409, "ACTIVE_PARTNER_AGREEMENT_REQUIRED", "An active partner agreement is required.");
    }
    const asset = await tx.partnerAsset.create({
      data: {
        partnerProfileId: profile.id,
        type: input.data.type,
        code: await uniqueAssetCode(tx, input.data.code),
        destinationPath: input.data.destinationPath,
        campaignName: input.data.campaignName ?? null,
        startsAt: input.data.startsAt ?? null,
        endsAt: input.data.endsAt ?? null,
      },
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: profile.organizationId,
      memberId: input.context.activeMembership.memberId,
      actorUserId: input.context.user.id,
      action: BUSINESS_AUDIT_ACTIONS.partnerAssetCreated,
      entityType: "PartnerAsset",
      entityId: asset.id,
      after: asset,
    });
    return asset;
  });
}

async function findPortalAsset(tx: DatabaseClient, id: string, organizationId: string) {
  const asset = await tx.partnerAsset.findFirst({
    where: { id, partnerProfile: { organizationId } },
  });
  if (!asset) throw new BusinessNetworkError(404, "PARTNER_ASSET_NOT_FOUND", "Partner asset not found.");
  return asset;
}

export async function updatePortalPartnerAsset(input: {
  id: string;
  context: ActiveBusinessContext;
  data: UpdatePartnerAssetInput;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const profile = await requireActivePortalPartner(tx, input.context.activeMembership.organization.id);
    const before = await findPortalAsset(tx, input.id, profile.organizationId);
    if (before.status === PartnerAssetStatus.EXPIRED) {
      throw new BusinessNetworkError(409, "PARTNER_ASSET_EXPIRED", "Expired partner assets cannot be changed.");
    }
    const startsAt = input.data.startsAt === undefined ? before.startsAt : input.data.startsAt;
    const endsAt = input.data.endsAt === undefined ? before.endsAt : input.data.endsAt;
    assertPartnerAssetDates(startsAt, endsAt);
    if (input.data.status === PartnerAssetStatus.ACTIVE && endsAt && endsAt <= new Date()) {
      throw new BusinessNetworkError(409, "PARTNER_ASSET_EXPIRED", "An ended partner asset cannot be activated.");
    }
    const updated = await tx.partnerAsset.update({ where: { id: before.id }, data: input.data });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: profile.organizationId,
      memberId: input.context.activeMembership.memberId,
      actorUserId: input.context.user.id,
      action: BUSINESS_AUDIT_ACTIONS.partnerAssetUpdated,
      entityType: "PartnerAsset",
      entityId: updated.id,
      before,
      after: updated,
    });
    return updated;
  });
}

export async function disablePortalPartnerAsset(input: {
  id: string;
  context: ActiveBusinessContext;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const profile = await requireActivePortalPartner(tx, input.context.activeMembership.organization.id);
    const before = await findPortalAsset(tx, input.id, profile.organizationId);
    if (before.status === PartnerAssetStatus.DISABLED || before.status === PartnerAssetStatus.EXPIRED) return before;
    const updated = await tx.partnerAsset.update({
      where: { id: before.id },
      data: { status: PartnerAssetStatus.DISABLED },
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: profile.organizationId,
      memberId: input.context.activeMembership.memberId,
      actorUserId: input.context.user.id,
      action: BUSINESS_AUDIT_ACTIONS.partnerAssetDisabled,
      entityType: "PartnerAsset",
      entityId: updated.id,
      before,
      after: updated,
    });
    return updated;
  });
}

async function lockAttributionIdentity(tx: Prisma.TransactionClient, visitorId: string, sessionId?: string) {
  const keys = [`partner-attribution:visitor:${visitorId}`];
  if (sessionId) keys.push(`partner-attribution:session:${sessionId}`);
  keys.sort();
  for (const key of keys) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
}

export async function capturePartnerAttribution(input: {
  data: CapturePartnerAttributionInput;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    await lockAttributionIdentity(tx, input.data.visitorId, input.data.sessionId);
    const now = new Date();
    const asset = await tx.partnerAsset.findUnique({
      where: { code: input.data.code },
      include: {
        partnerProfile: {
          include: {
            organization: {
              select: {
                id: true,
                status: true,
                capabilities: { where: ACTIVE_PARTNER_CAPABILITY, select: { id: true } },
              },
            },
            agreements: {
              where: {
                status: PartnerAgreementStatus.ACTIVE,
                startsAt: { lte: now },
                OR: [{ endsAt: null }, { endsAt: { gt: now } }],
              },
              orderBy: [{ startsAt: "desc" }, { id: "desc" }],
              take: 1,
              include: {
                versions: {
                  where: { status: PartnerAgreementVersionStatus.ACTIVE },
                  orderBy: { versionNumber: "desc" },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    const profile = asset?.partnerProfile;
    const agreement = profile?.agreements[0];
    const agreementVersion = agreement?.versions[0];
    if (
      !asset
      || !isPartnerAssetUsable(asset, now)
      || profile?.status !== PartnerStatus.ACTIVE
      || profile.organization.status !== "ACTIVE"
      || profile.organization.capabilities.length === 0
      || !agreement
      || !agreementVersion
    ) {
      throw new BusinessNetworkError(404, "PARTNER_REFERRAL_NOT_FOUND", "Referral is not available.");
    }

    const activeMatches = await tx.partnerAttribution.findMany({
      where: {
        status: PartnerAttributionStatus.ACTIVE,
        OR: [
          { visitorId: input.data.visitorId },
          ...(input.data.sessionId ? [{ sessionId: input.data.sessionId }] : []),
        ],
      },
      orderBy: [{ capturedAt: "asc" }, { id: "asc" }],
      include: { partnerProfile: { select: { organizationId: true } } },
    });
    const validMatches = activeMatches.filter((item) => item.expiresAt > now);
    for (const expired of activeMatches.filter((item) => item.expiresAt <= now)) {
      assertPartnerAttributionTransition(expired.status, PartnerAttributionStatus.EXPIRED);
      await tx.partnerAttribution.update({ where: { id: expired.id }, data: { status: PartnerAttributionStatus.EXPIRED } });
      await writeBusinessAudit({
        tx,
        request: input.request,
        organizationId: expired.partnerProfile.organizationId,
        actorUserId: null,
        action: BUSINESS_AUDIT_ACTIONS.partnerAttributionExpired,
        entityType: "PartnerAttribution",
        entityId: expired.id,
        before: expired,
        after: { status: PartnerAttributionStatus.EXPIRED },
      });
    }
    if (validMatches.length > 0 && agreementVersion.attributionModel === PartnerAttributionModel.FIRST_CLICK) {
      const existing = validMatches[0];
      return {
        attributionId: existing.id,
        capturedAt: existing.capturedAt,
        expiresAt: existing.expiresAt,
        destinationPath: asset.destinationPath || "/",
      };
    }
    for (const previous of validMatches) {
      assertPartnerAttributionTransition(previous.status, PartnerAttributionStatus.EXPIRED);
      await tx.partnerAttribution.update({ where: { id: previous.id }, data: { status: PartnerAttributionStatus.EXPIRED } });
      await writeBusinessAudit({
        tx,
        request: input.request,
        organizationId: previous.partnerProfile.organizationId,
        actorUserId: null,
        action: BUSINESS_AUDIT_ACTIONS.partnerAttributionExpired,
        entityType: "PartnerAttribution",
        entityId: previous.id,
        before: previous,
        after: { status: PartnerAttributionStatus.EXPIRED },
      });
    }

    const ip = getClientIp(input.request);
    const userAgent = input.request.headers.get("user-agent")?.trim().slice(0, 512) || "unknown";
    const expiresAt = attributionExpiry(now, agreementVersion.attributionWindowDays);
    const attribution = await tx.partnerAttribution.create({
      data: {
        partnerProfileId: profile.id,
        agreementVersionId: agreementVersion.id,
        assetId: asset.id,
        source: sourceForPartnerAsset(asset.type),
        visitorId: input.data.visitorId,
        sessionId: input.data.sessionId ?? null,
        ipHash: ip === "unknown" ? null : hashPartnerAttributionFingerprint(`ip:${ip}`),
        deviceHash: hashPartnerAttributionFingerprint(`device:${userAgent}`),
        expiresAt,
      },
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: profile.organizationId,
      actorUserId: null,
      action: BUSINESS_AUDIT_ACTIONS.partnerAttributionCaptured,
      entityType: "PartnerAttribution",
      entityId: attribution.id,
      after: attribution,
    });
    return {
      attributionId: attribution.id,
      capturedAt: attribution.capturedAt,
      expiresAt: attribution.expiresAt,
      destinationPath: asset.destinationPath || "/",
    };
  });
}

export async function convertPartnerAttributionForOrder(input: {
  tx: Prisma.TransactionClient;
  claim: AttributionCookieClaim | null;
  orderId: number;
  customerUserId?: string | null;
  request: Request;
}): Promise<"converted" | "ignored" | "rejected"> {
  if (!input.claim) return "ignored";
  const attribution = await input.tx.partnerAttribution.findUnique({
    where: { id: input.claim.attributionId },
    include: {
      partnerProfile: {
        select: {
          organizationId: true,
          status: true,
          organization: {
            select: {
              status: true,
              capabilities: { where: ACTIVE_PARTNER_CAPABILITY, select: { id: true } },
            },
          },
        },
      },
      agreementVersion: {
        select: {
          status: true,
          allowSelfReferral: true,
          agreement: { select: { partnerProfileId: true, status: true, startsAt: true, endsAt: true } },
        },
      },
    },
  });
  if (!attribution || attribution.status !== PartnerAttributionStatus.ACTIVE) return "ignored";
  const now = new Date();
  if (attribution.expiresAt <= now) {
    assertPartnerAttributionTransition(attribution.status, PartnerAttributionStatus.EXPIRED);
    await input.tx.partnerAttribution.update({ where: { id: attribution.id }, data: { status: PartnerAttributionStatus.EXPIRED } });
    await writeBusinessAudit({
      tx: input.tx,
      request: input.request,
      organizationId: attribution.partnerProfile.organizationId,
      actorUserId: input.customerUserId ?? null,
      action: BUSINESS_AUDIT_ACTIONS.partnerAttributionExpired,
      entityType: "PartnerAttribution",
      entityId: attribution.id,
      before: attribution,
      after: { status: PartnerAttributionStatus.EXPIRED },
    });
    return "ignored";
  }
  if (
    input.customerUserId
    && attribution.agreementVersion
    && !attribution.agreementVersion.allowSelfReferral
  ) {
    const selfReferral = await input.tx.organizationMember.findFirst({
      where: {
        organizationId: attribution.partnerProfile.organizationId,
        userId: input.customerUserId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (selfReferral) {
      assertPartnerAttributionTransition(attribution.status, PartnerAttributionStatus.REJECTED);
      const rejected = await input.tx.partnerAttribution.update({
        where: { id: attribution.id },
        data: {
          status: PartnerAttributionStatus.REJECTED,
          rejectedAt: now,
          rejectionReason: "Self-referral is not allowed by the active partner agreement.",
        },
      });
      await writeBusinessAudit({
        tx: input.tx,
        request: input.request,
        organizationId: attribution.partnerProfile.organizationId,
        actorUserId: input.customerUserId,
        action: BUSINESS_AUDIT_ACTIONS.partnerAttributionRejected,
        entityType: "PartnerAttribution",
        entityId: attribution.id,
        before: attribution,
        after: rejected,
      });
      return "rejected";
    }
  }
  if (
    attribution.partnerProfile.status !== PartnerStatus.ACTIVE
    || attribution.partnerProfile.organization.status !== "ACTIVE"
    || attribution.partnerProfile.organization.capabilities.length === 0
    || attribution.agreementVersion?.status !== PartnerAgreementVersionStatus.ACTIVE
    || attribution.agreementVersion.agreement.status !== PartnerAgreementStatus.ACTIVE
    || attribution.agreementVersion.agreement.partnerProfileId !== attribution.partnerProfileId
    || attribution.agreementVersion.agreement.startsAt > now
    || (attribution.agreementVersion.agreement.endsAt !== null
      && attribution.agreementVersion.agreement.endsAt <= now)
  ) return "ignored";
  assertPartnerAttributionTransition(attribution.status, PartnerAttributionStatus.CONVERTED);
  const converted = await input.tx.partnerAttribution.update({
    where: { id: attribution.id },
    data: {
      status: PartnerAttributionStatus.CONVERTED,
      customerUserId: input.customerUserId ?? null,
      orderId: input.orderId,
      convertedAt: now,
    },
  });
  await writeBusinessAudit({
    tx: input.tx,
    request: input.request,
    organizationId: attribution.partnerProfile.organizationId,
    actorUserId: input.customerUserId ?? null,
    action: BUSINESS_AUDIT_ACTIONS.partnerAttributionConverted,
    entityType: "PartnerAttribution",
    entityId: attribution.id,
    before: attribution,
    after: converted,
  });
  return "converted";
}

async function findPossibleDuplicateLeads(tx: DatabaseClient, data: CreatePartnerLeadInput, excludeId?: string) {
  const emailDomain = data.contactEmail?.split("@")[1] ?? null;
  const terms: Prisma.PartnerLeadWhereInput[] = [
    { companyName: { equals: data.companyName, mode: "insensitive" } },
  ];
  if (emailDomain) terms.push({ contactEmail: { endsWith: `@${emailDomain}`, mode: "insensitive" } });
  if (data.contactPhone) terms.push({ contactPhone: data.contactPhone });
  const organizationTerms: Prisma.OrganizationWhereInput[] = [
    { legalName: { equals: data.companyName, mode: "insensitive" } },
    { displayName: { equals: data.companyName, mode: "insensitive" } },
  ];
  if (emailDomain) organizationTerms.push({ email: { endsWith: `@${emailDomain}`, mode: "insensitive" } });
  if (data.contactPhone) organizationTerms.push({ phone: data.contactPhone });
  const [leads, organizations] = await Promise.all([
    tx.partnerLead.findMany({
      where: {
        ...(excludeId ? { id: { not: excludeId } } : {}),
        status: { in: OPEN_LEAD_STATUSES },
        OR: terms,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 10,
      select: { id: true, leadNumber: true, companyName: true, status: true, createdAt: true },
    }),
    tx.organization.findMany({
      where: { OR: organizationTerms },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 10,
      select: { id: true, code: true, legalName: true, displayName: true, status: true },
    }),
  ]);
  return { leads, organizations };
}

export async function createPortalPartnerLead(input: {
  context: ActiveBusinessContext;
  data: CreatePartnerLeadInput;
  request: Request;
}) {
  return runSerializableTransaction(async (tx) => {
    const profile = await requireActivePortalPartner(tx, input.context.activeMembership.organization.id);
    if (input.data.currency !== profile.organization.currency) {
      throw new BusinessNetworkError(422, "PARTNER_LEAD_CURRENCY_MISMATCH", "Lead currency must match the partner organization currency.");
    }
    const possibleDuplicates = await findPossibleDuplicateLeads(tx, input.data);
    const lead = await tx.partnerLead.create({
      data: {
        partnerProfileId: profile.id,
        leadNumber: await nextLeadNumber(tx),
        companyName: input.data.companyName,
        contactName: input.data.contactName,
        contactEmail: input.data.contactEmail ?? null,
        contactPhone: input.data.contactPhone ?? null,
        requirement: input.data.requirement ?? null,
        estimatedValue: input.data.estimatedValue == null
          ? null
          : new Prisma.Decimal(input.data.estimatedValue).toDecimalPlaces(2),
        currency: input.data.currency,
      },
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: profile.organizationId,
      memberId: input.context.activeMembership.memberId,
      actorUserId: input.context.user.id,
      action: BUSINESS_AUDIT_ACTIONS.partnerLeadCreated,
      entityType: "PartnerLead",
      entityId: lead.id,
      after: lead,
    });
    return {
      lead: serializeLead(lead),
      possibleDuplicate: possibleDuplicates.leads.length > 0 || possibleDuplicates.organizations.length > 0,
    };
  });
}

export async function listPortalPartnerLeads(context: ActiveBusinessContext, input: PartnerLeadListInput) {
  const profile = await requireActivePortalPartner(db, context.activeMembership.organization.id);
  const where: Prisma.PartnerLeadWhereInput = {
    partnerProfileId: profile.id,
    ...(input.status ? { status: input.status } : {}),
    ...(input.search ? {
      OR: [
        { leadNumber: { contains: input.search, mode: "insensitive" } },
        { companyName: { contains: input.search, mode: "insensitive" } },
        { contactName: { contains: input.search, mode: "insensitive" } },
      ],
    } : {}),
  };
  const [items, total] = await Promise.all([
    db.partnerLead.findMany({ where, skip: (input.page - 1) * input.limit, take: input.limit, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    db.partnerLead.count({ where }),
  ]);
  return { items: items.map(serializeLead), pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) } };
}

export async function getPortalPartnerLead(context: ActiveBusinessContext, id: string) {
  const profile = await requireActivePortalPartner(db, context.activeMembership.organization.id);
  const lead = await db.partnerLead.findFirst({ where: { id, partnerProfileId: profile.id } });
  if (!lead) throw new BusinessNetworkError(404, "PARTNER_LEAD_NOT_FOUND", "Partner lead not found.");
  return serializeLead(lead);
}

export async function listAdminPartnerLeads(input: PartnerLeadListInput) {
  const where: Prisma.PartnerLeadWhereInput = {
    ...(input.partnerProfileId ? { partnerProfileId: input.partnerProfileId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.search ? {
      OR: [
        { leadNumber: { contains: input.search, mode: "insensitive" } },
        { companyName: { contains: input.search, mode: "insensitive" } },
        { contactName: { contains: input.search, mode: "insensitive" } },
        { contactEmail: { contains: input.search, mode: "insensitive" } },
        { contactPhone: { contains: input.search, mode: "insensitive" } },
      ],
    } : {}),
  };
  const [items, total] = await Promise.all([
    db.partnerLead.findMany({ where, skip: (input.page - 1) * input.limit, take: input.limit, orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: leadDetailInclude }),
    db.partnerLead.count({ where }),
  ]);
  return { items: items.map(serializeLead), pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) } };
}

async function findAdminLead(tx: DatabaseClient, id: string): Promise<LeadDetail> {
  const lead = await tx.partnerLead.findUnique({ where: { id }, include: leadDetailInclude });
  if (!lead) throw new BusinessNetworkError(404, "PARTNER_LEAD_NOT_FOUND", "Partner lead not found.");
  return lead;
}

export async function getAdminPartnerLead(id: string) {
  const lead = await findAdminLead(db, id);
  const possibleDuplicates = await findPossibleDuplicateLeads(db, {
    companyName: lead.companyName,
    contactName: lead.contactName,
    contactEmail: lead.contactEmail,
    contactPhone: lead.contactPhone,
    requirement: lead.requirement,
    estimatedValue: lead.estimatedValue?.toFixed(2) ?? null,
    currency: lead.currency,
  }, lead.id);
  return { lead: serializeLead(lead), possibleDuplicateLeads: possibleDuplicates.leads, possibleOrganizations: possibleDuplicates.organizations };
}

type LeadAction = "accept" | "duplicate" | "assign" | "won" | "lost" | "reject";

export async function updatePartnerLeadWorkflow(input: {
  id: string;
  action: LeadAction;
  actorUserId: string;
  request: Request;
  duplicateOfId?: string;
  assignedToUserId?: string;
  ownershipExpiresAt?: Date;
  wonOrderId?: number;
  reason?: string;
}) {
  return runSerializableTransaction(async (tx) => {
    const before = await findAdminLead(tx, input.id);
    let current = before;
    const idempotent =
      (input.action === "accept" && current.status === PartnerLeadStatus.ACCEPTED)
      || (input.action === "duplicate" && current.status === PartnerLeadStatus.DUPLICATE
        && current.duplicateOfId === input.duplicateOfId)
      || (input.action === "assign" && current.status === PartnerLeadStatus.ASSIGNED
        && current.assignedToUserId === input.assignedToUserId)
      || (input.action === "won" && current.status === PartnerLeadStatus.WON
        && current.wonOrderId === input.wonOrderId)
      || (input.action === "lost" && current.status === PartnerLeadStatus.LOST)
      || (input.action === "reject" && current.status === PartnerLeadStatus.REJECTED);
    if (idempotent) return serializeLead(current);
    if (TERMINAL_LEAD_STATUSES.has(current.status)) {
      throw new BusinessNetworkError(409, "PARTNER_LEAD_TERMINAL", "This partner lead is already terminal.");
    }
    if (["accept", "duplicate", "reject"].includes(input.action) && current.status === PartnerLeadStatus.SUBMITTED) {
      assertPartnerLeadTransition(current.status, PartnerLeadStatus.VALIDATING);
      await tx.partnerLead.update({ where: { id: current.id }, data: { status: PartnerLeadStatus.VALIDATING } });
      current = await findAdminLead(tx, current.id);
    }

    let targetStatus: PartnerLeadStatus;
    let data: Prisma.PartnerLeadUpdateInput = {};
    if (input.action === "accept") {
      targetStatus = PartnerLeadStatus.ACCEPTED;
    } else if (input.action === "duplicate") {
      const duplicate = input.duplicateOfId
        ? await tx.partnerLead.findUnique({ where: { id: input.duplicateOfId }, select: { id: true, status: true } })
        : null;
      if (!duplicate || duplicate.id === current.id || duplicate.status === PartnerLeadStatus.DUPLICATE) {
        throw new BusinessNetworkError(422, "INVALID_DUPLICATE_LEAD", "A valid canonical lead is required.");
      }
      targetStatus = PartnerLeadStatus.DUPLICATE;
      data = { duplicateOf: { connect: { id: duplicate.id } } };
    } else if (input.action === "assign") {
      const assignee = input.assignedToUserId
        ? await tx.user.findUnique({ where: { id: input.assignedToUserId }, select: { id: true, banned: true } })
        : null;
      if (!assignee || assignee.banned) {
        throw new BusinessNetworkError(422, "INVALID_PARTNER_LEAD_ASSIGNEE", "An active assignee is required.");
      }
      if (input.ownershipExpiresAt && input.ownershipExpiresAt <= new Date()) {
        throw new BusinessNetworkError(422, "INVALID_LEAD_OWNERSHIP_EXPIRY", "Ownership expiry must be in the future.");
      }
      targetStatus = PartnerLeadStatus.ASSIGNED;
      data = { assignedToUser: { connect: { id: assignee.id } }, ownershipExpiresAt: input.ownershipExpiresAt ?? null };
    } else if (input.action === "won" || input.action === "lost") {
      if (current.status === PartnerLeadStatus.ASSIGNED) {
        assertPartnerLeadTransition(current.status, PartnerLeadStatus.IN_PROGRESS);
        await tx.partnerLead.update({ where: { id: current.id }, data: { status: PartnerLeadStatus.IN_PROGRESS } });
        current = await findAdminLead(tx, current.id);
      }
      if (input.action === "won") {
        const order = input.wonOrderId
          ? await tx.order.findUnique({ where: { id: input.wonOrderId }, select: { id: true, currency: true } })
          : null;
        if (!order) throw new BusinessNetworkError(422, "PARTNER_LEAD_ORDER_NOT_FOUND", "A valid won order is required.");
        if (order.currency !== current.currency) {
          throw new BusinessNetworkError(422, "PARTNER_LEAD_ORDER_CURRENCY_MISMATCH", "Won order currency must match the lead currency.");
        }
        targetStatus = PartnerLeadStatus.WON;
        data = { wonOrder: { connect: { id: order.id } } };
      } else {
        targetStatus = PartnerLeadStatus.LOST;
        data = { rejectionReason: input.reason ?? null };
      }
    } else {
      targetStatus = PartnerLeadStatus.REJECTED;
      data = { rejectionReason: input.reason };
    }
    assertPartnerLeadTransition(current.status, targetStatus);
    const updated = await tx.partnerLead.update({
      where: { id: current.id },
      data: { ...data, status: targetStatus },
      include: leadDetailInclude,
    });
    const action = input.action === "accept"
      ? BUSINESS_AUDIT_ACTIONS.partnerLeadAccepted
      : input.action === "duplicate"
        ? BUSINESS_AUDIT_ACTIONS.partnerLeadMarkedDuplicate
        : input.action === "assign"
          ? BUSINESS_AUDIT_ACTIONS.partnerLeadAssigned
          : input.action === "won"
            ? BUSINESS_AUDIT_ACTIONS.partnerLeadWon
            : input.action === "lost"
              ? BUSINESS_AUDIT_ACTIONS.partnerLeadLost
              : BUSINESS_AUDIT_ACTIONS.partnerLeadRejected;
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: before.partnerProfile.organization.id,
      actorUserId: input.actorUserId,
      action,
      entityType: "PartnerLead",
      entityId: updated.id,
      before,
      after: updated,
    });
    return serializeLead(updated);
  });
}
