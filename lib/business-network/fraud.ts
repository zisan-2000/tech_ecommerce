import "server-only";

import { createHash } from "node:crypto";
import {
  BusinessRiskCaseStatus,
  type BusinessFraudRule,
  type BusinessFraudRuleType,
  type Prisma,
} from "@/generated/prisma";
import { db } from "@/lib/db";
import { BUSINESS_AUDIT_ACTIONS, writeBusinessAudit } from "./audit";
import { BusinessNetworkError } from "./errors";
import { businessRiskDecisionSchema } from "./fraud-schemas";
import { runSerializableTransaction } from "./transaction";

type RuleMap = Map<BusinessFraudRuleType, BusinessFraudRule>;
type RiskCandidate = {
  type: BusinessFraudRuleType;
  subject: string;
  organizationId?: string | null;
  partnerProfileId?: string | null;
  attributionId?: string | null;
  partnerLeadId?: string | null;
  commissionEntryId?: string | null;
  orderId?: number | null;
  title: string;
  summary: string;
  evidence: Prisma.InputJsonValue;
};

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const normalizeEmail = (value?: string | null) => value?.trim().toLowerCase() || null;
const normalizePhone = (value?: string | null) => value?.replace(/\D/g, "").slice(-11) || null;

async function nextRiskCaseNumber(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('"BusinessRiskCaseNumber_seq"')::bigint AS value`;
  const value = rows[0]?.value;
  if (!value) throw new Error("Risk case sequence did not return a value.");
  return `RISK-${value.toString().padStart(8, "0")}`;
}

async function createRiskCase(ruleMap: RuleMap, candidate: RiskCandidate): Promise<boolean> {
  const rule = ruleMap.get(candidate.type);
  if (!rule?.isActive) return false;
  const fingerprint = sha256(`${rule.code}:${candidate.subject}`);
  const exists = await db.businessRiskCase.findUnique({ where: { fingerprint }, select: { id: true } });
  if (exists) return false;
  try {
    await runSerializableTransaction(async (tx) => {
      const created = await tx.businessRiskCase.create({
        data: {
          caseNumber: await nextRiskCaseNumber(tx),
          ruleId: rule.id,
          fingerprint,
          organizationId: candidate.organizationId ?? null,
          partnerProfileId: candidate.partnerProfileId ?? null,
          attributionId: candidate.attributionId ?? null,
          partnerLeadId: candidate.partnerLeadId ?? null,
          commissionEntryId: candidate.commissionEntryId ?? null,
          orderId: candidate.orderId ?? null,
          severity: rule.severity,
          riskScore: rule.riskScore,
          title: candidate.title,
          summary: candidate.summary,
          evidence: candidate.evidence,
        },
      });
      await writeBusinessAudit({
        tx,
        organizationId: created.organizationId,
        actorUserId: null,
        action: BUSINESS_AUDIT_ACTIONS.riskCaseDetected,
        entityType: "BusinessRiskCase",
        entityId: created.id,
        after: {
          caseNumber: created.caseNumber,
          ruleCode: rule.code,
          severity: created.severity,
          riskScore: created.riskScore,
          fingerprint: created.fingerprint,
        },
      });
    });
    return true;
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") return false;
    throw error;
  }
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string | null): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const value = key(row);
    if (!value) continue;
    grouped.set(value, [...(grouped.get(value) ?? []), row]);
  }
  return grouped;
}

export async function runBusinessFraudScan(input: { maxCases?: number } = {}) {
  const maxCases = Math.min(500, Math.max(1, input.maxCases ?? 100));
  const since30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rules = await db.businessFraudRule.findMany({ where: { isActive: true } });
  const ruleMap = new Map(rules.map((rule) => [rule.type, rule])) as RuleMap;
  const [attributions, leads, commissions] = await Promise.all([
    db.partnerAttribution.findMany({
      where: { capturedAt: { gte: since30Days } },
      take: 2000,
      orderBy: { capturedAt: "desc" },
      include: {
        partnerProfile: {
          select: {
            id: true,
            organizationId: true,
            organization: {
              select: {
                email: true,
                phone: true,
                members: { where: { status: "ACTIVE" }, select: { userId: true } },
              },
            },
          },
        },
        order: {
          select: {
            id: true,
            userId: true,
            organizationId: true,
            email: true,
            phone_number: true,
            status: true,
            paymentStatus: true,
            refunds: { where: { status: "COMPLETED" }, select: { id: true } },
          },
        },
      },
    }),
    db.partnerLead.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
      take: 2000,
      orderBy: { createdAt: "desc" },
      select: { id: true, partnerProfileId: true, contactEmail: true, contactPhone: true, createdAt: true, partnerProfile: { select: { organizationId: true } } },
    }),
    db.commissionEntry.findMany({
      where: { createdAt: { gte: since30Days }, type: "EARNING" },
      take: 3000,
      orderBy: { createdAt: "desc" },
      select: { id: true, partnerProfileId: true, amount: true, createdAt: true, orderId: true, partnerProfile: { select: { organizationId: true } } },
    }),
  ]);

  const candidates: RiskCandidate[] = [];
  for (const attribution of attributions) {
    const organization = attribution.partnerProfile.organization;
    const memberUserIds = new Set(organization.members.map((member) => member.userId));
    const order = attribution.order;
    if (attribution.customerUserId && memberUserIds.has(attribution.customerUserId)) {
      candidates.push({ type: "SELF_REFERRAL", subject: attribution.id, organizationId: attribution.partnerProfile.organizationId, partnerProfileId: attribution.partnerProfileId, attributionId: attribution.id, orderId: order?.id, title: "Self-referral identity match", summary: "The attributed customer belongs to the referring partner organization.", evidence: { attributionId: attribution.id, identityMatch: "ORGANIZATION_MEMBER" } });
    }
    if (order?.organizationId && order.organizationId === attribution.partnerProfile.organizationId) {
      candidates.push({ type: "SAME_ORGANIZATION", subject: attribution.id, organizationId: order.organizationId, partnerProfileId: attribution.partnerProfileId, attributionId: attribution.id, orderId: order.id, title: "Partner and buyer organization match", summary: "The referred order belongs to the referring partner organization.", evidence: { attributionId: attribution.id, orderId: order.id, organizationMatch: true } });
    }
    if (order?.userId && memberUserIds.has(order.userId)) {
      candidates.push({ type: "SAME_USER", subject: attribution.id, organizationId: attribution.partnerProfile.organizationId, partnerProfileId: attribution.partnerProfileId, attributionId: attribution.id, orderId: order.id, title: "Partner member placed referred order", summary: "The referred order user is an active member of the partner organization.", evidence: { attributionId: attribution.id, orderId: order.id, userMatch: true } });
    }
    const orderEmail = normalizeEmail(order?.email);
    const organizationEmail = normalizeEmail(organization.email);
    if (orderEmail && organizationEmail && orderEmail === organizationEmail) {
      candidates.push({ type: "SAME_EMAIL", subject: attribution.id, organizationId: attribution.partnerProfile.organizationId, partnerProfileId: attribution.partnerProfileId, attributionId: attribution.id, orderId: order?.id, title: "Referral email identity match", summary: "The referred order email matches the partner organization email.", evidence: { attributionId: attribution.id, identityHash: sha256(orderEmail), match: "EMAIL" } });
    }
    const orderPhone = normalizePhone(order?.phone_number);
    const organizationPhone = normalizePhone(organization.phone);
    if (orderPhone && organizationPhone && orderPhone === organizationPhone) {
      candidates.push({ type: "SAME_PHONE", subject: attribution.id, organizationId: attribution.partnerProfile.organizationId, partnerProfileId: attribution.partnerProfileId, attributionId: attribution.id, orderId: order?.id, title: "Referral phone identity match", summary: "The referred order phone matches the partner organization phone.", evidence: { attributionId: attribution.id, identityHash: sha256(orderPhone), match: "PHONE" } });
    }
  }

  for (const [identityHash, matchingLeads] of [
    ...groupBy(leads, (lead) => normalizeEmail(lead.contactEmail) ? sha256(`email:${normalizeEmail(lead.contactEmail)}`) : null),
    ...groupBy(leads, (lead) => normalizePhone(lead.contactPhone) ? sha256(`phone:${normalizePhone(lead.contactPhone)}`) : null),
  ]) {
    if (matchingLeads.length < 2) continue;
    const latest = matchingLeads[0];
    candidates.push({ type: "DUPLICATE_LEAD", subject: latest.id, organizationId: latest.partnerProfile.organizationId, partnerProfileId: latest.partnerProfileId, partnerLeadId: latest.id, title: "Duplicate partner lead identity", summary: "Multiple partner leads share a normalized contact identity.", evidence: { identityHash, matchingLeadIds: matchingLeads.slice(0, 20).map((lead) => lead.id), matchCount: matchingLeads.length } });
  }

  const attributionByPartner = groupBy(attributions, (row) => row.partnerProfileId);
  for (const [partnerProfileId, rows] of attributionByPartner) {
    const organizationId = rows[0]?.partnerProfile.organizationId;
    const cancelled = rows.filter((row) => row.order?.status === "CANCELLED");
    if (cancelled.length >= 3) candidates.push({ type: "REPEATED_CANCELLED_REFERRALS", subject: `${partnerProfileId}:${since30Days.toISOString().slice(0, 10)}`, organizationId, partnerProfileId, title: "Repeated cancelled referral orders", summary: "At least three referred orders were cancelled during the review window.", evidence: { windowDays: 30, count: cancelled.length, attributionIds: cancelled.slice(0, 20).map((row) => row.id) } });
    const refunded = rows.filter((row) => (row.order?.refunds.length ?? 0) > 0 || row.order?.paymentStatus === "REFUNDED");
    if (refunded.length >= 3) candidates.push({ type: "REPEATED_REFUND_REFERRALS", subject: `${partnerProfileId}:${since30Days.toISOString().slice(0, 10)}`, organizationId, partnerProfileId, title: "Repeated refunded referral orders", summary: "At least three referred orders were refunded during the review window.", evidence: { windowDays: 30, count: refunded.length, attributionIds: refunded.slice(0, 20).map((row) => row.id) } });
    const converted = rows.filter((row) => row.convertedAt || row.orderId).length;
    if (rows.length >= 5 && converted / rows.length >= 0.8) candidates.push({ type: "UNUSUAL_CONVERSION_RATE", subject: `${partnerProfileId}:${since30Days.toISOString().slice(0, 10)}`, organizationId, partnerProfileId, title: "Unusual referral conversion rate", summary: "Partner conversion rate exceeded the configured review threshold.", evidence: { windowDays: 30, attributions: rows.length, converted, ratePercent: Math.round((converted / rows.length) * 100) } });
  }

  for (const [ipHash, rows] of groupBy(attributions, (row) => row.ipHash)) {
    if (rows.length >= 10) candidates.push({ type: "SUSPICIOUS_IP", subject: `${ipHash}:${new Date().toISOString().slice(0, 10)}`, organizationId: rows[0]?.partnerProfile.organizationId, partnerProfileId: rows[0]?.partnerProfileId, title: "Suspicious referral network volume", summary: "A hashed network identity generated unusual referral volume.", evidence: { ipHash: `${ipHash.slice(0, 12)}…`, count: rows.length, windowDays: 30 } });
  }
  for (const [deviceHash, rows] of groupBy(attributions, (row) => row.deviceHash)) {
    if (rows.length >= 10) candidates.push({ type: "SUSPICIOUS_DEVICE", subject: `${deviceHash}:${new Date().toISOString().slice(0, 10)}`, organizationId: rows[0]?.partnerProfile.organizationId, partnerProfileId: rows[0]?.partnerProfileId, title: "Suspicious referral device volume", summary: "A hashed device identity generated unusual referral volume.", evidence: { deviceHash: `${deviceHash.slice(0, 12)}…`, count: rows.length, windowDays: 30 } });
  }

  for (const entry of commissions) {
    if (entry.amount.greaterThanOrEqualTo(100000)) candidates.push({ type: "COMMISSION_SPIKE", subject: entry.id, organizationId: entry.partnerProfile.organizationId, partnerProfileId: entry.partnerProfileId, commissionEntryId: entry.id, orderId: entry.orderId, title: "High-value commission spike", summary: "A single commission entry exceeded the automatic review threshold.", evidence: { commissionEntryId: entry.id, amount: entry.amount.toFixed(2), threshold: "100000.00" } });
  }

  let created = 0;
  for (const candidate of candidates) {
    if (created >= maxCases) break;
    if (await createRiskCase(ruleMap, candidate)) created += 1;
  }
  return { scanned: { attributions: attributions.length, leads: leads.length, commissions: commissions.length }, candidates: candidates.length, created };
}

function riskPageInput(url: URL) {
  return { page: Math.max(1, Number(url.searchParams.get("page")) || 1), limit: Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 25)) };
}

export async function listBusinessRiskCases(url: URL) {
  const page = riskPageInput(url);
  const requestedStatus = url.searchParams.get("status")?.trim().toUpperCase();
  const status = requestedStatus && Object.values(BusinessRiskCaseStatus).includes(requestedStatus as BusinessRiskCaseStatus) ? requestedStatus as BusinessRiskCaseStatus : null;
  const search = url.searchParams.get("search")?.trim().slice(0, 160) || null;
  const where: Prisma.BusinessRiskCaseWhereInput = {
    ...(status ? { status } : {}),
    ...(search ? { OR: [{ caseNumber: { contains: search, mode: "insensitive" } }, { title: { contains: search, mode: "insensitive" } }, { organization: { legalName: { contains: search, mode: "insensitive" } } }] } : {}),
  };
  const [items, total, statusCounts] = await Promise.all([
    db.businessRiskCase.findMany({
      where,
      skip: (page.page - 1) * page.limit,
      take: page.limit,
      orderBy: [{ severity: "desc" }, { detectedAt: "desc" }],
      include: {
        rule: { select: { code: true, type: true, name: true } },
        organization: { select: { id: true, code: true, legalName: true } },
        partnerProfile: { select: { id: true, partnerCode: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    }),
    db.businessRiskCase.count({ where }),
    db.businessRiskCase.groupBy({ by: ["status"], _count: { id: true } }),
  ]);
  return { items, statusCounts: Object.fromEntries(statusCounts.map((row) => [row.status, row._count.id])), pagination: { ...page, total, pages: Math.ceil(total / page.limit) } };
}

const transitionMap = {
  START_REVIEW: { allowed: ["OPEN"], next: "UNDER_REVIEW", action: BUSINESS_AUDIT_ACTIONS.riskCaseReviewStarted },
  CONFIRM: { allowed: ["UNDER_REVIEW"], next: "CONFIRMED", action: BUSINESS_AUDIT_ACTIONS.riskCaseConfirmed },
  FALSE_POSITIVE: { allowed: ["OPEN", "UNDER_REVIEW"], next: "FALSE_POSITIVE", action: BUSINESS_AUDIT_ACTIONS.riskCaseFalsePositive },
  RESOLVE: { allowed: ["CONFIRMED"], next: "RESOLVED", action: BUSINESS_AUDIT_ACTIONS.riskCaseResolved },
} as const;

export async function decideBusinessRiskCase(input: { caseId: string; actorUserId: string; body: unknown; request: Request }) {
  const decision = businessRiskDecisionSchema.parse(input.body);
  const transition = transitionMap[decision.action];
  return runSerializableTransaction(async (tx) => {
    const before = await tx.businessRiskCase.findUnique({ where: { id: input.caseId } });
    if (!before) throw new BusinessNetworkError(404, "BUSINESS_RISK_CASE_NOT_FOUND", "Risk case not found.");
    if (!(transition.allowed as readonly string[]).includes(before.status)) throw new BusinessNetworkError(409, "INVALID_RISK_CASE_TRANSITION", `Cannot ${decision.action.toLowerCase().replaceAll("_", " ")} a ${before.status.toLowerCase().replaceAll("_", " ")} risk case.`);
    const now = new Date();
    const nextStatus = transition.next as BusinessRiskCaseStatus;
    const updated = await tx.businessRiskCase.update({
      where: { id: before.id },
      data: decision.action === "START_REVIEW"
        ? { status: nextStatus, assignedToUserId: decision.assignedToUserId ?? input.actorUserId, reviewedByUserId: input.actorUserId, reviewedAt: now }
        : { status: nextStatus, reviewedByUserId: input.actorUserId, reviewedAt: before.reviewedAt ?? now, resolutionNote: decision.note, ...(decision.action === "FALSE_POSITIVE" || decision.action === "RESOLVE" ? { resolvedAt: now } : {}) },
    });
    await writeBusinessAudit({ tx, request: input.request, organizationId: updated.organizationId, actorUserId: input.actorUserId, action: transition.action, entityType: "BusinessRiskCase", entityId: updated.id, before, after: updated });
    return updated;
  });
}

