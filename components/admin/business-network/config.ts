import type { BusinessResourceConfig } from "./types";
import { ORGANIZATION_STATUS_TRANSITIONS } from "@/lib/business-network/organization-lifecycle";

export const BUSINESS_NETWORK_PERMISSIONS = [
  "business.account.view", "business.account.manage", "business.pricing.view",
  "business.credit.view", "business.rfq.view", "business.quotation.view",
  "business.customer_po.view", "partner.profile.view", "partner.agreement.view",
  "partner.lead.view", "partner.commission.view", "partner.settlement.view",
  "partner.payout_account.view",
  "business.audit.view", "business.report.view",
] as const;

export const businessNetworkNavigation = [
  { label: "Overview", href: "/admin/business-network", permissions: ["business.account.view", "partner.profile.view"] },
  { label: "Organizations", href: "/admin/business-network/organizations", permissions: ["business.account.view", "business.account.manage"] },
  { label: "Corporate", href: "/admin/business-network/accounts", permissions: ["business.account.view", "business.rfq.view"] },
  { label: "Pricing", href: "/admin/business-network/pricing/tiers", permissions: ["business.pricing.view", "business.pricing.manage"] },
  { label: "Partners", href: "/admin/business-network/partners", permissions: ["partner.profile.view", "partner.agreement.view"] },
  { label: "Commission", href: "/admin/business-network/commission/ledger", permissions: ["partner.commission.view"] },
  { label: "Settlements", href: "/admin/business-network/settlements", permissions: ["partner.settlement.view"] },
  { label: "Governance", href: "/admin/business-network/risk", permissions: ["business.audit.view", "business.report.view"] },
] as const;

const reasonField = [{ name: "reason", label: "Reason", type: "textarea" as const, required: true }];

export const businessResources: Record<string, BusinessResourceConfig> = {
  organizations: {
    key: "organizations", title: "Organizations", description: "Verify and govern the master identity behind every corporate and partner relationship.",
    endpoint: "/api/admin/business-network/organizations", detailBasePath: "/admin/business-network/organizations", createHref: "/admin/business-network/organizations/new", createPermission: "business.account.manage", permission: "business.account.view",
    statuses: ["DRAFT", "PENDING_VERIFICATION", "ACTIVE", "SUSPENDED", "REJECTED", "CLOSED"],
    columns: [
      { label: "Code", path: "code" }, { label: "Organization", path: "legalName" },
      { label: "Status", path: "status", format: "status" }, { label: "Members", path: "_count.members", format: "count" },
      { label: "Orders", path: "_count.orders", format: "count" }, { label: "Created", path: "createdAt", format: "date" },
    ],
    detailRoot: "organization",
    actions: [
      { label: "Verify", slug: "verify", permission: "business.account.manage", allowedStatuses: ORGANIZATION_STATUS_TRANSITIONS.verify.allowed },
      { label: "Activate", slug: "activate", permission: "business.account.manage", allowedStatuses: ORGANIZATION_STATUS_TRANSITIONS.activate.allowed },
      { label: "Suspend", slug: "suspend", permission: "business.account.manage", tone: "danger", fields: reasonField, allowedStatuses: ORGANIZATION_STATUS_TRANSITIONS.suspend.allowed },
      { label: "Reject", slug: "reject", permission: "business.account.manage", tone: "danger", fields: reasonField, allowedStatuses: ORGANIZATION_STATUS_TRANSITIONS.reject.allowed },
    ],
    editForm: { label: "Organization", permission: "business.account.manage", fields: [
      { name: "legalName", label: "Legal name", required: true }, { name: "displayName", label: "Display name" }, { name: "companyType", label: "Company type", type: "select", required: true, options: ["PROPRIETORSHIP", "PARTNERSHIP", "LIMITED_COMPANY", "PUBLIC_LIMITED", "NGO", "GOVERNMENT", "EDUCATIONAL_INSTITUTION", "OTHER"] },
      { name: "email", label: "Email" }, { name: "phone", label: "Phone" }, { name: "website", label: "Website" }, { name: "tradeLicenseNo", label: "Trade license no." }, { name: "tin", label: "TIN" }, { name: "bin", label: "BIN" }, { name: "registrationNo", label: "Registration no." }, { name: "country", label: "Country", required: true }, { name: "currency", label: "Currency", required: true },
    ] },
  },
  accounts: {
    key: "accounts", title: "Business Accounts", description: "Corporate account status, payment terms, assigned pricing and available credit.",
    endpoint: "/api/admin/business-network/accounts", detailBasePath: "/admin/business-network/accounts", permission: "business.account.view",
    statuses: ["PENDING", "ACTIVE", "SUSPENDED", "CLOSED"],
    columns: [
      { label: "Account", path: "accountNumber" }, { label: "Organization", path: "organization.legalName" },
      { label: "Status", path: "status", format: "status" }, { label: "Pricing tier", path: "pricingTier.name" },
      { label: "Payment term", path: "paymentTermDays" }, { label: "Updated", path: "updatedAt", format: "date" },
    ], detailRoot: "account",
    createForm: { label: "Business account", permission: "business.account.manage", fields: [
      { name: "organizationId", label: "Organization ID", required: true }, { name: "accountNumber", label: "Account number", required: true },
      { name: "status", label: "Status", type: "select", required: true, options: ["PENDING", "ACTIVE", "SUSPENDED", "CLOSED"], defaultValue: "PENDING" },
      { name: "pricingTierId", label: "Pricing tier ID" }, { name: "accountManagerId", label: "Account manager user ID" },
      { name: "paymentTermDays", label: "Payment term days", type: "number", required: true, defaultValue: "0" },
      { name: "allowCredit", label: "Allow credit", type: "checkbox" }, { name: "allowCoupons", label: "Allow coupons", type: "checkbox" },
      { name: "requirePo", label: "Require customer PO", type: "checkbox" }, { name: "notes", label: "Internal notes", type: "textarea" },
    ] },
    editForm: { label: "Business account", permission: "business.account.manage", fields: [
      { name: "status", label: "Status", type: "select", options: ["PENDING", "ACTIVE", "SUSPENDED", "CLOSED"] }, { name: "pricingTierId", label: "Pricing tier ID" }, { name: "accountManagerId", label: "Account manager user ID" },
      { name: "paymentTermDays", label: "Payment term days", type: "number" }, { name: "allowCredit", label: "Allow credit", type: "checkbox" }, { name: "allowCoupons", label: "Allow coupons", type: "checkbox" }, { name: "requirePo", label: "Require customer PO", type: "checkbox" }, { name: "notes", label: "Internal notes", type: "textarea" },
    ] },
  },
  rfqs: {
    key: "rfqs", title: "Corporate RFQs", description: "Review, assign and resolve corporate requests for quotation.",
    endpoint: "/api/admin/business-network/rfqs", detailBasePath: "/admin/business-network/rfqs", permission: "business.rfq.view",
    statuses: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "QUOTED", "CLOSED", "REJECTED", "CANCELLED"],
    columns: [
      { label: "RFQ", path: "rfqNumber" }, { label: "Subject", path: "subject" }, { label: "Organization", path: "organization.legalName" },
      { label: "Status", path: "status", format: "status" }, { label: "Items", path: "_count.items", format: "count" }, { label: "Created", path: "createdAt", format: "date" },
    ], detailRoot: "rfq",
    actions: [
      { label: "Assign", slug: "assign", permission: "business.rfq.assign", fields: [{ name: "userId", label: "Internal user ID", required: true }] },
      { label: "Close", slug: "close", permission: "business.rfq.manage" },
      { label: "Reject", slug: "reject", permission: "business.rfq.manage", tone: "danger", fields: reasonField },
    ],
  },
  quotations: {
    key: "quotations", title: "Sales Quotations", description: "Versioned corporate quotations with maker-checker approval and issue controls.",
    endpoint: "/api/admin/business-network/quotations", detailBasePath: "/admin/business-network/quotations", createHref: "/admin/business-network/quotations/new", createPermission: "business.quotation.create", permission: "business.quotation.view",
    statuses: ["DRAFT", "INTERNAL_REVIEW", "SENT", "VIEWED", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"],
    columns: [
      { label: "Quotation", path: "quotationNumber" }, { label: "Organization", path: "organization.legalName" }, { label: "Status", path: "status", format: "status" },
      { label: "Version", path: "currentVersion.versionNumber" }, { label: "Total", path: "currentVersion.grandTotal", format: "money", currencyPath: "currentVersion.currency" }, { label: "Valid until", path: "validUntil", format: "date" },
    ], detailRoot: "quotation",
    actions: [
      { label: "Submit review", slug: "submit-review", permission: "business.quotation.update" },
      { label: "Approve", slug: "approve", permission: "business.quotation.approve" },
      { label: "Send", slug: "send", permission: "business.quotation.send" },
      { label: "Cancel", slug: "cancel", permission: "business.quotation.update", tone: "danger", fields: reasonField },
    ],
  },
  "customer-pos": {
    key: "customer-pos", title: "Customer Purchase Orders", description: "Validate customer PO evidence before safe conversion into a reserved order.",
    endpoint: "/api/admin/business-network/customer-pos", detailBasePath: "/admin/business-network/customer-pos", permission: "business.customer_po.view",
    statuses: ["SUBMITTED", "UNDER_REVIEW", "VERIFIED", "REJECTED", "CONVERTED", "CANCELLED"],
    columns: [
      { label: "PO number", path: "poNumber" }, { label: "Organization", path: "organization.legalName" }, { label: "Status", path: "status", format: "status" },
      { label: "Total", path: "totalAmount", format: "money", currencyPath: "currency" }, { label: "Quotation", path: "quotation.quotationNumber" }, { label: "Submitted", path: "submittedAt", format: "date" },
    ], detailRoot: "purchaseOrder",
    actions: [
      { label: "Verify", slug: "verify", permission: "business.customer_po.verify" },
      { label: "Convert to order", slug: "convert-to-order", permission: "business.customer_po.convert" },
      { label: "Reject", slug: "reject", permission: "business.customer_po.verify", tone: "danger", fields: reasonField },
    ],
  },
  orders: {
    key: "orders", title: "Business Orders", description: "Corporate, reseller and dealer orders linked to an organization.",
    endpoint: "/api/admin/business-network/orders", permission: "business.customer_po.view",
    columns: [
      { label: "Order", path: "id" }, { label: "Organization", path: "organization.legalName" }, { label: "Channel", path: "salesChannel", format: "status" },
      { label: "Status", path: "status", format: "status" }, { label: "Payment", path: "paymentStatus", format: "status" }, { label: "Total", path: "grand_total", format: "money", currencyPath: "currency" },
    ],
  },
  tiers: {
    key: "tiers", title: "Pricing Tiers", description: "Priority-based commercial tiers and their quantity-aware pricing rules.",
    endpoint: "/api/admin/business-network/pricing/tiers", detailBasePath: "/admin/business-network/pricing/tiers", permission: "business.pricing.view",
    columns: [
      { label: "Code", path: "code" }, { label: "Name", path: "name" }, { label: "Priority", path: "priority" },
      { label: "Active", path: "isActive", format: "status" }, { label: "Rules", path: "_count.rules", format: "count" }, { label: "Accounts", path: "_count.accounts", format: "count" },
    ], detailRoot: "tier",
    createForm: { label: "Pricing tier", permission: "business.pricing.manage", fields: [
      { name: "code", label: "Tier code", required: true }, { name: "name", label: "Tier name", required: true },
      { name: "priority", label: "Priority", type: "number", required: true, defaultValue: "100" }, { name: "isActive", label: "Active", type: "checkbox", defaultValue: "true" },
      { name: "description", label: "Description", type: "textarea" },
    ] },
    editForm: { label: "Pricing tier", permission: "business.pricing.manage", fields: [
      { name: "name", label: "Name", required: true }, { name: "priority", label: "Priority", type: "number", required: true }, { name: "isActive", label: "Active", type: "checkbox" }, { name: "description", label: "Description", type: "textarea" },
    ] },
  },
  contracts: {
    key: "contracts", title: "Contract Prices", description: "Account-specific negotiated prices with effective dates and quantity breaks.",
    endpoint: "/api/admin/business-network/pricing/contracts", permission: "business.pricing.view",
    columns: [
      { label: "Organization", path: "businessAccount.organization.legalName" }, { label: "Account", path: "businessAccount.accountNumber" }, { label: "Scope", path: "scopeType", format: "status" },
      { label: "Target", path: "targetKey" }, { label: "Unit price", path: "unitPrice", format: "money", currencyPath: "currency" }, { label: "Active", path: "isActive", format: "status" },
    ],
    createForm: { label: "Contract price", permission: "business.pricing.manage", fields: [
      { name: "businessAccountId", label: "Business account ID", required: true }, { name: "scopeType", label: "Scope", type: "select", required: true, options: ["GLOBAL", "PRODUCT", "VARIANT", "CATEGORY", "BRAND"], defaultValue: "GLOBAL" },
      { name: "productId", label: "Product ID", type: "number" }, { name: "variantId", label: "Variant ID", type: "number" }, { name: "categoryId", label: "Category ID", type: "number" }, { name: "brandId", label: "Brand ID", type: "number" },
      { name: "minQuantity", label: "Minimum quantity", type: "number", required: true, defaultValue: "1" }, { name: "unitPrice", label: "Unit price", type: "number", required: true },
      { name: "currency", label: "Currency", required: true, defaultValue: "BDT" }, { name: "startsAt", label: "Starts at", type: "date", required: true }, { name: "endsAt", label: "Ends at", type: "date" }, { name: "isActive", label: "Active", type: "checkbox", defaultValue: "true" },
    ] },
    rowActions: [{ label: "Deactivate or edit", slug: "", method: "PATCH", permission: "business.pricing.manage", fields: [
      { name: "unitPrice", label: "Unit price", type: "number" }, { name: "minQuantity", label: "Minimum quantity", type: "number" }, { name: "endsAt", label: "Ends at", type: "date" }, { name: "isActive", label: "Active", type: "select", options: ["true", "false"] },
    ] }],
  },
  credit: {
    key: "credit", title: "Corporate Credit", description: "Credit limits, outstanding balances, available credit and immutable ledger evidence.",
    endpoint: "/api/admin/business-network/credit", detailBasePath: "/admin/business-network/credit", permission: "business.credit.view",
    columns: [
      { label: "Account", path: "businessAccount.accountNumber" }, { label: "Organization", path: "businessAccount.organization.legalName" },
      { label: "Limit", path: "creditLimit", format: "money", currencyPath: "currency" }, { label: "Outstanding", path: "currentBalance", format: "money", currencyPath: "currency" },
      { label: "Available", path: "availableCredit", format: "money", currencyPath: "currency" }, { label: "Active", path: "isActive", format: "status" },
    ], detailRoot: "account",
    actions: [
      { label: "Set limit", slug: "set-limit", permission: "business.credit.manage", fields: [
        { name: "creditLimit", label: "Credit limit", type: "number", required: true }, { name: "paymentTermDays", label: "Payment term (days)", type: "number" },
      ] },
      { label: "Post adjustment", slug: "adjust", permission: "business.credit.adjust", fields: [
        { name: "adjustment", label: "Adjustment", type: "select", required: true, options: ["DEBIT", "CREDIT"] },
        { name: "amount", label: "Amount", type: "number", required: true }, { name: "description", label: "Description", type: "textarea", required: true },
        { name: "idempotencyKey", label: "Idempotency key", required: true },
      ] },
    ],
  },
  partners: {
    key: "partners", title: "Partner Profiles", description: "Review and govern affiliate, reseller, dealer and service partner eligibility.",
    endpoint: "/api/admin/business-network/partners", detailBasePath: "/admin/business-network/partners", permission: "partner.profile.view",
    statuses: ["APPLIED", "UNDER_REVIEW", "ACTIVE", "SUSPENDED", "REJECTED", "REVOKED"],
    columns: [
      { label: "Partner", path: "partnerCode" }, { label: "Organization", path: "organization.legalName" }, { label: "Status", path: "status", format: "status" },
      { label: "Manager", path: "accountManager.name" }, { label: "Created", path: "createdAt", format: "date" }, { label: "Updated", path: "updatedAt", format: "date" },
    ], detailRoot: "partnerProfile",
    actions: [
      { label: "Approve", slug: "approve", permission: "partner.profile.approve" }, { label: "Reactivate", slug: "reactivate", permission: "partner.profile.suspend" },
      { label: "Suspend", slug: "suspend", permission: "partner.profile.suspend", tone: "danger", fields: reasonField }, { label: "Reject", slug: "reject", permission: "partner.profile.approve", tone: "danger", fields: reasonField },
    ],
  },
  agreements: {
    key: "agreements", title: "Partner Agreements", description: "Immutable commercial agreement versions and approval lifecycle.",
    endpoint: "/api/admin/business-network/agreements", detailBasePath: "/admin/business-network/agreements", permission: "partner.agreement.view",
    statuses: ["DRAFT", "PENDING_APPROVAL", "ACTIVE", "SUSPENDED", "EXPIRED", "TERMINATED"],
    columns: [
      { label: "Agreement", path: "agreementNumber" }, { label: "Organization", path: "partnerProfile.organization.legalName" }, { label: "Status", path: "status", format: "status" },
      { label: "Start", path: "startsAt", format: "date" }, { label: "End", path: "endsAt", format: "date" }, { label: "Updated", path: "updatedAt", format: "date" },
    ], detailRoot: "agreement",
    actions: [
      { label: "Submit", slug: "submit", permission: "partner.agreement.manage" }, { label: "Approve", slug: "approve", permission: "partner.agreement.approve" },
      { label: "Suspend", slug: "suspend", permission: "partner.agreement.manage", tone: "danger", fields: reasonField }, { label: "Terminate", slug: "terminate", permission: "partner.agreement.manage", tone: "danger", fields: reasonField },
    ],
    createForm: { label: "Partner agreement", permission: "partner.agreement.manage", fields: [
      { name: "partnerProfileId", label: "Partner profile ID", required: true }, { name: "startsAt", label: "Starts at", type: "date", required: true }, { name: "endsAt", label: "Ends at", type: "date" },
      { name: "version.commissionPlanId", label: "Commission plan ID" }, { name: "version.attributionModel", label: "Attribution model", type: "select", required: true, options: ["FIRST_CLICK", "LAST_CLICK", "LEAD_OWNER"], defaultValue: "LAST_CLICK" },
      { name: "version.attributionWindowDays", label: "Attribution window days", type: "number", required: true, defaultValue: "30" }, { name: "version.allowSelfReferral", label: "Allow self-referral", type: "checkbox" },
      { name: "version.minimumSettlement", label: "Minimum settlement", type: "number", required: true, defaultValue: "0" }, { name: "version.currency", label: "Currency", required: true, defaultValue: "BDT" },
    ] },
  },
  leads: {
    key: "leads", title: "Registered Leads", description: "Validate partner leads, resolve duplicates, assign ownership and record outcomes.",
    endpoint: "/api/admin/business-network/leads", detailBasePath: "/admin/business-network/leads", permission: "partner.lead.view",
    statuses: ["SUBMITTED", "VALIDATING", "ACCEPTED", "DUPLICATE", "ASSIGNED", "IN_PROGRESS", "WON", "LOST", "EXPIRED", "REJECTED"],
    columns: [
      { label: "Company", path: "companyName" }, { label: "Contact", path: "contactName" }, { label: "Partner", path: "partnerProfile.partnerCode" },
      { label: "Status", path: "status", format: "status" }, { label: "Value", path: "estimatedValue", format: "money", currencyPath: "currency" }, { label: "Created", path: "createdAt", format: "date" },
    ], detailRoot: "lead",
    actions: [
      { label: "Accept", slug: "accept", permission: "partner.lead.manage" },
      { label: "Assign", slug: "assign", permission: "partner.lead.assign", fields: [{ name: "assignedToUserId", label: "Internal user ID", required: true }, { name: "ownershipExpiresAt", label: "Ownership expires", type: "date" }] },
      { label: "Mark won", slug: "won", permission: "partner.lead.assign", fields: [{ name: "wonOrderId", label: "Won order ID", type: "number", required: true }] },
      { label: "Mark lost", slug: "lost", permission: "partner.lead.assign", tone: "danger", fields: reasonField },
      { label: "Reject", slug: "reject", permission: "partner.lead.manage", tone: "danger", fields: reasonField },
    ],
  },
  "commission-plans": {
    key: "commission-plans", title: "Commission Plans", description: "Effective-dated deterministic commission plans and evidence-backed rules.",
    endpoint: "/api/admin/business-network/commission/plans", detailBasePath: "/admin/business-network/commission/plans", permission: "partner.commission.view",
    statuses: ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"],
    columns: [
      { label: "Code", path: "code" }, { label: "Name", path: "name" }, { label: "Status", path: "status", format: "status" },
      { label: "Currency", path: "currency" }, { label: "Rules", path: "rules.length", format: "count" }, { label: "Starts", path: "startsAt", format: "date" },
    ], detailRoot: "plan",
    createForm: { label: "Commission plan", permission: "partner.commission.calculate", fields: [
      { name: "code", label: "Plan code", required: true }, { name: "name", label: "Plan name", required: true }, { name: "currency", label: "Currency", required: true, defaultValue: "BDT" },
      { name: "startsAt", label: "Starts at", type: "date" }, { name: "endsAt", label: "Ends at", type: "date" }, { name: "description", label: "Description", type: "textarea" },
    ] },
    editForm: { label: "Commission plan", permission: "partner.commission.calculate", fields: [
      { name: "name", label: "Name", required: true }, { name: "status", label: "Status", type: "select", options: ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"] }, { name: "startsAt", label: "Starts at", type: "date" }, { name: "endsAt", label: "Ends at", type: "date" }, { name: "description", label: "Description", type: "textarea" },
    ] },
  },
  "commission-ledger": {
    key: "commission-ledger", title: "Commission Ledger", description: "Append-only earnings, holds, approvals, reversals and manual adjustments.",
    endpoint: "/api/admin/business-network/commission/entries", permission: "partner.commission.view",
    statuses: ["PENDING", "HOLD", "APPROVED", "PAYABLE", "PAID", "CANCELLED", "REVERSED"],
    columns: [
      { label: "Entry", path: "id" }, { label: "Partner", path: "partnerProfile.partnerCode" }, { label: "Type", path: "type", format: "status" },
      { label: "Status", path: "status", format: "status" }, { label: "Amount", path: "amount", format: "money", currencyPath: "currency" }, { label: "Created", path: "createdAt", format: "date" },
    ],
    rowActions: [
      { label: "Approve", slug: "approve", permission: "partner.commission.approve" },
      { label: "Cancel", slug: "cancel", permission: "partner.commission.adjust", tone: "danger", fields: reasonField },
      { label: "Reverse", slug: "reverse", permission: "partner.commission.adjust", tone: "danger", fields: reasonField },
    ],
  },
  settlements: {
    key: "settlements", title: "Settlement Runs", description: "Maker-checker payout runs with immutable commission snapshots and payment evidence.",
    endpoint: "/api/admin/business-network/settlements", detailBasePath: "/admin/business-network/settlements", permission: "partner.settlement.view",
    statuses: ["DRAFT", "SUBMITTED", "APPROVED", "PROCESSING", "FAILED", "PAID", "CANCELLED"],
    columns: [
      { label: "Settlement", path: "settlementNumber" }, { label: "Partner", path: "partnerProfile.partnerCode" }, { label: "Status", path: "status", format: "status" },
      { label: "Net payable", path: "netPayable", format: "money", currencyPath: "currency" }, { label: "Period start", path: "periodStart", format: "date" }, { label: "Period end", path: "periodEnd", format: "date" },
    ], detailRoot: "settlement",
    actions: [
      { label: "Submit", slug: "submit", permission: "partner.settlement.create" }, { label: "Approve", slug: "approve", permission: "partner.settlement.approve" },
      { label: "Start processing", slug: "process", permission: "partner.settlement.pay", body: { outcome: "START" } },
      { label: "Mark paid", slug: "mark-paid", permission: "partner.settlement.pay", fields: [{ name: "paymentReference", label: "Payment reference", required: true }] },
      { label: "Cancel", slug: "cancel", permission: "partner.settlement.create", tone: "danger", fields: reasonField },
    ],
    createForm: { label: "Settlement run", permission: "partner.settlement.create", fields: [
      { name: "partnerProfileId", label: "Partner profile ID", required: true }, { name: "periodStart", label: "Period start", type: "date", required: true }, { name: "periodEnd", label: "Period end", type: "date", required: true },
      { name: "currency", label: "Currency", required: true, defaultValue: "BDT" }, { name: "payoutAccountId", label: "Verified payout account ID" },
    ] },
  },
  "payout-accounts": {
    key: "payout-accounts", title: "Payout Accounts", description: "Masked and encrypted partner payout destinations awaiting independent verification.",
    endpoint: "/api/admin/business-network/payout-accounts", permission: "partner.payout_account.view",
    statuses: ["PENDING_VERIFICATION", "VERIFIED", "REJECTED", "DISABLED"],
    columns: [
      { label: "Account name", path: "accountName" }, { label: "Type", path: "type", format: "status" }, { label: "Institution", path: "bankName" },
      { label: "Last four", path: "accountNumberLast4" }, { label: "Status", path: "status", format: "status" }, { label: "Default", path: "isDefault", format: "status" },
    ],
    rowActions: [
      { label: "Verify", slug: "verify", permission: "partner.payout_account.verify" },
      { label: "Reject", slug: "reject", permission: "partner.payout_account.verify", tone: "danger", fields: reasonField },
    ],
  },
  audit: {
    key: "audit", title: "Business Audit Log", description: "Tamper-resistant operational evidence for every business-network lifecycle decision.",
    endpoint: "/api/admin/business-network/audit", permission: "business.audit.view",
    columns: [
      { label: "Time", path: "createdAt", format: "date" }, { label: "Action", path: "action", format: "status" }, { label: "Entity", path: "entityType" },
      { label: "Entity ID", path: "entityId" }, { label: "Organization", path: "organization.legalName" }, { label: "Integrity", path: "integrityHash" },
    ],
  },
};
