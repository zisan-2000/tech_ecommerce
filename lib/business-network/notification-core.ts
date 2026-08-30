import "server-only";

import type {
  BusinessNotificationCategory,
  BusinessNotificationPriority,
  Prisma,
} from "@/generated/prisma";

type NotificationTemplate = {
  category: BusinessNotificationCategory;
  priority: BusinessNotificationPriority;
  title: string;
  body: string;
  actionUrl: string;
};

const ACTION_TEMPLATES: Record<string, NotificationTemplate> = {
  ORGANIZATION_VERIFIED: { category: "ORGANIZATION", priority: "HIGH", title: "Organization verified", body: "Your organization verification is complete and approved capabilities are now available.", actionUrl: "/business/organization" },
  ORGANIZATION_REJECTED: { category: "ORGANIZATION", priority: "HIGH", title: "Organization review needs attention", body: "Your organization application was not approved. Review the organization record for the decision details.", actionUrl: "/business/organization" },
  ORGANIZATION_SUSPENDED: { category: "SECURITY", priority: "URGENT", title: "Organization access suspended", body: "Business access for this organization has been suspended. Contact support before continuing sensitive workflows.", actionUrl: "/business/settings" },
  ORGANIZATION_CAPABILITY_UPDATED: { category: "ORGANIZATION", priority: "NORMAL", title: "Business capability updated", body: "An organization capability was updated by the business administration team.", actionUrl: "/business/organization" },
  ORGANIZATION_DOCUMENT_VERIFIED: { category: "ORGANIZATION", priority: "NORMAL", title: "Organization document verified", body: "A submitted organization document has been verified.", actionUrl: "/business/organization/documents" },
  ORGANIZATION_DOCUMENT_REJECTED: { category: "ORGANIZATION", priority: "HIGH", title: "Organization document rejected", body: "A submitted organization document needs correction. Review the document decision.", actionUrl: "/business/organization/documents" },
  ORGANIZATION_INVITATION_CREATED: { category: "ORGANIZATION", priority: "NORMAL", title: "Team invitation created", body: "A new member invitation was created for your organization.", actionUrl: "/business/organization/members" },
  ORGANIZATION_MEMBER_ROLES_UPDATED: { category: "SECURITY", priority: "HIGH", title: "Member access changed", body: "Portal roles were updated for an organization member.", actionUrl: "/business/organization/members" },
  ORGANIZATION_MEMBER_STATUS_UPDATED: { category: "SECURITY", priority: "HIGH", title: "Member status changed", body: "The access status of an organization member was updated.", actionUrl: "/business/organization/members" },
  SALES_RFQ_SUBMITTED: { category: "SALES", priority: "NORMAL", title: "RFQ submitted", body: "Your request for quotation was submitted successfully.", actionUrl: "/business/rfqs" },
  SALES_RFQ_ASSIGNED: { category: "SALES", priority: "NORMAL", title: "RFQ under review", body: "Your RFQ has been assigned to the business sales team.", actionUrl: "/business/rfqs" },
  SALES_RFQ_REJECTED: { category: "SALES", priority: "HIGH", title: "RFQ rejected", body: "A submitted RFQ was rejected. Open it to review the decision.", actionUrl: "/business/rfqs" },
  SALES_RFQ_CLOSED: { category: "SALES", priority: "NORMAL", title: "RFQ closed", body: "A request for quotation has been closed.", actionUrl: "/business/rfqs" },
  SALES_QUOTATION_SENT: { category: "SALES", priority: "HIGH", title: "New quotation available", body: "A sales quotation is ready for your review.", actionUrl: "/business/quotations" },
  SALES_QUOTATION_APPROVED: { category: "SALES", priority: "NORMAL", title: "Quotation approved internally", body: "A quotation passed internal approval and is being prepared for issue.", actionUrl: "/business/quotations" },
  SALES_QUOTATION_EXPIRED: { category: "SALES", priority: "HIGH", title: "Quotation expired", body: "A quotation has reached its validity deadline.", actionUrl: "/business/quotations" },
  SALES_QUOTATION_CANCELLED: { category: "SALES", priority: "HIGH", title: "Quotation cancelled", body: "A quotation was cancelled and is no longer available for acceptance.", actionUrl: "/business/quotations" },
  CUSTOMER_PURCHASE_ORDER_VERIFIED: { category: "SALES", priority: "HIGH", title: "Purchase order verified", body: "Your customer purchase order passed verification.", actionUrl: "/business/purchase-orders" },
  CUSTOMER_PURCHASE_ORDER_REJECTED: { category: "SALES", priority: "HIGH", title: "Purchase order rejected", body: "Your customer purchase order needs attention. Review the decision details.", actionUrl: "/business/purchase-orders" },
  CUSTOMER_PURCHASE_ORDER_CONVERTED: { category: "SALES", priority: "HIGH", title: "Purchase order converted", body: "Your verified customer PO was converted into a business order.", actionUrl: "/business/orders" },
  PARTNER_PROFILE_APPROVED: { category: "PARTNERSHIP", priority: "HIGH", title: "Partner application approved", body: "Your partner profile is active.", actionUrl: "/business/partner" },
  PARTNER_PROFILE_REJECTED: { category: "PARTNERSHIP", priority: "HIGH", title: "Partner application rejected", body: "Your partner application was not approved. Review the decision details.", actionUrl: "/business/partner" },
  PARTNER_PROFILE_SUSPENDED: { category: "SECURITY", priority: "URGENT", title: "Partner profile suspended", body: "Your partner profile has been suspended pending review.", actionUrl: "/business/partner" },
  PARTNER_LEAD_ACCEPTED: { category: "PARTNERSHIP", priority: "NORMAL", title: "Lead accepted", body: "A registered partner lead was accepted.", actionUrl: "/business/partner/leads" },
  PARTNER_LEAD_MARKED_DUPLICATE: { category: "PARTNERSHIP", priority: "HIGH", title: "Duplicate lead detected", body: "A registered lead was identified as a duplicate.", actionUrl: "/business/partner/leads" },
  PARTNER_LEAD_WON: { category: "PARTNERSHIP", priority: "HIGH", title: "Lead converted", body: "A partner lead was marked won and linked to an order.", actionUrl: "/business/partner/leads" },
  PARTNER_LEAD_LOST: { category: "PARTNERSHIP", priority: "NORMAL", title: "Lead marked lost", body: "A registered partner lead was marked lost.", actionUrl: "/business/partner/leads" },
  COMMISSION_HELD: { category: "FINANCE", priority: "NORMAL", title: "Commission on hold", body: "A commission entry is waiting for its return-window review.", actionUrl: "/business/partner/commissions" },
  COMMISSION_APPROVED: { category: "FINANCE", priority: "HIGH", title: "Commission approved", body: "A commission entry was approved for settlement eligibility.", actionUrl: "/business/partner/commissions" },
  COMMISSION_CANCELLED: { category: "FINANCE", priority: "HIGH", title: "Commission cancelled", body: "A commission entry was cancelled. Review the commission ledger for evidence.", actionUrl: "/business/partner/commissions" },
  COMMISSION_REVERSED: { category: "FINANCE", priority: "HIGH", title: "Commission reversed", body: "A commission correction was recorded as an immutable reversal.", actionUrl: "/business/partner/commissions" },
  PARTNER_SETTLEMENT_SUBMITTED: { category: "FINANCE", priority: "NORMAL", title: "Settlement submitted", body: "A partner settlement was submitted for approval.", actionUrl: "/business/partner/settlements" },
  PARTNER_SETTLEMENT_APPROVED: { category: "FINANCE", priority: "HIGH", title: "Settlement approved", body: "A partner settlement was approved for payout processing.", actionUrl: "/business/partner/settlements" },
  PARTNER_SETTLEMENT_PROCESSING: { category: "FINANCE", priority: "NORMAL", title: "Payout processing", body: "An approved partner settlement is being processed.", actionUrl: "/business/partner/settlements" },
  PARTNER_SETTLEMENT_FAILED: { category: "FINANCE", priority: "URGENT", title: "Settlement processing failed", body: "A settlement payout attempt failed and requires review.", actionUrl: "/business/partner/settlements" },
  PARTNER_SETTLEMENT_PAID: { category: "FINANCE", priority: "HIGH", title: "Settlement paid", body: "A partner settlement has been paid successfully.", actionUrl: "/business/partner/settlements" },
  PARTNER_SETTLEMENT_CANCELLED: { category: "FINANCE", priority: "HIGH", title: "Settlement cancelled", body: "A partner settlement was cancelled. Review the settlement evidence.", actionUrl: "/business/partner/settlements" },
  PARTNER_PAYOUT_ACCOUNT_VERIFIED: { category: "FINANCE", priority: "HIGH", title: "Payout account verified", body: "Your payout destination was verified.", actionUrl: "/business/partner/payout-accounts" },
  PARTNER_PAYOUT_ACCOUNT_REJECTED: { category: "FINANCE", priority: "HIGH", title: "Payout account rejected", body: "A payout destination failed verification and needs correction.", actionUrl: "/business/partner/payout-accounts" },
};

function emailAllowed(category: BusinessNotificationCategory, preference: {
  emailEnabled: boolean;
  organizationEmail: boolean;
  salesEmail: boolean;
  financeEmail: boolean;
  partnershipEmail: boolean;
  securityEmail: boolean;
} | null): boolean {
  if (!preference) return true;
  if (!preference.emailEnabled) return false;
  if (category === "ORGANIZATION") return preference.organizationEmail;
  if (category === "SALES") return preference.salesEmail;
  if (category === "FINANCE") return preference.financeEmail;
  if (category === "PARTNERSHIP") return preference.partnershipEmail;
  if (category === "SECURITY") return preference.securityEmail;
  return true;
}

export async function publishNotificationForBusinessAudit(input: {
  tx: Prisma.TransactionClient;
  organizationId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  eventKey: string;
}): Promise<number> {
  if (!input.organizationId) return 0;
  const runtimeTx = input.tx as unknown as {
    organizationMember?: { findMany?: unknown };
    businessNotification?: { create?: unknown };
  };
  if (typeof runtimeTx.organizationMember?.findMany !== "function" || typeof runtimeTx.businessNotification?.create !== "function") return 0;
  const template = ACTION_TEMPLATES[input.action];
  if (!template) return 0;
  const members = await input.tx.organizationMember.findMany({
    where: { organizationId: input.organizationId, status: "ACTIVE" },
    select: {
      id: true,
      userId: true,
      user: { select: { email: true } },
      notificationPreference: {
        select: {
          emailEnabled: true,
          organizationEmail: true,
          salesEmail: true,
          financeEmail: true,
          partnershipEmail: true,
          securityEmail: true,
        },
      },
    },
  });
  let created = 0;
  for (const member of members) {
    const email = member.user.email.trim().toLowerCase();
    const queueEmail = Boolean(email) && emailAllowed(template.category, member.notificationPreference);
    await input.tx.businessNotification.create({
      data: {
        organizationId: input.organizationId,
        memberId: member.id,
        recipientUserId: member.userId,
        category: template.category,
        priority: template.priority,
        title: template.title,
        body: template.body,
        actionUrl: template.actionUrl,
        entityType: input.entityType,
        entityId: input.entityId,
        dedupeKey: `${input.eventKey}:${member.id}`.slice(0, 190),
        ...(queueEmail
          ? {
              deliveries: {
                create: {
                  channel: "EMAIL",
                  recipientAddress: email,
                },
              },
            }
          : {}),
      },
    });
    created += 1;
  }
  return created;
}
