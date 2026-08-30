import "server-only";

import { createHmac } from "node:crypto";
import type { Prisma } from "@/generated/prisma";
import { getClientIp } from "@/lib/request-security";
import { sanitizeBusinessAuditValue } from "./audit-sanitization";

export const BUSINESS_AUDIT_ACTIONS = {
  organizationApplicationCreated: "ORGANIZATION_APPLICATION_CREATED",
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
  salesRfqCreated: "SALES_RFQ_CREATED",
  salesRfqUpdated: "SALES_RFQ_UPDATED",
  salesRfqSubmitted: "SALES_RFQ_SUBMITTED",
  salesRfqCancelled: "SALES_RFQ_CANCELLED",
  salesRfqAssigned: "SALES_RFQ_ASSIGNED",
  salesRfqRejected: "SALES_RFQ_REJECTED",
  salesRfqClosed: "SALES_RFQ_CLOSED",
  salesRfqAttachmentAdded: "SALES_RFQ_ATTACHMENT_ADDED",
  salesRfqAttachmentRemoved: "SALES_RFQ_ATTACHMENT_REMOVED",
  salesQuotationCreated: "SALES_QUOTATION_CREATED",
  salesQuotationVersionCreated: "SALES_QUOTATION_VERSION_CREATED",
  salesQuotationSubmittedReview: "SALES_QUOTATION_SUBMITTED_REVIEW",
  salesQuotationApproved: "SALES_QUOTATION_APPROVED",
  salesQuotationSent: "SALES_QUOTATION_SENT",
  salesQuotationViewed: "SALES_QUOTATION_VIEWED",
  salesQuotationAccepted: "SALES_QUOTATION_ACCEPTED",
  salesQuotationRejected: "SALES_QUOTATION_REJECTED",
  salesQuotationExpired: "SALES_QUOTATION_EXPIRED",
  salesQuotationCancelled: "SALES_QUOTATION_CANCELLED",
  customerPurchaseOrderCreated: "CUSTOMER_PURCHASE_ORDER_CREATED",
  customerPurchaseOrderCancelled: "CUSTOMER_PURCHASE_ORDER_CANCELLED",
  customerPurchaseOrderVerified: "CUSTOMER_PURCHASE_ORDER_VERIFIED",
  customerPurchaseOrderRejected: "CUSTOMER_PURCHASE_ORDER_REJECTED",
  customerPurchaseOrderConverted: "CUSTOMER_PURCHASE_ORDER_CONVERTED",
  partnerProfileApplied: "PARTNER_PROFILE_APPLIED",
  partnerProfileApproved: "PARTNER_PROFILE_APPROVED",
  partnerProfileRejected: "PARTNER_PROFILE_REJECTED",
  partnerProfileSuspended: "PARTNER_PROFILE_SUSPENDED",
  partnerProfileReactivated: "PARTNER_PROFILE_REACTIVATED",
  partnerAgreementCreated: "PARTNER_AGREEMENT_CREATED",
  partnerAgreementVersionCreated: "PARTNER_AGREEMENT_VERSION_CREATED",
  partnerAgreementSubmitted: "PARTNER_AGREEMENT_SUBMITTED",
  partnerAgreementApproved: "PARTNER_AGREEMENT_APPROVED",
  partnerAgreementSuspended: "PARTNER_AGREEMENT_SUSPENDED",
  partnerAgreementTerminated: "PARTNER_AGREEMENT_TERMINATED",
  partnerAssetCreated: "PARTNER_ASSET_CREATED",
  partnerAssetUpdated: "PARTNER_ASSET_UPDATED",
  partnerAssetDisabled: "PARTNER_ASSET_DISABLED",
  partnerAttributionCaptured: "PARTNER_ATTRIBUTION_CAPTURED",
  partnerAttributionConverted: "PARTNER_ATTRIBUTION_CONVERTED",
  partnerAttributionExpired: "PARTNER_ATTRIBUTION_EXPIRED",
  partnerAttributionRejected: "PARTNER_ATTRIBUTION_REJECTED",
  partnerLeadCreated: "PARTNER_LEAD_CREATED",
  partnerLeadAccepted: "PARTNER_LEAD_ACCEPTED",
  partnerLeadMarkedDuplicate: "PARTNER_LEAD_MARKED_DUPLICATE",
  partnerLeadAssigned: "PARTNER_LEAD_ASSIGNED",
  partnerLeadWon: "PARTNER_LEAD_WON",
  partnerLeadLost: "PARTNER_LEAD_LOST",
  partnerLeadRejected: "PARTNER_LEAD_REJECTED",
  commissionPlanCreated: "COMMISSION_PLAN_CREATED",
  commissionPlanUpdated: "COMMISSION_PLAN_UPDATED",
  commissionRuleCreated: "COMMISSION_RULE_CREATED",
  commissionRuleUpdated: "COMMISSION_RULE_UPDATED",
  commissionRuleRemoved: "COMMISSION_RULE_REMOVED",
  commissionCalculated: "COMMISSION_CALCULATED",
  commissionHeld: "COMMISSION_HELD",
  commissionApproved: "COMMISSION_APPROVED",
  commissionCancelled: "COMMISSION_CANCELLED",
  commissionReversed: "COMMISSION_REVERSED",
  commissionAdjusted: "COMMISSION_ADJUSTED",
  partnerSettlementCreated: "PARTNER_SETTLEMENT_CREATED",
  partnerSettlementSubmitted: "PARTNER_SETTLEMENT_SUBMITTED",
  partnerSettlementApproved: "PARTNER_SETTLEMENT_APPROVED",
  partnerSettlementProcessing: "PARTNER_SETTLEMENT_PROCESSING",
  partnerSettlementFailed: "PARTNER_SETTLEMENT_FAILED",
  partnerSettlementPaid: "PARTNER_SETTLEMENT_PAID",
  partnerSettlementCancelled: "PARTNER_SETTLEMENT_CANCELLED",
  partnerPayoutAccountCreated: "PARTNER_PAYOUT_ACCOUNT_CREATED",
  partnerPayoutAccountUpdated: "PARTNER_PAYOUT_ACCOUNT_UPDATED",
  partnerPayoutAccountDisabled: "PARTNER_PAYOUT_ACCOUNT_DISABLED",
  partnerPayoutAccountVerified: "PARTNER_PAYOUT_ACCOUNT_VERIFIED",
  partnerPayoutAccountRejected: "PARTNER_PAYOUT_ACCOUNT_REJECTED",
} as const;

type BusinessAuditAction =
  (typeof BUSINESS_AUDIT_ACTIONS)[keyof typeof BUSINESS_AUDIT_ACTIONS];

type AuditInput = {
  tx: Prisma.TransactionClient;
  request?: Request | null;
  organizationId?: string | null;
  memberId?: string | null;
  actorUserId: string | null;
  action: BusinessAuditAction;
  entityType:
    | "Organization"
    | "OrganizationInvitation"
    | "OrganizationMember"
    | "BusinessAccount"
    | "BusinessPricingTier"
    | "BusinessPricingRule"
    | "ContractPrice"
    | "OrganizationCreditAccount"
    | "CreditLedgerEntry"
    | "SalesRfq"
    | "SalesRfqAttachment"
    | "SalesQuotation"
    | "SalesQuotationVersion"
    | "CustomerPurchaseOrder"
    | "Order"
    | "PartnerProfile"
    | "PartnerAgreement"
    | "PartnerAgreementVersion"
    | "PartnerAsset"
    | "PartnerAttribution"
    | "PartnerLead"
    | "CommissionPlan"
    | "CommissionRule"
    | "CommissionEntry"
    | "PartnerSettlement"
    | "PartnerPayoutAccount";
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
