import "server-only";

import { createHmac } from "node:crypto";
import type { Prisma } from "@/generated/prisma";
import { getClientIp } from "@/lib/request-security";
import { sanitizeBusinessAuditValue } from "./audit-sanitization";

export const BUSINESS_AUDIT_ACTIONS = {
  invitationCreated: "ORGANIZATION_INVITATION_CREATED",
  invitationRevoked: "ORGANIZATION_INVITATION_REVOKED",
  invitationAccepted: "ORGANIZATION_INVITATION_ACCEPTED",
  memberRolesUpdated: "ORGANIZATION_MEMBER_ROLES_UPDATED",
  memberStatusUpdated: "ORGANIZATION_MEMBER_STATUS_UPDATED",
  businessAccountCreated: "BUSINESS_ACCOUNT_CREATED",
  businessAccountUpdated: "BUSINESS_ACCOUNT_UPDATED",
  pricingTierCreated: "BUSINESS_PRICING_TIER_CREATED",
  pricingTierUpdated: "BUSINESS_PRICING_TIER_UPDATED",
  pricingRuleCreated: "BUSINESS_PRICING_RULE_CREATED",
  pricingRuleUpdated: "BUSINESS_PRICING_RULE_UPDATED",
  pricingRuleRemoved: "BUSINESS_PRICING_RULE_REMOVED",
  contractPriceCreated: "CONTRACT_PRICE_CREATED",
  contractPriceUpdated: "CONTRACT_PRICE_UPDATED",
  creditAccountProvisioned: "ORGANIZATION_CREDIT_ACCOUNT_PROVISIONED",
  creditLimitSet: "ORGANIZATION_CREDIT_LIMIT_SET",
  creditLedgerAdjusted: "ORGANIZATION_CREDIT_LEDGER_ADJUSTED",
} as const;

type BusinessAuditAction =
  (typeof BUSINESS_AUDIT_ACTIONS)[keyof typeof BUSINESS_AUDIT_ACTIONS];

type AuditInput = {
  tx: Prisma.TransactionClient;
  request?: Request | null;
  organizationId?: string | null;
  memberId?: string | null;
  actorUserId: string;
  action: BusinessAuditAction;
  entityType:
    | "OrganizationInvitation"
    | "OrganizationMember"
    | "BusinessAccount"
    | "BusinessPricingTier"
    | "BusinessPricingRule"
    | "ContractPrice"
    | "OrganizationCreditAccount"
    | "CreditLedgerEntry";
  entityId: string;
  before?: unknown;
  after?: unknown;
};

function asJsonInput(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return sanitizeBusinessAuditValue(value) as Prisma.InputJsonValue;
}

function hashRequestIp(request?: Request | null): string | null {
  if (!request) return null;
  const ip = getClientIp(request);
  if (!ip || ip === "unknown") return null;
  const key =
    process.env.BUSINESS_AUDIT_IP_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "development-business-audit-key";
  return createHmac("sha256", key).update(ip, "utf8").digest("hex");
}

export async function writeBusinessAudit(input: AuditInput): Promise<void> {
  await input.tx.businessAuditLog.create({
    data: {
      organizationId: input.organizationId ?? null,
      memberId: input.memberId ?? null,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: asJsonInput(input.before),
      after: asJsonInput(input.after),
      ipHash: hashRequestIp(input.request),
      userAgent: input.request?.headers.get("user-agent")?.trim().slice(0, 512) || null,
    },
  });
}
