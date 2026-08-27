export const SYSTEM_PERMISSIONS = [
  {
    key: "admin.panel.access",
    description: "Access admin panel UI routes.",
  },
  {
    key: "dashboard.read",
    description: "Read dashboard analytics and summary views.",
  },
  {
    key: "users.read",
    description: "Read user lists and user details.",
  },
  {
    key: "users.manage",
    description: "Create, update, delete users and reset user password.",
  },
  {
    key: "roles.manage",
    description: "Create/update roles and assign permissions.",
  },
  {
    key: "products.manage",
    description: "Manage products, variants, and product metadata.",
  },
  {
    key: "inventory.manage",
    description: "Manage stock, inventory logs, and warehouse stock movement.",
  },
  {
    key: "orders.read_all",
    description: "Read all orders across customers.",
  },
  {
    key: "orders.read_own",
    description: "Read own orders only.",
  },
  {
    key: "orders.update",
    description: "Update order status/payment metadata.",
  },
  {
    key: "shipments.manage",
    description: "Create/update/delete shipment records and sync couriers.",
  },
  {
    key: "blogs.manage",
    description: "Create/update/delete blogs.",
  },
  {
    key: "newsletter.manage",
    description: "Manage newsletter and subscriber operations.",
  },
  {
    key: "coupons.manage",
    description: "Create/update/delete coupons and coupon settings.",
  },
  {
    key: "settings.manage",
    description:
      "Access settings areas with elevated configuration privileges.",
  },
  {
    key: "settings.banner.manage",
    description: "Manage homepage and promotional banners.",
  },
  {
    key: "settings.payment.manage",
    description: "Manage payment settings and methods.",
  },
  {
    key: "settings.shipping.manage",
    description: "Manage shipping rates and shipping configuration.",
  },
  {
    key: "settings.vat.manage",
    description: "Manage VAT class and VAT rate configuration.",
  },
  {
    key: "settings.courier.manage",
    description: "Manage courier configuration.",
  },
  {
    key: "settings.warehouse.manage",
    description: "Manage warehouse configuration.",
  },
  {
    key: "settings.activitylog.read",
    description: "Read admin activity logs based on allowed scope.",
  },
  {
    key: "gallery.manage",
    description: "Manage gallery images and media assets.",
  },
  {
    key: "chats.manage",
    description: "Read/respond/assign/close all support chats.",
  },
  {
    key: "chats.respond",
    description: "Respond as customer in own support chats.",
  },
  {
    key: "reports.read",
    description: "Read financial and operational reports.",
  },
  {
    key: "investors.read",
    description:
      "Read investor directory, KYC progress, and investor account summaries.",
  },
  {
    key: "investors.manage",
    description:
      "Create/update investor master profiles and investor KYC statuses.",
  },
  {
    key: "investor_ledger.read",
    description:
      "Read investor capital ledger entries, balances, and transaction history.",
  },
  {
    key: "reviews.manage",
    description: "Read and manage product reviews.",
  },
  {
    key: "investor_ledger.manage",
    description:
      "Post investor capital movements such as contributions, distributions, and adjustments.",
  },
  {
    key: "investor_allocations.read",
    description:
      "Read investor-to-product allocation plans and participation setup.",
  },
  {
    key: "investor_allocations.manage",
    description:
      "Create/update investor-to-product allocation rules and commitment setup.",
  },
  {
    key: "investor_profit.read",
    description:
      "Read investor product-level profitability runs and investor profit-share outputs.",
  },
  {
    key: "investor_profit.manage",
    description:
      "Generate investor profitability runs and recalculate investor product-level profit sharing.",
  },
  {
    key: "investor_profit.approve",
    description:
      "Approve or reject investor profitability runs using maker-checker governance.",
  },
  {
    key: "investor_profit.post",
    description:
      "Post approved investor profitability runs into investor ledger entries.",
  },
  {
    key: "investor_payout.read",
    description:
      "Read investor payout history generated from posted profitability runs.",
  },
  {
    key: "investor_payout.manage",
    description:
      "Create investor payout distributions and payout settlement records.",
  },
  {
    key: "investor_payout.approve",
    description: "Approve or reject investor payout drafts before settlement.",
  },
  {
    key: "investor_payout.pay",
    description:
      "Settle approved investor payouts and post distribution cash-out entries.",
  },
  {
    key: "investor_payout.void",
    description:
      "Void approved/paid investor payouts and post reversal entries when required.",
  },
  {
    key: "investor_statement.read",
    description:
      "Read and export investor statement summaries and payout history.",
  },
  {
    key: "investor_withdrawals.read",
    description:
      "Read investor withdrawal requests, balances, and settlement history.",
  },
  {
    key: "investor_withdrawals.review",
    description:
      "Approve or reject investor withdrawal requests under maker-checker control.",
  },
  {
    key: "investor_withdrawals.settle",
    description:
      "Settle approved investor withdrawal requests and post withdrawal ledger entries.",
  },
  {
    key: "investor_documents.read",
    description:
      "Read investor KYC documents, review status, expiry state, and document completeness.",
  },
  {
    key: "investor_documents.manage",
    description:
      "Upload or replace investor KYC documents from the internal operations side.",
  },
  {
    key: "investor_documents.review",
    description:
      "Approve or reject investor KYC documents and govern verification decisions.",
  },
  {
    key: "investor.portal.access",
    description: "Access investor self-service portal routes and dashboard.",
  },
  {
    key: "investor.portal.overview.read",
    description: "Read investor portal overview KPIs and account snapshot.",
  },
  {
    key: "investor.portal.ledger.read",
    description: "Read own investor ledger transactions and balance movements.",
  },
  {
    key: "investor.portal.allocations.read",
    description: "Read own product allocation records from investor portal.",
  },
  {
    key: "investor.portal.profit.read",
    description:
      "Read own product-level profit run outputs from investor portal.",
  },
  {
    key: "investor.portal.payout.read",
    description:
      "Read own payout register and settlement timeline in investor portal.",
  },
  {
    key: "investor.portal.statement.read",
    description:
      "Read and export own investor statements from investor portal.",
  },
  {
    key: "investor.portal.withdrawals.read",
    description:
      "Read own investor withdrawal requests and withdrawable balance in investor portal.",
  },
  {
    key: "investor.portal.withdrawals.submit",
    description:
      "Submit own investor withdrawal requests from investor portal.",
  },
  {
    key: "investor.portal.documents.read",
    description: "Read own investor KYC document vault and review results.",
  },
  {
    key: "investor.portal.documents.submit",
    description:
      "Upload or re-submit own investor KYC documents for internal review.",
  },
  {
    key: "investor.portal.notifications.read",
    description: "Read investor portal notifications and request outcomes.",
  },
  {
    key: "investor.notifications.read",
    description:
      "Read internal investor workflow notifications for reviewer, approver, and payer queues.",
  },
  {
    key: "investor.activity_log.read",
    description:
      "Read investor-only audit activity across onboarding, ledger, allocation, profit, payout, and statement workflows.",
  },
  {
    key: "investor.portal.profile.read",
    description: "Read own investor portal profile and beneficiary context.",
  },
  {
    key: "investor.portal.profile.submit",
    description:
      "Submit own investor profile or beneficiary update requests from portal.",
  },
  {
    key: "investor_profile_requests.read",
    description: "Read investor profile update requests submitted from portal.",
  },
  {
    key: "investor_profile_requests.review",
    description:
      "Approve or reject investor profile update requests from portal.",
  },
  {
    key: "profile.manage",
    description: "Manage own account profile and password.",
  },
  {
    key: "storefront.access",
    description: "Access storefront buyer experience.",
  },
  {
    key: "cart.manage",
    description: "Manage own cart.",
  },
  {
    key: "wishlist.manage",
    description: "Manage own wishlist.",
  },
  {
    key: "logistics.manage",
    description: "Manage logistics operations and coordination.",
  },
  {
    key: "payroll.manage",
    description: "Manage payroll and employee compensation.",
  },
  {
    key: "delivery-men.manage",
    description: "Onboard and manage delivery personnel.",
  },
  {
    key: "scm.access",
    description: "Access the supply chain management module.",
  },
  {
    key: "suppliers.read",
    description: "Read supplier directories and supplier details.",
  },
  {
    key: "suppliers.manage",
    description: "Create and update supplier records.",
  },
  {
    key: "supplier.portal.access",
    description: "Access supplier self-service portal routes and dashboard.",
  },
  {
    key: "supplier.rfq.read",
    description: "Read own RFQ invitations and quote history as supplier.",
  },
  {
    key: "supplier.rfq.quote.submit",
    description: "Submit or revise quotations for invited RFQs.",
  },
  {
    key: "supplier.purchase_orders.read",
    description:
      "Read own awarded purchase orders and line-level delivery expectations.",
  },
  {
    key: "supplier.invoices.read",
    description:
      "Read own supplier invoices, payment status, and outstanding balances.",
  },
  {
    key: "supplier.payments.read",
    description: "Read own supplier payment history and settlement references.",
  },
  {
    key: "supplier.profile.read",
    description:
      "Read own supplier profile, compliance documents, and onboarding status.",
  },
  {
    key: "supplier.profile.update_request.submit",
    description:
      "Submit supplier profile/document update requests for admin approval.",
  },
  {
    key: "supplier.documents.read",
    description:
      "Read own supplier compliance documents, expiry timeline, and verification state.",
  },
  {
    key: "supplier.documents.update_request.submit",
    description:
      "Submit compliance document update or annual renewal requests.",
  },
  {
    key: "supplier.work_orders.read",
    description: "Read own awarded work orders and fulfillment milestones.",
  },
  {
    key: "supplier.notifications.read",
    description:
      "Read supplier portal system/email notifications and alert timeline.",
  },
  {
    key: "supplier.feedback.read",
    description:
      "Read supplier performance feedback shared by internal teams or clients.",
  },
  {
    key: "supplier.2fa.manage",
    description:
      "Manage own supplier portal multi-factor authentication settings.",
  },
  {
    key: "supplier.profile_requests.read",
    description:
      "Read supplier profile/document update requests submitted from supplier portal.",
  },
  {
    key: "supplier.profile_requests.review",
    description: "Approve or reject supplier profile/document update requests.",
  },
  {
    key: "supplier.feedback.manage",
    description: "Create and manage supplier performance feedback records.",
  },
  {
    key: "supplier_performance.read",
    description:
      "Read supplier lead-time intelligence, on-time delivery trends, and reliability scorecards.",
  },
  {
    key: "sla.read",
    description:
      "Read supplier SLA policies, SLA scorecards, and breach history.",
  },
  {
    key: "sla.manage",
    description:
      "Create/update supplier SLA policies and run SLA breach evaluations.",
  },
  {
    key: "sla.dispute.resolve",
    description:
      "Resolve or reject supplier SLA disputes with governance notes.",
  },
  {
    key: "sla.termination.approve",
    description:
      "Approve/reject/execute supplier SLA termination governance cases.",
  },
  {
    key: "sla.notifications.manage",
    description: "Trigger and manage supplier SLA escalation notifications.",
  },
  {
    key: "purchase_requisitions.read",
    description: "Read purchase requisitions and requisition line items.",
  },
  {
    key: "purchase_requisitions.manage",
    description:
      "Create, update, submit, and convert purchase requisitions within allowed scope.",
  },
  {
    key: "purchase_requisitions.approve",
    description: "Approve or reject submitted purchase requisitions.",
  },
  {
    key: "mrf.budget_clear",
    description:
      "Perform finance budget clearance for submitted material requisitions.",
  },
  {
    key: "mrf.endorse",
    description:
      "Provide endorsement sign-off for budget-cleared material requisitions.",
  },
  {
    key: "mrf.final_approve",
    description:
      "Execute final material requisition approval according to authority matrix.",
  },
  {
    key: "rfq.read",
    description:
      "Read RFQ events, invited suppliers, and quotation comparisons.",
  },
  {
    key: "rfq.manage",
    description:
      "Create/update RFQs, invite suppliers, and submit supplier quotations.",
  },
  {
    key: "rfq.approve",
    description: "Award RFQs and approve conversion decisions.",
  },
  {
    key: "comparative_statements.read",
    description:
      "Read procurement comparative statements, scoring, and approval history.",
  },
  {
    key: "comparative_statements.manage",
    description:
      "Generate comparative statements from RFQs and maintain technical scorecards.",
  },
  {
    key: "comparative_statements.approve_manager",
    description:
      "Perform stage-1 procurement manager approval for comparative statements.",
  },
  {
    key: "comparative_statements.approve_committee",
    description:
      "Perform stage-2 procurement committee approval for comparative statements.",
  },
  {
    key: "comparative_statements.approve_final",
    description:
      "Perform final authority-matrix approval for comparative statements.",
  },
  {
    key: "purchase_orders.read",
    description: "Read purchase orders and their line items.",
  },
  {
    key: "purchase_orders.manage",
    description: "Create and update purchase orders.",
  },
  {
    key: "purchase_orders.approve",
    description: "Approve submitted purchase orders.",
  },
  {
    key: "purchase_orders.approve_manager",
    description:
      "Perform procurement manager approval on submitted purchase orders.",
  },
  {
    key: "purchase_orders.approve_committee",
    description:
      "Perform procurement committee approval on manager-approved purchase orders.",
  },
  {
    key: "purchase_orders.approve_final",
    description:
      "Perform final authority-matrix approval and issue purchase orders as work orders.",
  },
  {
    key: "goods_receipts.read",
    description: "Read goods receipt history and receipt details.",
  },
  {
    key: "goods_receipts.manage",
    description: "Receive goods and post stock from approved purchase orders.",
  },
  {
    key: "landed_costs.read",
    description:
      "Read purchase order landed cost components and allocation previews.",
  },
  {
    key: "landed_costs.manage",
    description:
      "Create, update, and remove purchase order landed cost components before goods receipt posting.",
  },
  {
    key: "supplier_returns.read",
    description:
      "Read supplier return requests, dispatches, and closure history.",
  },
  {
    key: "supplier_returns.manage",
    description:
      "Create, update, submit, and dispatch supplier returns within allowed scope.",
  },
  {
    key: "supplier_returns.approve",
    description:
      "Approve or close supplier returns and post supplier credit adjustments.",
  },
  {
    key: "replenishment.read",
    description:
      "Read replenishment rules, stock planning signals, and recommendation queues.",
  },
  {
    key: "replenishment.manage",
    description:
      "Manage replenishment rules and generate replenishment requisitions within allowed scope.",
  },
  {
    key: "supplier_ledger.read",
    description:
      "Read supplier ledger balances, invoices, payments, and statements.",
  },
  {
    key: "supplier_invoices.read",
    description: "Read supplier invoices and invoice aging.",
  },
  {
    key: "supplier_invoices.manage",
    description:
      "Create and manage supplier invoices posted to accounts payable.",
  },
  {
    key: "supplier_payments.read",
    description: "Read supplier payment history and allocations.",
  },
  {
    key: "supplier_payments.manage",
    description: "Create supplier payments and reduce payable balances.",
  },
  {
    key: "supplier_payments.override_hold",
    description:
      "Override SLA/AP payment holds on supplier invoices with mandatory justification.",
  },
  {
    key: "payment_requests.read",
    description: "Read vendor payment request forms and workflow status.",
  },
  {
    key: "payment_requests.manage",
    description: "Create and submit vendor payment request forms.",
  },
  {
    key: "payment_requests.approve_admin",
    description:
      "Perform manager administration approval for payment requests.",
  },
  {
    key: "payment_requests.approve_finance",
    description: "Perform manager finance approval for payment requests.",
  },
  {
    key: "payment_requests.treasury",
    description: "Process treasury payment execution for approved PRFs.",
  },
  {
    key: "payment_reports.read",
    description: "Read vendor-wise payment reports and treasury summaries.",
  },
  {
    key: "three_way_match.read",
    description:
      "Review three-way match results between purchase orders, receipts, and supplier invoices.",
  },
  {
    key: "warehouse_transfers.read",
    description: "Read warehouse transfer requests, dispatches, and receipts.",
  },
  {
    key: "warehouse_transfers.manage",
    description:
      "Create, dispatch, receive, and update warehouse transfers within assigned scope.",
  },
  {
    key: "warehouse_transfers.approve",
    description:
      "Approve submitted warehouse transfer requests before dispatch.",
  },
  {
    key: "material_requests.read",
    description:
      "Read warehouse material requests, approval trails, and request history.",
  },
  {
    key: "material_requests.manage",
    description:
      "Create, update, submit, or cancel warehouse material requests.",
  },
  {
    key: "material_requests.endorse_supervisor",
    description:
      "Endorse submitted material requests at requester supervisor stage.",
  },
  {
    key: "material_requests.endorse_project_manager",
    description:
      "Endorse supervisor-cleared material requests at project manager stage.",
  },
  {
    key: "material_requests.approve_admin",
    description:
      "Perform final manager administration approval for material requests.",
  },
  {
    key: "material_releases.read",
    description: "Read material release notes, challan, and waybill history.",
  },
  {
    key: "material_releases.manage",
    description:
      "Issue material release notes and post stock-out against approved material requests.",
  },
  {
    key: "asset_register.read",
    description: "Read fixed asset register records and generated asset tags.",
  },
  {
    key: "asset_register.manage",
    description: "Manage fixed asset lifecycle states and assignment metadata.",
  },
  {
    key: "warehouse_locations.read",
    description:
      "Read warehouse zone, aisle, and bin locations for facility-level tracking.",
  },
  {
    key: "warehouse_locations.manage",
    description:
      "Create and maintain warehouse zones, aisles, and bin locations.",
  },
  {
    key: "stock_alerts.read",
    description: "Read stock level alerts and reorder notifications.",
  },
  {
    key: "stock_alerts.manage",
    description: "Create or resolve stock level alerts and reorder signals.",
  },
  {
    key: "physical_verifications.read",
    description: "Read physical verification schedules and variance findings.",
  },
  {
    key: "physical_verifications.manage",
    description: "Create and submit physical verification cycles and counts.",
  },
  {
    key: "physical_verifications.approve",
    description:
      "Approve or reject physical verification outcomes on behalf of management.",
  },
  {
    key: "stock_reports.read",
    description:
      "Read daily stock, aging, and monthly warehouse summary reports.",
  },
  {
    key: "delivery.dashboard.access",
    description:
      "Access delivery-man assignment and operational dashboard flows.",
  },
  {
    key: "business.account.view",
    description: "Read business accounts and their commercial configuration.",
  },
  {
    key: "business.account.manage",
    description: "Create and update business accounts and account status.",
  },
  {
    key: "business.pricing.view",
    description: "Read business pricing tiers, rules, and contract prices.",
  },
  {
    key: "business.pricing.manage",
    description: "Create and update business pricing tiers, rules, and contracts.",
  },
  {
    key: "business.credit.view",
    description: "Read corporate credit accounts, limits, balances, and ledgers.",
  },
  {
    key: "business.credit.manage",
    description: "Configure corporate credit limits, terms, reviews, and availability.",
  },
  {
    key: "business.credit.adjust",
    description: "Post audited debit or credit adjustments to the corporate credit ledger.",
  },
  {
    key: "business.rfq.view",
    description: "Read corporate customer sales RFQs and their supporting documents.",
  },
  {
    key: "business.rfq.manage",
    description: "Review, reject, and close corporate customer sales RFQs.",
  },
  {
    key: "business.rfq.assign",
    description: "Assign corporate customer sales RFQs to internal users.",
  },
  {
    key: "business.quotation.view",
    description: "Read corporate sales quotations and their immutable version history.",
  },
  {
    key: "business.quotation.create",
    description: "Create corporate sales quotations and quotation versions.",
  },
  {
    key: "business.quotation.update",
    description: "Submit and cancel corporate sales quotations.",
  },
  {
    key: "business.quotation.approve",
    description: "Approve internally reviewed corporate sales quotations.",
  },
  {
    key: "business.quotation.send",
    description: "Issue approved corporate sales quotations to customers.",
  },
  {
    key: "business.customer_po.view",
    description: "Read customer purchase orders and linked corporate orders.",
  },
  {
    key: "business.customer_po.verify",
    description: "Review, verify, and reject customer purchase orders.",
  },
  {
    key: "business.customer_po.convert",
    description: "Atomically convert verified customer purchase orders into orders.",
  },
] as const;

export type PermissionKey = (typeof SYSTEM_PERMISSIONS)[number]["key"];

const ALL_PERMISSION_KEYS = SYSTEM_PERMISSIONS.map(
  (permission) => permission.key,
);

export const SYSTEM_ROLE_DEFINITIONS: Array<{
  name: string;
  label: string;
  description: string;
  immutable: boolean;
  permissions: PermissionKey[];
}> = [
  {
    name: "superadmin",
    label: "Super Admin",
    description: "System owner role with unrestricted access.",
    immutable: true,
    permissions: [...ALL_PERMISSION_KEYS],
  },
  {
    name: "admin",
    label: "Admin",
    description: "Full operational admin role.",
    immutable: false,
    permissions: [...ALL_PERMISSION_KEYS],
  },
  {
    name: "support",
    label: "Support Agent",
    description: "Customer support and order visibility role.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "orders.read_all",
      "chats.manage",
      "chats.respond",
      "profile.manage",
    ],
  },
  {
    name: "catalog",
    label: "Catalog Manager",
    description: "Product and inventory management role.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "products.manage",
      "inventory.manage",
      "profile.manage",
    ],
  },
  {
    name: "logistics",
    label: "Logistics",
    description: "Shipment and operational logistics role.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "orders.read_all",
      "shipments.manage",
      "logistics.manage",
      "settings.shipping.manage",
      "settings.courier.manage",
      "settings.warehouse.manage",
      "profile.manage",
    ],
  },
  {
    name: "content",
    label: "Content Manager",
    description: "Blog/newsletter/banner operations.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "blogs.manage",
      "newsletter.manage",
      "settings.banner.manage",
      "gallery.manage",
      "profile.manage",
    ],
  },
  {
    name: "finance",
    label: "Finance Manager",
    description: "Finance and reporting focused role.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "orders.read_all",
      "orders.update",
      "coupons.manage",
      "reports.read",
      "investors.read",
      "investor_ledger.read",
      "investor_allocations.read",
      "investor_profit.read",
      "investor_profit.approve",
      "investor_profit.post",
      "investor_payout.read",
      "investor_payout.manage",
      "investor_payout.approve",
      "investor_payout.pay",
      "investor_payout.void",
      "investor_withdrawals.read",
      "investor_withdrawals.review",
      "investor_withdrawals.settle",
      "investor_statement.read",
      "investor.notifications.read",
      "investor.activity_log.read",
      "mrf.budget_clear",
      "profile.manage",
    ],
  },
  {
    name: "investor_relations_manager",
    label: "Investor Relations Manager",
    description:
      "Manage investor onboarding, KYC governance, capital ledger entries, and allocation setup.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "reports.read",
      "investors.read",
      "investors.manage",
      "investor_documents.read",
      "investor_documents.manage",
      "investor_documents.review",
      "investor_profile_requests.read",
      "investor_profile_requests.review",
      "investor_ledger.read",
      "investor_ledger.manage",
      "investor_allocations.read",
      "investor_allocations.manage",
      "investor_profit.read",
      "investor_profit.manage",
      "investor_profit.approve",
      "investor_profit.post",
      "investor_payout.read",
      "investor_payout.manage",
      "investor_payout.approve",
      "investor_payout.pay",
      "investor_payout.void",
      "investor_withdrawals.read",
      "investor_withdrawals.review",
      "investor_statement.read",
      "investor.notifications.read",
      "investor.activity_log.read",
      "profile.manage",
    ],
  },
  {
    name: "investor_analyst",
    label: "Investor Analyst",
    description:
      "Read-only investor performance, capital account, and allocation visibility role.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "reports.read",
      "investors.read",
      "investor_documents.read",
      "investor_ledger.read",
      "investor_allocations.read",
      "investor_profit.read",
      "investor_payout.read",
      "investor_withdrawals.read",
      "investor_statement.read",
      "investor.notifications.read",
      "investor.activity_log.read",
      "profile.manage",
    ],
  },
  {
    name: "investor_document_reviewer",
    label: "Investor Document Reviewer",
    description:
      "Review and govern investor KYC documents without broader investor master ownership.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "reports.read",
      "investors.read",
      "investor_documents.read",
      "investor_documents.review",
      "investor.notifications.read",
      "investor.activity_log.read",
      "profile.manage",
    ],
  },
  {
    name: "investor_profile_request_reviewer",
    label: "Investor Profile Request Reviewer",
    description:
      "Review and approve investor portal-submitted profile and beneficiary update requests.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "reports.read",
      "investors.read",
      "investor_profile_requests.read",
      "investor_profile_requests.review",
      "investor.notifications.read",
      "investor.activity_log.read",
      "profile.manage",
    ],
  },
  {
    name: "investor_portal_access_manager",
    label: "Investor Portal Access Manager",
    description:
      "Assign and manage investor portal access mappings between internal users and investors.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "investors.read",
      "investors.manage",
      "users.read",
      "users.manage",
      "investor.activity_log.read",
      "profile.manage",
    ],
  },
  {
    name: "investor_profit_manager",
    label: "Investor Profit Manager",
    description:
      "Generate investor profit runs and review profitability outputs before approval.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "reports.read",
      "investors.read",
      "investor_allocations.read",
      "investor_profit.read",
      "investor_profit.manage",
      "investor_statement.read",
      "investor.notifications.read",
      "investor.activity_log.read",
      "profile.manage",
    ],
  },
  {
    name: "investor_profit_approver",
    label: "Investor Profit Approver",
    description:
      "Approve or reject investor profit runs under maker-checker governance.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "reports.read",
      "investors.read",
      "investor_allocations.read",
      "investor_profit.read",
      "investor_profit.approve",
      "investor_statement.read",
      "investor.notifications.read",
      "investor.activity_log.read",
      "profile.manage",
    ],
  },
  {
    name: "investor_profit_poster",
    label: "Investor Profit Poster",
    description:
      "Post approved investor profit runs into investor ledger entries.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "reports.read",
      "investors.read",
      "investor_ledger.read",
      "investor_profit.read",
      "investor_profit.post",
      "investor_statement.read",
      "investor.notifications.read",
      "investor.activity_log.read",
      "profile.manage",
    ],
  },
  {
    name: "investor_payout_manager",
    label: "Investor Payout Manager",
    description:
      "Generate and review investor payout drafts from posted profit runs.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "reports.read",
      "investors.read",
      "investor_profit.read",
      "investor_payout.read",
      "investor_payout.manage",
      "investor_statement.read",
      "investor.notifications.read",
      "investor.activity_log.read",
      "profile.manage",
    ],
  },
  {
    name: "investor_payout_approver",
    label: "Investor Payout Approver",
    description:
      "Approve, reject, hold, and release investor payout drafts before settlement.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "reports.read",
      "investors.read",
      "investor_profit.read",
      "investor_payout.read",
      "investor_payout.approve",
      "investor_statement.read",
      "investor.notifications.read",
      "investor.activity_log.read",
      "profile.manage",
    ],
  },
  {
    name: "investor_payout_payer",
    label: "Investor Payout Payer",
    description:
      "Settle approved investor payouts after proof upload and control checks.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "reports.read",
      "investors.read",
      "investor_ledger.read",
      "investor_payout.read",
      "investor_payout.pay",
      "investor_statement.read",
      "investor.notifications.read",
      "investor.activity_log.read",
      "profile.manage",
    ],
  },
  {
    name: "investor_payout_void_manager",
    label: "Investor Payout Void Manager",
    description:
      "Void approved or paid investor payouts and oversee reversal control.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "reports.read",
      "investors.read",
      "investor_ledger.read",
      "investor_payout.read",
      "investor_payout.void",
      "investor_statement.read",
      "investor.notifications.read",
      "profile.manage",
    ],
  },
  {
    name: "investor_withdrawal_reviewer",
    label: "Investor Withdrawal Reviewer",
    description:
      "Review and approve investor withdrawal requests before finance settlement.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "reports.read",
      "investors.read",
      "investor_withdrawals.read",
      "investor_withdrawals.review",
      "investor_statement.read",
      "investor.notifications.read",
      "investor.activity_log.read",
      "profile.manage",
    ],
  },
  {
    name: "investor_withdrawal_settler",
    label: "Investor Withdrawal Settler",
    description:
      "Settle approved investor withdrawal requests and post the final cash-out ledger entry.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "reports.read",
      "investors.read",
      "investor_ledger.read",
      "investor_withdrawals.read",
      "investor_withdrawals.settle",
      "investor_statement.read",
      "investor.notifications.read",
      "investor.activity_log.read",
      "profile.manage",
    ],
  },

  {
    name: "investor_admin",
    label: "Investor Admin",
    description:
      "Full investor administration role for registry, KYC, ledger, allocations, profit runs, payouts, statements, and portal governance.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "reports.read",
      "investors.read",
      "investors.manage",
      "investor_documents.read",
      "investor_documents.manage",
      "investor_documents.review",
      "investor_profile_requests.read",
      "investor_profile_requests.review",
      "investor_ledger.read",
      "investor_ledger.manage",
      "investor_allocations.read",
      "investor_allocations.manage",
      "investor_profit.read",
      "investor_profit.manage",
      "investor_profit.approve",
      "investor_profit.post",
      "investor_payout.read",
      "investor_payout.manage",
      "investor_payout.approve",
      "investor_payout.pay",
      "investor_payout.void",
      "investor_withdrawals.read",
      "investor_withdrawals.review",
      "investor_withdrawals.settle",
      "investor_statement.read",
      "investor.notifications.read",
      "investor.activity_log.read",
      "profile.manage",
    ],
  },
  {
    name: "investor_relations",
    label: "Investor Relations",
    description:
      "Investor relations role for profile maintenance, KYC follow-up, portal access, statements, and investor communication.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "reports.read",
      "investors.read",
      "investors.manage",
      "investor_documents.read",
      "investor_documents.manage",
      "investor_documents.review",
      "investor_profile_requests.read",
      "investor_profile_requests.review",
      "investor_ledger.read",
      "investor_allocations.read",
      "investor_profit.read",
      "investor_payout.read",
      "investor_withdrawals.read",
      "investor_statement.read",
      "investor.notifications.read",
      "investor.activity_log.read",
      "profile.manage",
    ],
  },
  {
    name: "profit_manager",
    label: "Profit Manager",
    description:
      "Prepare and manage investor profit runs and review allocation/profit outputs before approval.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "reports.read",
      "investors.read",
      "investor_ledger.read",
      "investor_allocations.read",
      "investor_profit.read",
      "investor_profit.manage",
      "investor_statement.read",
      "investor.notifications.read",
      "investor.activity_log.read",
      "profile.manage",
    ],
  },
  {
    name: "profit_approver",
    label: "Profit Approver",
    description:
      "Approve or reject investor profit runs under maker-checker governance.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "reports.read",
      "investors.read",
      "investor_ledger.read",
      "investor_allocations.read",
      "investor_profit.read",
      "investor_profit.approve",
      "investor_statement.read",
      "investor.notifications.read",
      "investor.activity_log.read",
      "profile.manage",
    ],
  },
  {
    name: "profit_poster",
    label: "Profit Poster",
    description:
      "Post approved investor profit runs into ledger and make payout-ready records visible.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "reports.read",
      "investors.read",
      "investor_ledger.read",
      "investor_profit.read",
      "investor_profit.post",
      "investor_payout.read",
      "investor_payout.manage",
      "investor_statement.read",
      "investor.notifications.read",
      "investor.activity_log.read",
      "profile.manage",
    ],
  },
  {
    name: "payout_manager",
    label: "Payout Manager",
    description:
      "Prepare and manage investor payout drafts from posted profit runs.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "reports.read",
      "investors.read",
      "investor_profit.read",
      "investor_payout.read",
      "investor_payout.manage",
      "investor_statement.read",
      "investor.notifications.read",
      "investor.activity_log.read",
      "profile.manage",
    ],
  },
  {
    name: "payout_approver",
    label: "Payout Approver",
    description:
      "Approve, reject, hold, or release investor payout drafts before settlement.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "reports.read",
      "investors.read",
      "investor_profit.read",
      "investor_payout.read",
      "investor_payout.approve",
      "investor_statement.read",
      "investor.notifications.read",
      "investor.activity_log.read",
      "profile.manage",
    ],
  },
  {
    name: "payout_payer",
    label: "Payout Payer",
    description:
      "Settle approved investor payouts and attach payment proof or settlement references.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "reports.read",
      "investors.read",
      "investor_ledger.read",
      "investor_payout.read",
      "investor_payout.pay",
      "investor_statement.read",
      "investor.notifications.read",
      "investor.activity_log.read",
      "profile.manage",
    ],
  },
  {
    name: "hr",
    label: "HR Manager",
    description: "Human resources and payroll management role.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "users.read",
      "users.manage",
      "payroll.manage",
      "profile.manage",
    ],
  },
  {
    name: "delivery_man",
    label: "Delivery Man",
    description: "Delivery execution role for assigned shipment handling.",
    immutable: false,
    permissions: ["delivery.dashboard.access", "profile.manage"],
  },
  {
    name: "supplier_portal",
    label: "Supplier Portal User",
    description:
      "External supplier self-service role for RFQ response and payable visibility.",
    immutable: false,
    permissions: [
      "supplier.portal.access",
      "supplier.rfq.read",
      "supplier.rfq.quote.submit",
      "supplier.purchase_orders.read",
      "supplier.work_orders.read",
      "supplier.invoices.read",
      "supplier.payments.read",
      "supplier.profile.read",
      "supplier.profile.update_request.submit",
      "supplier.documents.read",
      "supplier.documents.update_request.submit",
      "supplier.notifications.read",
      "supplier.feedback.read",
      "supplier.2fa.manage",
      "profile.manage",
    ],
  },
  {
    name: "investor_portal",
    label: "Investor Portal User",
    description:
      "External investor self-service role for portfolio, ledger, payouts, and statement visibility.",
    immutable: false,
    permissions: [
      "investor.portal.access",
      "investor.portal.overview.read",
      "investor.portal.ledger.read",
      "investor.portal.allocations.read",
      "investor.portal.profit.read",
      "investor.portal.payout.read",
      "investor.portal.statement.read",
      "investor.portal.withdrawals.read",
      "investor.portal.withdrawals.submit",
      "investor.portal.documents.read",
      "investor.portal.documents.submit",
      "investor.portal.notifications.read",
      "investor.portal.profile.read",
      "investor.portal.profile.submit",
      "profile.manage",
    ],
  },
  {
    name: "scm_admin",
    label: "SCM Admin",
    description:
      "Full supply chain administration across suppliers, purchase orders, and receipts.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "scm.access",
      "suppliers.read",
      "suppliers.manage",
      "supplier.profile_requests.read",
      "supplier.profile_requests.review",
      "supplier.feedback.manage",
      "supplier_performance.read",
      "sla.read",
      "sla.manage",
      "sla.dispute.resolve",
      "sla.termination.approve",
      "sla.notifications.manage",
      "purchase_requisitions.read",
      "purchase_requisitions.manage",
      "purchase_requisitions.approve",
      "mrf.budget_clear",
      "mrf.endorse",
      "mrf.final_approve",
      "rfq.read",
      "rfq.manage",
      "rfq.approve",
      "comparative_statements.read",
      "comparative_statements.manage",
      "comparative_statements.approve_manager",
      "comparative_statements.approve_committee",
      "comparative_statements.approve_final",
      "purchase_orders.read",
      "purchase_orders.manage",
      "purchase_orders.approve",
      "purchase_orders.approve_manager",
      "purchase_orders.approve_committee",
      "purchase_orders.approve_final",
      "goods_receipts.read",
      "goods_receipts.manage",
      "landed_costs.read",
      "landed_costs.manage",
      "supplier_returns.read",
      "supplier_returns.manage",
      "supplier_returns.approve",
      "replenishment.read",
      "replenishment.manage",
      "supplier_ledger.read",
      "supplier_invoices.read",
      "supplier_invoices.manage",
      "supplier_payments.read",
      "supplier_payments.manage",
      "supplier_payments.override_hold",
      "payment_requests.read",
      "payment_requests.manage",
      "payment_requests.approve_admin",
      "payment_requests.approve_finance",
      "payment_requests.treasury",
      "payment_reports.read",
      "three_way_match.read",
      "warehouse_transfers.read",
      "warehouse_transfers.manage",
      "warehouse_transfers.approve",
      "material_requests.read",
      "material_requests.manage",
      "material_requests.endorse_supervisor",
      "material_requests.endorse_project_manager",
      "material_requests.approve_admin",
      "material_releases.read",
      "material_releases.manage",
      "asset_register.read",
      "asset_register.manage",
      "warehouse_locations.read",
      "warehouse_locations.manage",
      "stock_alerts.read",
      "stock_alerts.manage",
      "physical_verifications.read",
      "physical_verifications.manage",
      "physical_verifications.approve",
      "stock_reports.read",
      "profile.manage",
    ],
  },
  {
    name: "supplier_portal_user",
    label: "Supplier Portal User",
    description:
      "External supplier self-service role for RFQ response and payable visibility.",
    immutable: false,
    permissions: [
      "supplier.portal.access",
      "supplier.rfq.read",
      "supplier.rfq.quote.submit",
      "supplier.purchase_orders.read",
      "supplier.work_orders.read",
      "supplier.invoices.read",
      "supplier.payments.read",
      "supplier.profile.read",
      "supplier.profile.update_request.submit",
      "supplier.documents.read",
      "supplier.documents.update_request.submit",
      "supplier.notifications.read",
      "supplier.feedback.read",
      "supplier.2fa.manage",
      "profile.manage",
    ],
  },
  {
    name: "procurement_manager",
    label: "Procurement Manager",
    description: "Manage suppliers and purchase orders, including approvals.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "scm.access",
      "suppliers.read",
      "suppliers.manage",
      "supplier.profile_requests.read",
      "supplier.profile_requests.review",
      "supplier.feedback.manage",
      "supplier_performance.read",
      "sla.read",
      "sla.manage",
      "sla.dispute.resolve",
      "sla.termination.approve",
      "sla.notifications.manage",
      "purchase_requisitions.read",
      "purchase_requisitions.manage",
      "purchase_requisitions.approve",
      "mrf.budget_clear",
      "mrf.endorse",
      "mrf.final_approve",
      "rfq.read",
      "rfq.manage",
      "rfq.approve",
      "comparative_statements.read",
      "comparative_statements.manage",
      "comparative_statements.approve_manager",
      "comparative_statements.approve_committee",
      "comparative_statements.approve_final",
      "purchase_orders.read",
      "purchase_orders.manage",
      "purchase_orders.approve",
      "purchase_orders.approve_manager",
      "purchase_orders.approve_committee",
      "purchase_orders.approve_final",
      "goods_receipts.read",
      "landed_costs.read",
      "landed_costs.manage",
      "supplier_returns.read",
      "supplier_returns.manage",
      "supplier_returns.approve",
      "replenishment.read",
      "replenishment.manage",
      "supplier_ledger.read",
      "supplier_invoices.read",
      "supplier_invoices.manage",
      "three_way_match.read",
      "payment_requests.read",
      "payment_requests.manage",
      "payment_requests.approve_admin",
      "payment_reports.read",
      "warehouse_transfers.read",
      "warehouse_transfers.manage",
      "warehouse_transfers.approve",
      "material_requests.read",
      "material_requests.manage",
      "material_requests.endorse_supervisor",
      "material_requests.endorse_project_manager",
      "material_requests.approve_admin",
      "material_releases.read",
      "material_releases.manage",
      "asset_register.read",
      "warehouse_locations.read",
      "warehouse_locations.manage",
      "stock_alerts.read",
      "stock_alerts.manage",
      "physical_verifications.read",
      "physical_verifications.manage",
      "physical_verifications.approve",
      "stock_reports.read",
      "payment_requests.read",
      "payment_requests.manage",
      "payment_requests.approve_admin",
      "payment_requests.approve_finance",
      "payment_requests.treasury",
      "payment_reports.read",
      "profile.manage",
    ],
  },
  {
    name: "warehouse_receiver",
    label: "Warehouse Receiver",
    description:
      "Receive stock from approved purchase orders into assigned warehouses.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "scm.access",
      "purchase_orders.read",
      "goods_receipts.read",
      "goods_receipts.manage",
      "landed_costs.read",
      "supplier_returns.read",
      "supplier_returns.manage",
      "replenishment.read",
      "replenishment.manage",
      "warehouse_transfers.read",
      "warehouse_transfers.manage",
      "warehouse_transfers.approve",
      "material_requests.read",
      "material_releases.read",
      "material_releases.manage",
      "asset_register.read",
      "warehouse_locations.read",
      "stock_alerts.read",
      "physical_verifications.read",
      "physical_verifications.manage",
      "stock_reports.read",
      "profile.manage",
    ],
  },
  {
    name: "procurement_requestor",
    label: "Procurement Requestor",
    description:
      "Raise and submit warehouse purchase requisitions for procurement review.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "scm.access",
      "purchase_requisitions.read",
      "purchase_requisitions.manage",
      "goods_receipts.read",
      "rfq.read",
      "rfq.manage",
      "comparative_statements.read",
      "comparative_statements.manage",
      "material_requests.read",
      "material_requests.manage",
      "stock_reports.read",
      "payment_requests.read",
      "payment_requests.manage",
      "profile.manage",
    ],
  },
  {
    name: "finance_focal",
    label: "Finance Focal",
    description:
      "Finance budget-clearance focal role for material requisition workflow.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "scm.access",
      "purchase_requisitions.read",
      "mrf.budget_clear",
      "material_requests.read",
      "stock_reports.read",
      "physical_verifications.read",
      "payment_requests.read",
      "payment_requests.approve_finance",
      "payment_reports.read",
      "profile.manage",
    ],
  },
  {
    name: "mrf_endorser",
    label: "MRF Endorser",
    description:
      "Endorsement signatory role for budget-cleared material requisitions.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "scm.access",
      "purchase_requisitions.read",
      "mrf.endorse",
      "material_requests.read",
      "material_requests.endorse_supervisor",
      "stock_reports.read",
      "profile.manage",
    ],
  },
  {
    name: "final_approver",
    label: "Final Approver",
    description:
      "Authority-matrix final approval role for material requisitions.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "scm.access",
      "purchase_requisitions.read",
      "mrf.final_approve",
      "material_requests.read",
      "material_requests.endorse_project_manager",
      "material_requests.approve_admin",
      "stock_reports.read",
      "payment_requests.read",
      "payment_requests.approve_admin",
      "profile.manage",
    ],
  },
  {
    name: "store_requester",
    label: "Store Requester",
    description:
      "Raise warehouse material requests and follow internal stock issue workflow.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "scm.access",
      "material_requests.read",
      "material_requests.manage",
      "material_releases.read",
      "asset_register.read",
      "warehouse_locations.read",
      "stock_reports.read",
      "profile.manage",
    ],
  },
  {
    name: "store_supervisor",
    label: "Store Supervisor",
    description:
      "Endorse submitted warehouse material requests at supervisor stage.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "scm.access",
      "material_requests.read",
      "material_requests.endorse_supervisor",
      "material_releases.read",
      "asset_register.read",
      "warehouse_locations.read",
      "stock_reports.read",
      "profile.manage",
    ],
  },
  {
    name: "project_manager",
    label: "Project Manager",
    description:
      "Endorse supervisor-cleared warehouse material requests at project stage.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "scm.access",
      "material_requests.read",
      "material_requests.endorse_project_manager",
      "material_releases.read",
      "asset_register.read",
      "stock_reports.read",
      "profile.manage",
    ],
  },
  {
    name: "manager_administration",
    label: "Manager Administration",
    description:
      "Perform final administration approvals for store material requests and vendor payment requests.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "scm.access",
      "goods_receipts.read",
      "material_requests.read",
      "material_requests.approve_admin",
      "material_releases.read",
      "material_releases.manage",
      "asset_register.read",
      "warehouse_locations.read",
      "stock_reports.read",
      "payment_requests.read",
      "payment_requests.approve_admin",
      "physical_verifications.read",
      "profile.manage",
    ],
  },
  {
    name: "procurement_committee",
    label: "Procurement Committee",
    description:
      "Committee review role for comparative statements and committee-stage PO approvals.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "scm.access",
      "comparative_statements.read",
      "comparative_statements.approve_committee",
      "purchase_orders.read",
      "purchase_orders.approve_committee",
      "profile.manage",
    ],
  },
  {
    name: "warehouse_transfer_manager",
    label: "Warehouse Transfer Manager",
    description: "Manage and approve stock transfers between warehouses.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "scm.access",
      "inventory.manage",
      "warehouse_transfers.read",
      "warehouse_transfers.manage",
      "warehouse_transfers.approve",
      "supplier_returns.read",
      "supplier_returns.manage",
      "supplier_returns.approve",
      "replenishment.read",
      "replenishment.manage",
      "supplier_ledger.read",
      "supplier_invoices.read",
      "three_way_match.read",
      "profile.manage",
      "stock_reports.read",
    ],
  },
  {
    name: "replenishment_planner",
    label: "Replenishment Planner",
    description:
      "Monitor warehouse demand signals and raise replenishment requisitions from planning suggestions.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "scm.access",
      "inventory.manage",
      "purchase_requisitions.read",
      "purchase_requisitions.manage",
      "rfq.read",
      "rfq.manage",
      "purchase_orders.read",
      "warehouse_transfers.read",
      "replenishment.read",
      "replenishment.manage",
      "profile.manage",
    ],
  },
  {
    name: "supplier_return_manager",
    label: "Supplier Return Manager",
    description:
      "Control supplier return approval, dispatch, and accounts payable adjustment flows.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "scm.access",
      "purchase_orders.read",
      "goods_receipts.read",
      "landed_costs.read",
      "supplier_returns.read",
      "supplier_returns.manage",
      "supplier_returns.approve",
      "supplier_ledger.read",
      "supplier_invoices.read",
      "three_way_match.read",
      "profile.manage",
    ],
  },
  {
    name: "ap_manager",
    label: "AP Manager",
    description:
      "Accounts payable role for supplier invoices, payments, and ledger visibility.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "scm.access",
      "suppliers.read",
      "supplier.profile_requests.read",
      "supplier.feedback.manage",
      "supplier_performance.read",
      "sla.read",
      "sla.notifications.manage",
      "supplier_ledger.read",
      "supplier_invoices.read",
      "supplier_invoices.manage",
      "landed_costs.read",
      "supplier_payments.read",
      "supplier_payments.manage",
      "supplier_payments.override_hold",
      "payment_requests.read",
      "payment_requests.manage",
      "payment_requests.approve_finance",
      "payment_requests.treasury",
      "payment_reports.read",
      "three_way_match.read",
      "reports.read",
      "profile.manage",
    ],
  },
  {
    name: "sla_manager",
    label: "SLA Manager",
    description:
      "Own supplier SLA targets and evaluate supplier breach trends.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "scm.access",
      "suppliers.read",
      "supplier_performance.read",
      "sla.read",
      "sla.manage",
      "sla.dispute.resolve",
      "sla.termination.approve",
      "sla.notifications.manage",
      "purchase_orders.read",
      "goods_receipts.read",
      "reports.read",
      "profile.manage",
    ],
  },
  {
    name: "supplier_performance_analyst",
    label: "Supplier Performance Analyst",
    description:
      "Review supplier lead-time reliability, late-order risk, and delivery performance trends.",
    immutable: false,
    permissions: [
      "admin.panel.access",
      "dashboard.read",
      "scm.access",
      "suppliers.read",
      "supplier_performance.read",
      "sla.read",
      "purchase_orders.read",
      "goods_receipts.read",
      "reports.read",
      "profile.manage",
    ],
  },
];

const ROLE_TEMPLATE_FALLBACKS = Object.fromEntries(
  SYSTEM_ROLE_DEFINITIONS.map((definition) => [
    definition.name,
    [...definition.permissions],
  ]),
) as Record<string, PermissionKey[]>;

export const LEGACY_ROLE_FALLBACKS: Record<string, PermissionKey[]> = {
  ...ROLE_TEMPLATE_FALLBACKS,
  user: [
    "storefront.access",
    "orders.read_own",
    "profile.manage",
    "cart.manage",
    "wishlist.manage",
    "chats.respond",
  ],
  delivery_man: ["delivery.dashboard.access", "profile.manage"],
};

export const ADMIN_PANEL_ACCESS_FALLBACK_PERMISSIONS: PermissionKey[] = [
  "dashboard.read",
  "users.read",
  "users.manage",
  "roles.manage",
  "products.manage",
  "inventory.manage",
  "orders.read_all",
  "orders.update",
  "shipments.manage",
  "blogs.manage",
  "newsletter.manage",
  "coupons.manage",
  "settings.manage",
  "settings.banner.manage",
  "settings.payment.manage",
  "settings.shipping.manage",
  "settings.vat.manage",
  "settings.courier.manage",
  "settings.warehouse.manage",
  "settings.activitylog.read",
  "chats.manage",
  "reports.read",
  "investors.read",
  "investor_ledger.read",
  "investor_allocations.read",
  "investors.manage",
  "investor_ledger.manage",
  "investor_allocations.manage",
  "investor_profit.read",
  "investor_profit.manage",
  "investor_profit.approve",
  "investor_profit.post",
  "investor_payout.read",
  "investor_payout.manage",
  "investor_payout.approve",
  "investor_payout.pay",
  "investor_payout.void",
  "investor_statement.read",
  "scm.access",
  "suppliers.read",
  "suppliers.manage",
  "supplier.profile_requests.read",
  "supplier.profile_requests.review",
  "supplier.feedback.manage",
  "supplier_performance.read",
  "sla.read",
  "sla.manage",
  "sla.dispute.resolve",
  "sla.termination.approve",
  "sla.notifications.manage",
  "purchase_requisitions.read",
  "purchase_requisitions.manage",
  "purchase_requisitions.approve",
  "mrf.budget_clear",
  "mrf.endorse",
  "mrf.final_approve",
  "rfq.read",
  "rfq.manage",
  "rfq.approve",
  "comparative_statements.read",
  "comparative_statements.manage",
  "comparative_statements.approve_manager",
  "comparative_statements.approve_committee",
  "comparative_statements.approve_final",
  "purchase_orders.read",
  "purchase_orders.manage",
  "purchase_orders.approve",
  "purchase_orders.approve_manager",
  "purchase_orders.approve_committee",
  "purchase_orders.approve_final",
  "goods_receipts.read",
  "goods_receipts.manage",
  "landed_costs.read",
  "landed_costs.manage",
  "supplier_returns.read",
  "supplier_returns.manage",
  "supplier_returns.approve",
  "replenishment.read",
  "replenishment.manage",
  "supplier_ledger.read",
  "supplier_invoices.read",
  "supplier_invoices.manage",
  "supplier_payments.read",
  "supplier_payments.manage",
  "supplier_payments.override_hold",
  "payment_requests.read",
  "payment_requests.manage",
  "payment_requests.approve_admin",
  "payment_requests.approve_finance",
  "payment_requests.treasury",
  "payment_reports.read",
  "three_way_match.read",
  "warehouse_transfers.read",
  "warehouse_transfers.manage",
  "warehouse_transfers.approve",
  "material_requests.read",
  "material_requests.manage",
  "material_requests.endorse_supervisor",
  "material_requests.endorse_project_manager",
  "material_requests.approve_admin",
  "material_releases.read",
  "material_releases.manage",
  "asset_register.read",
  "asset_register.manage",
  "warehouse_locations.read",
  "warehouse_locations.manage",
  "stock_alerts.read",
  "stock_alerts.manage",
  "physical_verifications.read",
  "physical_verifications.manage",
  "physical_verifications.approve",
  "stock_reports.read",
];

export function isPermissionKey(value: string): value is PermissionKey {
  return SYSTEM_PERMISSIONS.some((permission) => permission.key === value);
}

export function getAllPermissionKeys(): PermissionKey[] {
  return [...ALL_PERMISSION_KEYS];
}
