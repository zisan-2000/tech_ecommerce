import { NextResponse, type NextRequest } from "next/server";
import {
  getDashboardRoute,
  hasDeliveryDashboardAccess,
  hasInvestorPortalAccess,
  hasSupplierPortalAccess,
  isAdminDeliveryRoute,
  isDeliveryAdminShellRoute,
  isLegacyDeliveryDashboardRoute,
} from "@/lib/dashboard-route";

// List of public paths that don't require authentication
const publicPaths = [
  "/",
  "/signin",
  "/sign-up",
  "/api/auth/signin",
  "/api/auth/signout",
  "/api/auth/session",
  "/_next/static",
  "/_next/image",
  "/favicon.ico",
  "/static",
];

type SessionShape = {
  user?: {
    role?: string;
    permissions?: string[];
    globalPermissions?: string[];
    defaultAdminRoute?: "/admin" | "/admin/warehouse";
  };
} | null;

type PermissionRule = {
  prefix: string;
  permissions: string[];
  globalOnly?: boolean;
  methods?: string[];
  excludePrefixes?: string[];
};

const adminPagePermissionRules: PermissionRule[] = [
  {
    prefix: "/admin/warehouse",
    permissions: [
      "dashboard.read",
      "inventory.manage",
      "orders.read_all",
      "shipments.manage",
    ],
  },
  {
    prefix: "/admin/scm/dashboard",
    permissions: [
      "dashboard.read",
      "purchase_requisitions.read",
      "rfq.read",
      "comparative_statements.read",
      "purchase_orders.read",
      "goods_receipts.read",
      "payment_requests.read",
      "payment_reports.read",
      "stock_reports.read",
      "supplier_performance.read",
      "supplier.feedback.manage",
      "sla.read",
      "supplier_ledger.read",
      "three_way_match.read",
    ],
  },
  {
    prefix: "/admin/scm/notifications",
    permissions: ["scm.access"],
  },
  {
    prefix: "/admin/scm/my-tasks",
    permissions: ["scm.access"],
  },
  {
    prefix: "/admin/scm/exceptions",
    permissions: ["scm.access"],
  },
  {
    prefix: "/admin/scm/suppliers",
    permissions: ["suppliers.read", "suppliers.manage"],
    globalOnly: true,
  },
  {
    prefix: "/admin/scm/supplier-intelligence",
    permissions: ["supplier_performance.read"],
    globalOnly: true,
  },
  {
    prefix: "/admin/scm/supplier-portal-access",
    permissions: ["suppliers.manage", "users.manage"],
    globalOnly: true,
  },
  {
    prefix: "/admin/scm/vendor-approvals",
    permissions: ["supplier.profile_requests.read", "supplier.profile_requests.review"],
    globalOnly: true,
  },
  {
    prefix: "/admin/scm/vendor-feedback",
    permissions: ["supplier.feedback.manage"],
    globalOnly: true,
  },
  {
    prefix: "/admin/scm/sla",
    permissions: ["sla.read", "sla.manage"],
    globalOnly: true,
  },
  {
    prefix: "/admin/scm/purchase-requisitions",
    permissions: [
      "purchase_requisitions.read",
      "purchase_requisitions.manage",
      "purchase_requisitions.approve",
      "mrf.budget_clear",
      "mrf.endorse",
      "mrf.final_approve",
    ],
  },
  {
    prefix: "/admin/scm/rfqs",
    permissions: ["rfq.read", "rfq.manage", "rfq.approve"],
  },
  {
    prefix: "/admin/scm/comparative-statements",
    permissions: [
      "comparative_statements.read",
      "comparative_statements.manage",
      "comparative_statements.approve_manager",
      "comparative_statements.approve_committee",
      "comparative_statements.approve_final",
    ],
  },
  {
    prefix: "/admin/scm/purchase-orders",
    permissions: [
      "purchase_orders.read",
      "purchase_orders.manage",
      "purchase_orders.approve",
      "purchase_orders.approve_manager",
      "purchase_orders.approve_committee",
      "purchase_orders.approve_final",
      "goods_receipts.manage",
    ],
  },
  {
    prefix: "/admin/scm/goods-receipts",
    permissions: [
      "goods_receipts.read",
      "goods_receipts.manage",
      "purchase_orders.manage",
      "purchase_requisitions.manage",
      "supplier.feedback.manage",
    ],
  },
  {
    prefix: "/admin/scm/landed-costs",
    permissions: ["landed_costs.read", "landed_costs.manage"],
  },
  {
    prefix: "/admin/scm/supplier-returns",
    permissions: [
      "supplier_returns.read",
      "supplier_returns.manage",
      "supplier_returns.approve",
    ],
  },
  {
    prefix: "/admin/scm/replenishment",
    permissions: ["replenishment.read", "replenishment.manage"],
  },
  {
    prefix: "/admin/scm/warehouse-transfers",
    permissions: [
      "warehouse_transfers.read",
      "warehouse_transfers.manage",
      "warehouse_transfers.approve",
    ],
  },
  {
    prefix: "/admin/scm/material-requests",
    permissions: [
      "material_requests.read",
      "material_requests.manage",
      "material_requests.endorse_supervisor",
      "material_requests.endorse_project_manager",
      "material_requests.approve_admin",
      "material_releases.read",
      "material_releases.manage",
    ],
  },
  {
    prefix: "/admin/scm/material-releases",
    permissions: [
      "material_releases.read",
      "material_releases.manage",
      "material_requests.read",
      "material_requests.approve_admin",
    ],
  },
  {
    prefix: "/admin/scm/warehouse-locations",
    permissions: ["warehouse_locations.read", "warehouse_locations.manage"],
  },
  {
    prefix: "/admin/scm/reorder-alerts",
    permissions: ["stock_alerts.read", "stock_alerts.manage"],
  },
  {
    prefix: "/admin/scm/physical-verifications",
    permissions: [
      "physical_verifications.read",
      "physical_verifications.manage",
      "physical_verifications.approve",
    ],
  },
  {
    prefix: "/admin/scm/stock-reports",
    permissions: ["stock_reports.read"],
  },
  {
    prefix: "/admin/scm/payment-requests",
    permissions: [
      "payment_requests.read",
      "payment_requests.manage",
      "payment_requests.approve_admin",
      "payment_requests.approve_finance",
      "payment_requests.treasury",
    ],
  },
  {
    prefix: "/admin/scm/payment-reports",
    permissions: ["payment_reports.read"],
  },
  {
    prefix: "/admin/scm/stock-cards",
    permissions: [
      "inventory.manage",
      "material_releases.read",
      "material_releases.manage",
      "material_requests.approve_admin",
    ],
  },
  {
    prefix: "/admin/scm/assets",
    permissions: ["asset_register.read", "asset_register.manage"],
  },
  {
    prefix: "/admin/scm/supplier-ledger",
    permissions: [
      "supplier_ledger.read",
      "supplier_invoices.read",
      "supplier_payments.read",
    ],
    globalOnly: true,
  },
  {
    prefix: "/admin/scm/three-way-match",
    permissions: [
      "three_way_match.read",
      "supplier_invoices.read",
      "supplier_invoices.manage",
    ],
    globalOnly: true,
  },
  {
    prefix: "/admin/scm",
    permissions: [
      "scm.access",
      "suppliers.read",
      "suppliers.manage",
      "supplier_performance.read",
      "sla.read",
      "sla.manage",
      "purchase_requisitions.read",
      "purchase_requisitions.manage",
      "purchase_requisitions.approve",
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
      "payment_requests.read",
      "payment_requests.manage",
      "payment_requests.approve_admin",
      "payment_requests.approve_finance",
      "payment_requests.treasury",
      "payment_reports.read",
      "inventory.manage",
      "supplier_ledger.read",
      "supplier_invoices.read",
      "supplier_invoices.manage",
      "supplier_payments.read",
      "supplier_payments.manage",
      "three_way_match.read",
    ],
  },
  {
    prefix: "/admin/analytics",
    permissions: ["dashboard.read", "admin.panel.access"],
  },
  {
    prefix: "/admin/investors/portal-access",
    permissions: ["investors.manage", "users.manage"],
    globalOnly: true,
  },
  {
    prefix: "/admin/investors/documents",
    permissions: [
      "investor_documents.read",
      "investor_documents.manage",
      "investor_documents.review",
      "investors.manage",
    ],
    globalOnly: true,
  },
  {
    prefix: "/admin/investors/profile-requests",
    permissions: [
      "investor_profile_requests.read",
      "investor_profile_requests.review",
      "investors.manage",
    ],
    globalOnly: true,
  },
  {
    prefix: "/admin/investors/statement-schedules",
    permissions: ["investor_statement.read", "investors.manage"],
    globalOnly: true,
  },
  {
    prefix: "/admin/investors/retained-profit",
    permissions: [
      "investor_profit.read",
      "investor_profit.manage",
      "investor_profit.approve",
      "investor_profit.post",
      "investor_statement.read",
    ],
    globalOnly: true,
  },
  {
    prefix: "/admin/investors/withdrawals",
    permissions: [
      "investor_withdrawals.read",
      "investor_withdrawals.review",
      "investor_withdrawals.settle",
      "investors.manage",
    ],
    globalOnly: true,
  },
  {
    prefix: "/admin/investors/my-tasks",
    permissions: [
      "investors.manage",
      "investor_profit.approve",
      "investor_profit.post",
      "investor_payout.approve",
      "investor_payout.pay",
    ],
    globalOnly: true,
  },
  {
    prefix: "/admin/investors/exceptions",
    permissions: [
      "investors.read",
      "investors.manage",
      "investor_profit.read",
      "investor_profit.manage",
      "investor_payout.read",
      "investor_payout.manage",
    ],
    globalOnly: true,
  },
  {
    prefix: "/admin/investors/notifications",
    permissions: ["investor.notifications.read"],
    globalOnly: true,
  },
  {
    prefix: "/admin/investors/activity-log",
    permissions: ["investor.activity_log.read", "settings.activitylog.read", "settings.manage"],
    globalOnly: true,
  },
  {
    prefix: "/admin/investors",
    permissions: [
      "investors.read",
      "investors.manage",
      "investor_documents.read",
      "investor_documents.manage",
      "investor_documents.review",
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
      "investor_statement.read",
    ],
    globalOnly: true,
  },
  { prefix: "/admin/reports", permissions: ["reports.read"] },
  {
    prefix: "/admin/settings/activitylog",
    permissions: ["settings.activitylog.read", "settings.manage"],
  },
  { prefix: "/admin/settings/payroll", permissions: ["payroll.manage"] },
  { prefix: "/admin/settings/rbac", permissions: ["roles.manage"] },
  {
    prefix: "/admin/settings/banner",
    permissions: ["settings.banner.manage", "settings.manage"],
  },
  { prefix: "/admin/settings/general", permissions: ["settings.manage"] },
  {
    prefix: "/admin/settings/payment",
    permissions: ["settings.payment.manage", "settings.manage"],
  },
  {
    prefix: "/admin/settings/warehouses",
    permissions: ["settings.warehouse.manage", "settings.manage"],
  },
  {
    prefix: "/admin/management/couriers",
    permissions: ["settings.courier.manage", "settings.manage"],
  },
  {
    prefix: "/admin/management/vatmanagent",
    permissions: ["settings.vat.manage", "settings.manage"],
  },
  {
    prefix: "/admin/warehouse/shipping-rates",
    permissions: ["settings.shipping.manage", "settings.manage"],
  },
  {
    prefix: "/admin/settings",
    permissions: [
      "settings.manage",
      "settings.banner.manage",
      "settings.payment.manage",
      "settings.warehouse.manage",
      "settings.courier.manage",
      "settings.vat.manage",
      "settings.shipping.manage",
    ],
  },
  { prefix: "/admin/operations/users", permissions: ["users.read", "users.manage"] },
  { prefix: "/admin/operations/products", permissions: ["products.manage"] },
  { prefix: "/admin/operations/orders", permissions: ["orders.read_all"] },
  { prefix: "/admin/chats", permissions: ["chats.manage"] },
  {
    prefix: "/admin/operations/shipments",
    permissions: ["shipments.manage", "orders.read_all"],
  },
  {
    prefix: "/admin/operations/delivery",
    permissions: ["delivery.dashboard.access"],
  },
  { prefix: "/admin/warehouse/logistics", permissions: ["logistics.manage"] },
  {
    prefix: "/admin/warehouse/delivery-men",
    permissions: ["delivery-men.manage", "logistics.manage"],
  },
  { prefix: "/admin/warehouse/payroll", permissions: ["payroll.manage"] },
  { prefix: "/admin/management/categories", permissions: ["products.manage"] },
  { prefix: "/admin/management/brands", permissions: ["products.manage"] },
  { prefix: "/admin/management/writers", permissions: ["products.manage"] },
  { prefix: "/admin/management/publishers", permissions: ["products.manage"] },
  { prefix: "/admin/warehouse/stock", permissions: ["inventory.manage"] },
  { prefix: "/admin/management", permissions: ["products.manage"] },
  { prefix: "/admin/management/blogs", permissions: ["blogs.manage"] },
  {
    prefix: "/admin/management/newsletter",
    permissions: ["newsletter.manage"],
  },
  { prefix: "/admin/management/coupons", permissions: ["coupons.manage"] },
  { prefix: "/admin/delivery", permissions: ["delivery.dashboard.access"] },
  { prefix: "/admin/profile", permissions: ["profile.manage"] },
  { prefix: "/admin", permissions: ["dashboard.read", "admin.panel.access"] },
];

const supplierPagePermissionRules: PermissionRule[] = [
  {
    prefix: "/supplier/rfqs",
    permissions: ["supplier.rfq.read"],
  },
  {
    prefix: "/supplier/purchase-orders",
    permissions: ["supplier.purchase_orders.read"],
  },
  {
    prefix: "/supplier/invoices",
    permissions: ["supplier.invoices.read"],
  },
  {
    prefix: "/supplier/payments",
    permissions: ["supplier.payments.read"],
  },
  {
    prefix: "/supplier/work-orders",
    permissions: ["supplier.work_orders.read"],
  },
  {
    prefix: "/supplier/profile",
    permissions: [
      "supplier.profile.read",
      "supplier.profile.update_request.submit",
      "supplier.documents.read",
      "supplier.documents.update_request.submit",
    ],
  },
  {
    prefix: "/supplier/notifications",
    permissions: ["supplier.notifications.read"],
  },
  {
    prefix: "/supplier/feedback",
    permissions: ["supplier.feedback.read"],
  },
  {
    prefix: "/supplier",
    permissions: ["supplier.portal.access"],
  },
];

const investorPagePermissionRules: PermissionRule[] = [
  {
    prefix: "/investor/dashboard",
    permissions: ["investor.portal.overview.read"],
  },
  {
    prefix: "/investor/ledger",
    permissions: ["investor.portal.ledger.read"],
  },
  {
    prefix: "/investor/allocations",
    permissions: ["investor.portal.allocations.read"],
  },
  {
    prefix: "/investor/profit-runs",
    permissions: ["investor.portal.profit.read"],
  },
  {
    prefix: "/investor/payouts",
    permissions: ["investor.portal.payout.read"],
  },
  {
    prefix: "/investor/withdrawals",
    permissions: ["investor.portal.withdrawals.read"],
  },
  {
    prefix: "/investor/statements",
    permissions: ["investor.portal.statement.read"],
  },
  {
    prefix: "/investor/documents",
    permissions: ["investor.portal.documents.read"],
  },
  {
    prefix: "/investor/profile",
    permissions: ["investor.portal.profile.read"],
  },
  {
    prefix: "/investor/notifications",
    permissions: ["investor.portal.notifications.read"],
  },
  {
    prefix: "/investor",
    permissions: ["investor.portal.access"],
  },
];

const apiPermissionRules: PermissionRule[] = [
  {
    prefix: "/api/supplier/overview",
    methods: ["GET"],
    permissions: ["supplier.portal.access"],
  },
  {
    prefix: "/api/supplier/rfqs",
    methods: ["GET"],
    permissions: ["supplier.rfq.read"],
  },
  {
    prefix: "/api/supplier/rfqs",
    methods: ["POST"],
    permissions: ["supplier.rfq.quote.submit"],
  },
  {
    prefix: "/api/supplier/purchase-orders",
    methods: ["GET"],
    permissions: ["supplier.purchase_orders.read"],
  },
  {
    prefix: "/api/supplier/invoices",
    methods: ["GET"],
    permissions: ["supplier.invoices.read"],
  },
  {
    prefix: "/api/supplier/payments",
    methods: ["GET"],
    permissions: ["supplier.payments.read"],
  },
  {
    prefix: "/api/supplier/work-orders",
    methods: ["GET"],
    permissions: ["supplier.work_orders.read"],
  },
  {
    prefix: "/api/supplier/profile",
    methods: ["GET"],
    permissions: ["supplier.profile.read", "supplier.documents.read"],
  },
  {
    prefix: "/api/supplier/profile",
    methods: ["POST", "PATCH", "PUT"],
    permissions: [
      "supplier.profile.update_request.submit",
      "supplier.documents.update_request.submit",
    ],
  },
  {
    prefix: "/api/supplier/notifications",
    methods: ["GET", "PATCH", "PUT"],
    permissions: ["supplier.notifications.read"],
  },
  {
    prefix: "/api/supplier/feedback",
    methods: ["GET"],
    permissions: ["supplier.feedback.read"],
  },
  {
    prefix: "/api/scm/supplier-profile-requests",
    methods: ["GET"],
    permissions: ["supplier.profile_requests.read", "supplier.profile_requests.review"],
    globalOnly: true,
  },
  {
    prefix: "/api/scm/supplier-profile-requests",
    methods: ["POST", "PATCH", "PUT"],
    permissions: ["supplier.profile_requests.review"],
    globalOnly: true,
  },
  {
    prefix: "/api/scm/supplier-feedback",
    methods: ["GET"],
    permissions: ["supplier.feedback.manage", "supplier.profile_requests.read"],
    globalOnly: true,
  },
  {
    prefix: "/api/scm/supplier-feedback",
    methods: ["POST", "PATCH", "PUT", "DELETE"],
    permissions: ["supplier.feedback.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/investor/overview",
    methods: ["GET"],
    permissions: ["investor.portal.overview.read"],
  },
  {
    prefix: "/api/investor/ledger",
    methods: ["GET"],
    permissions: ["investor.portal.ledger.read"],
  },
  {
    prefix: "/api/investor/allocations",
    methods: ["GET"],
    permissions: ["investor.portal.allocations.read"],
  },
  {
    prefix: "/api/investor/profit-runs",
    methods: ["GET"],
    permissions: ["investor.portal.profit.read"],
  },
  {
    prefix: "/api/investor/payouts",
    methods: ["GET"],
    permissions: ["investor.portal.payout.read"],
  },
  {
    prefix: "/api/investor/withdrawals",
    methods: ["GET"],
    permissions: ["investor.portal.withdrawals.read"],
  },
  {
    prefix: "/api/investor/withdrawals",
    methods: ["POST"],
    permissions: ["investor.portal.withdrawals.submit"],
  },
  {
    prefix: "/api/investor/statements",
    methods: ["GET"],
    permissions: ["investor.portal.statement.read"],
  },
  {
    prefix: "/api/investor/documents",
    methods: ["GET"],
    permissions: ["investor.portal.documents.read"],
  },
  {
    prefix: "/api/investor/documents",
    methods: ["POST"],
    permissions: ["investor.portal.documents.submit"],
  },
  {
    prefix: "/api/investor/profile",
    methods: ["GET"],
    permissions: ["investor.portal.profile.read"],
  },
  {
    prefix: "/api/investor/profile",
    methods: ["POST"],
    permissions: ["investor.portal.profile.submit"],
  },
  {
    prefix: "/api/investor/notifications",
    methods: ["GET", "PATCH"],
    permissions: ["investor.portal.notifications.read"],
  },
  {
    prefix: "/api/admin/investor-profile-requests",
    methods: ["GET"],
    permissions: [
      "investor_profile_requests.read",
      "investor_profile_requests.review",
      "investors.manage",
    ],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-profile-requests",
    methods: ["PATCH"],
    permissions: ["investor_profile_requests.review", "investors.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-notifications",
    methods: ["GET", "PATCH"],
    permissions: ["investor.notifications.read"],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-withdrawals",
    methods: ["GET"],
    permissions: [
      "investor_withdrawals.read",
      "investor_withdrawals.review",
      "investor_withdrawals.settle",
      "investors.manage",
    ],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-withdrawals",
    methods: ["PATCH"],
    permissions: [
      "investor_withdrawals.review",
      "investor_withdrawals.settle",
      "investors.manage",
    ],
    globalOnly: true,
  },
  {
    prefix: "/api/investor",
    methods: ["GET"],
    permissions: ["investor.portal.access"],
  },
  {
    prefix: "/api/scm/dashboard/overview",
    methods: ["GET"],
    permissions: [
      "dashboard.read",
      "purchase_requisitions.read",
      "rfq.read",
      "comparative_statements.read",
      "purchase_orders.read",
      "goods_receipts.read",
      "payment_requests.read",
      "payment_reports.read",
      "stock_reports.read",
      "supplier_performance.read",
      "supplier.feedback.manage",
      "sla.read",
      "supplier_ledger.read",
      "three_way_match.read",
    ],
  },
  {
    prefix: "/api/scm/notifications",
    methods: ["GET", "POST", "PATCH", "PUT"],
    permissions: ["scm.access"],
  },
  {
    prefix: "/api/scm/my-tasks",
    methods: ["GET"],
    permissions: ["scm.access"],
  },
  {
    prefix: "/api/scm/exceptions",
    methods: ["GET"],
    permissions: ["scm.access"],
  },
  {
    prefix: "/api/scm/reports/export",
    methods: ["GET"],
    permissions: [
      "dashboard.read",
      "purchase_requisitions.read",
      "rfq.read",
      "comparative_statements.read",
      "purchase_orders.read",
      "goods_receipts.read",
      "payment_requests.read",
      "payment_reports.read",
      "stock_reports.read",
      "supplier_performance.read",
      "supplier.feedback.manage",
      "sla.read",
      "supplier_ledger.read",
      "three_way_match.read",
    ],
  },
  {
    prefix: "/api/scm/suppliers",
    methods: ["GET", "POST", "PUT", "PATCH"],
    permissions: ["suppliers.read", "suppliers.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/scm/supplier-categories",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    permissions: ["suppliers.read", "suppliers.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/scm/supplier-intelligence",
    methods: ["GET"],
    permissions: ["supplier_performance.read"],
    globalOnly: true,
  },
  {
    prefix: "/api/scm/sla/policies",
    methods: ["GET"],
    permissions: ["sla.read", "sla.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/scm/sla/policies",
    methods: ["POST", "PATCH", "PUT"],
    permissions: ["sla.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/scm/sla/breaches",
    methods: ["GET"],
    permissions: ["sla.read", "sla.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/scm/sla/breaches",
    methods: ["POST", "PATCH", "PUT"],
    permissions: ["sla.manage", "sla.dispute.resolve"],
    globalOnly: true,
  },
  {
    prefix: "/api/scm/sla/analytics",
    methods: ["GET"],
    permissions: ["sla.read", "sla.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/scm/sla/notifications",
    methods: ["POST"],
    permissions: ["sla.manage", "sla.notifications.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/scm/sla/owners",
    methods: ["GET"],
    permissions: ["sla.read", "sla.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/scm/sla/termination-cases",
    methods: ["GET"],
    permissions: ["sla.read", "sla.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/scm/sla/termination-cases",
    methods: ["PATCH", "PUT"],
    permissions: ["sla.manage", "sla.termination.approve"],
    globalOnly: true,
  },
  {
    prefix: "/api/scm/purchase-requisitions",
    methods: ["GET"],
    permissions: [
      "purchase_requisitions.read",
      "purchase_requisitions.manage",
      "purchase_requisitions.approve",
      "mrf.budget_clear",
      "mrf.endorse",
      "mrf.final_approve",
    ],
  },
  {
    prefix: "/api/scm/rfqs",
    methods: ["GET"],
    permissions: ["rfq.read", "rfq.manage", "rfq.approve"],
  },
  {
    prefix: "/api/scm/rfqs",
    methods: ["POST"],
    permissions: ["rfq.manage"],
  },
  {
    prefix: "/api/scm/rfqs",
    methods: ["PATCH", "PUT"],
    permissions: ["rfq.manage", "rfq.approve", "purchase_orders.manage"],
  },
  {
    prefix: "/api/scm/comparative-statements",
    methods: ["GET"],
    permissions: [
      "comparative_statements.read",
      "comparative_statements.manage",
      "comparative_statements.approve_manager",
      "comparative_statements.approve_committee",
      "comparative_statements.approve_final",
    ],
  },
  {
    prefix: "/api/scm/comparative-statements",
    methods: ["POST"],
    permissions: ["comparative_statements.manage"],
  },
  {
    prefix: "/api/scm/comparative-statements",
    methods: ["PATCH", "PUT"],
    permissions: [
      "comparative_statements.manage",
      "comparative_statements.approve_manager",
      "comparative_statements.approve_committee",
      "comparative_statements.approve_final",
      "purchase_orders.manage",
    ],
  },
  {
    prefix: "/api/scm/purchase-order-terms-templates",
    methods: ["GET"],
    permissions: [
      "purchase_orders.read",
      "purchase_orders.manage",
      "purchase_orders.approve",
      "purchase_orders.approve_manager",
      "purchase_orders.approve_committee",
      "purchase_orders.approve_final",
    ],
  },
  {
    prefix: "/api/scm/purchase-order-terms-templates",
    methods: ["POST", "PATCH", "PUT"],
    permissions: ["purchase_orders.manage", "settings.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/scm/purchase-requisitions",
    methods: ["POST"],
    permissions: ["purchase_requisitions.manage"],
  },
  {
    prefix: "/api/scm/purchase-requisitions",
    methods: ["PATCH", "PUT"],
    permissions: [
      "purchase_requisitions.manage",
      "purchase_requisitions.approve",
      "purchase_orders.manage",
      "mrf.budget_clear",
      "mrf.endorse",
      "mrf.final_approve",
    ],
  },
  {
    prefix: "/api/scm/purchase-orders",
    methods: ["GET"],
    permissions: [
      "purchase_orders.read",
      "purchase_orders.manage",
      "purchase_orders.approve",
      "purchase_orders.approve_manager",
      "purchase_orders.approve_committee",
      "purchase_orders.approve_final",
      "goods_receipts.manage",
    ],
  },
  {
    prefix: "/api/scm/purchase-orders",
    methods: ["POST"],
    permissions: ["purchase_orders.manage"],
  },
  {
    prefix: "/api/scm/purchase-orders",
    methods: ["PATCH", "PUT"],
    permissions: [
      "purchase_orders.manage",
      "purchase_orders.approve",
      "purchase_orders.approve_manager",
      "purchase_orders.approve_committee",
      "purchase_orders.approve_final",
    ],
  },
  {
    prefix: "/api/scm/goods-receipts",
    methods: ["GET"],
    permissions: [
      "goods_receipts.read",
      "goods_receipts.manage",
      "purchase_orders.manage",
      "purchase_requisitions.manage",
      "supplier.feedback.manage",
    ],
  },
  {
    prefix: "/api/scm/goods-receipts",
    methods: ["POST"],
    permissions: ["goods_receipts.manage"],
  },
  {
    prefix: "/api/scm/goods-receipts",
    methods: ["PATCH", "PUT"],
    permissions: [
      "goods_receipts.read",
      "goods_receipts.manage",
      "purchase_orders.manage",
      "purchase_requisitions.manage",
      "supplier.feedback.manage",
    ],
  },
  {
    prefix: "/api/scm/landed-costs",
    methods: ["GET"],
    permissions: ["landed_costs.read", "landed_costs.manage"],
  },
  {
    prefix: "/api/scm/landed-costs",
    methods: ["POST", "PATCH", "PUT", "DELETE"],
    permissions: ["landed_costs.manage"],
  },
  {
    prefix: "/api/scm/supplier-returns",
    methods: ["GET"],
    permissions: [
      "supplier_returns.read",
      "supplier_returns.manage",
      "supplier_returns.approve",
    ],
  },
  {
    prefix: "/api/scm/supplier-returns",
    methods: ["POST"],
    permissions: ["supplier_returns.manage"],
  },
  {
    prefix: "/api/scm/supplier-returns",
    methods: ["PATCH", "PUT"],
    permissions: ["supplier_returns.manage", "supplier_returns.approve"],
  },
  {
    prefix: "/api/scm/replenishment/rules",
    methods: ["GET"],
    permissions: ["replenishment.read", "replenishment.manage"],
  },
  {
    prefix: "/api/scm/replenishment/rules",
    methods: ["POST", "PATCH", "PUT"],
    permissions: ["replenishment.manage"],
  },
  {
    prefix: "/api/scm/replenishment/suggestions",
    methods: ["GET"],
    permissions: ["replenishment.read", "replenishment.manage"],
  },
  {
    prefix: "/api/scm/replenishment/suggestions",
    methods: ["POST"],
    permissions: ["replenishment.manage", "purchase_requisitions.manage"],
  },
  {
    prefix: "/api/scm/warehouse-transfers",
    methods: ["GET"],
    permissions: [
      "warehouse_transfers.read",
      "warehouse_transfers.manage",
      "warehouse_transfers.approve",
    ],
  },
  {
    prefix: "/api/scm/warehouse-transfers",
    methods: ["POST"],
    permissions: ["warehouse_transfers.manage"],
  },
  {
    prefix: "/api/scm/warehouse-transfers",
    methods: ["PATCH", "PUT"],
    permissions: ["warehouse_transfers.manage", "warehouse_transfers.approve"],
  },
  {
    prefix: "/api/scm/material-requests",
    methods: ["GET"],
    permissions: [
      "material_requests.read",
      "material_requests.manage",
      "material_requests.endorse_supervisor",
      "material_requests.endorse_project_manager",
      "material_requests.approve_admin",
      "material_releases.read",
      "material_releases.manage",
    ],
  },
  {
    prefix: "/api/scm/material-requests",
    methods: ["POST"],
    permissions: ["material_requests.manage"],
  },
  {
    prefix: "/api/scm/material-requests",
    methods: ["PATCH", "PUT"],
    permissions: [
      "material_requests.manage",
      "material_requests.endorse_supervisor",
      "material_requests.endorse_project_manager",
      "material_requests.approve_admin",
    ],
  },
  {
    prefix: "/api/scm/material-releases",
    methods: ["GET"],
    permissions: [
      "material_releases.read",
      "material_releases.manage",
      "material_requests.read",
      "material_requests.approve_admin",
    ],
  },
  {
    prefix: "/api/scm/material-releases",
    methods: ["POST"],
    permissions: ["material_releases.manage"],
  },
  {
    prefix: "/api/scm/warehouse-locations",
    methods: ["GET"],
    permissions: ["warehouse_locations.read", "warehouse_locations.manage"],
  },
  {
    prefix: "/api/scm/warehouse-locations",
    methods: ["POST", "PATCH", "PUT"],
    permissions: ["warehouse_locations.manage"],
  },
  {
    prefix: "/api/scm/stock-bin-levels",
    methods: ["GET"],
    permissions: ["warehouse_locations.read", "inventory.manage"],
  },
  {
    prefix: "/api/scm/reorder-alerts/scan",
    methods: ["POST"],
    permissions: ["stock_alerts.manage"],
  },
  {
    prefix: "/api/scm/reorder-alerts",
    methods: ["GET"],
    permissions: ["stock_alerts.read", "stock_alerts.manage"],
  },
  {
    prefix: "/api/scm/reorder-alerts",
    methods: ["POST", "PATCH", "PUT"],
    permissions: ["stock_alerts.manage"],
  },
  {
    prefix: "/api/scm/physical-verifications",
    methods: ["GET"],
    permissions: [
      "physical_verifications.read",
      "physical_verifications.manage",
      "physical_verifications.approve",
    ],
  },
  {
    prefix: "/api/scm/physical-verifications",
    methods: ["POST", "PATCH", "PUT"],
    permissions: [
      "physical_verifications.manage",
      "physical_verifications.approve",
    ],
  },
  {
    prefix: "/api/scm/stock-reports",
    methods: ["GET"],
    permissions: ["stock_reports.read"],
  },
  {
    prefix: "/api/scm/payment-requests",
    methods: ["GET"],
    permissions: [
      "payment_requests.read",
      "payment_requests.manage",
      "payment_requests.approve_admin",
      "payment_requests.approve_finance",
      "payment_requests.treasury",
    ],
  },
  {
    prefix: "/api/scm/payment-requests",
    methods: ["POST", "PATCH", "PUT"],
    permissions: [
      "payment_requests.manage",
      "payment_requests.approve_admin",
      "payment_requests.approve_finance",
      "payment_requests.treasury",
    ],
  },
  {
    prefix: "/api/scm/payment-reports",
    methods: ["GET"],
    permissions: ["payment_reports.read"],
  },
  {
    prefix: "/api/scm/stock-cards",
    methods: ["GET"],
    permissions: [
      "inventory.manage",
      "material_releases.read",
      "material_releases.manage",
      "material_requests.approve_admin",
    ],
  },
  {
    prefix: "/api/scm/assets",
    methods: ["GET"],
    permissions: ["asset_register.read", "asset_register.manage"],
  },
  {
    prefix: "/api/scm/assets",
    methods: ["PATCH", "PUT"],
    permissions: ["asset_register.manage"],
  },
  {
    prefix: "/api/scm/supplier-ledger",
    methods: ["GET"],
    permissions: [
      "supplier_ledger.read",
      "supplier_invoices.read",
      "supplier_payments.read",
    ],
    globalOnly: true,
  },
  {
    prefix: "/api/scm/supplier-invoices",
    methods: ["GET"],
    permissions: [
      "supplier_ledger.read",
      "supplier_invoices.read",
      "supplier_invoices.manage",
    ],
    globalOnly: true,
  },
  {
    prefix: "/api/scm/supplier-invoices",
    methods: ["POST"],
    permissions: ["supplier_invoices.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/scm/supplier-invoices",
    methods: ["PATCH", "PUT"],
    permissions: [
      "supplier_invoices.manage",
      "supplier_payments.override_hold",
    ],
    globalOnly: true,
  },
  {
    prefix: "/api/scm/three-way-match",
    methods: ["GET"],
    permissions: [
      "three_way_match.read",
      "supplier_invoices.read",
      "supplier_invoices.manage",
    ],
    globalOnly: true,
  },
  {
    prefix: "/api/scm/supplier-payments",
    methods: ["GET"],
    permissions: [
      "supplier_ledger.read",
      "supplier_payments.read",
      "supplier_payments.manage",
    ],
    globalOnly: true,
  },
  {
    prefix: "/api/scm/supplier-payments",
    methods: ["POST", "PATCH", "PUT"],
    permissions: ["supplier_payments.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/rbac/users",
    permissions: ["users.manage"],
  },
  {
    prefix: "/api/admin/investors",
    methods: ["GET"],
    permissions: [
      "investors.read",
      "investors.manage",
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
      "investor_statement.read",
    ],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investors",
    methods: ["POST", "PATCH", "PUT"],
    permissions: ["investors.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-transactions",
    methods: ["GET"],
    permissions: [
      "investor_ledger.read",
      "investor_ledger.manage",
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
    ],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-transactions",
    methods: ["POST", "PATCH", "PUT"],
    permissions: ["investor_ledger.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-allocations",
    methods: ["GET"],
    permissions: [
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
      "investor_statement.read",
    ],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-allocations",
    methods: ["POST", "PATCH", "PUT", "DELETE"],
    permissions: ["investor_allocations.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-profit-runs",
    methods: ["GET"],
    permissions: [
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
    ],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-profit-runs/",
    methods: ["PATCH"],
    permissions: ["investor_profit.approve"],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-profit-runs/",
    methods: ["POST"],
    permissions: ["investor_profit.post", "investor_payout.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-profit-runs",
    methods: ["POST"],
    permissions: ["investor_profit.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-statement-schedules",
    methods: ["GET"],
    permissions: ["investor_statement.read", "investors.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-retained-profit",
    methods: ["GET"],
    permissions: [
      "investor_profit.read",
      "investor_profit.manage",
      "investor_profit.approve",
      "investor_profit.post",
      "investor_statement.read",
    ],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-statement-schedules",
    methods: ["POST", "PATCH", "PUT"],
    permissions: ["investors.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-payouts",
    methods: ["GET"],
    permissions: [
      "investor_payout.read",
      "investor_payout.manage",
      "investor_payout.approve",
      "investor_payout.pay",
      "investor_payout.void",
      "investor_statement.read",
    ],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-payouts",
    methods: ["PATCH"],
    permissions: [
      "investor_payout.approve",
      "investor_payout.pay",
      "investor_payout.void",
    ],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-statements",
    methods: ["GET"],
    permissions: [
      "investor_statement.read",
      "investor_payout.read",
      "investor_payout.manage",
      "investor_payout.approve",
      "investor_payout.pay",
      "investor_payout.void",
    ],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-portal-access",
    methods: ["GET", "POST", "PATCH", "PUT"],
    permissions: ["investors.manage", "users.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-change-requests",
    methods: ["PATCH"],
    permissions: ["investors.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-documents",
    methods: ["GET"],
    permissions: [
      "investor_documents.read",
      "investor_documents.manage",
      "investor_documents.review",
      "investors.manage",
    ],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-documents",
    methods: ["POST"],
    permissions: ["investor_documents.manage", "investors.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-documents",
    methods: ["PATCH"],
    permissions: ["investor_documents.review", "investors.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/investor-workspace",
    methods: ["GET"],
    permissions: [
      "investors.read",
      "investors.manage",
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
      "investor_statement.read",
    ],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/supplier-portal-access",
    methods: ["GET", "POST", "PATCH", "PUT"],
    permissions: ["suppliers.manage", "users.manage"],
    globalOnly: true,
  },
  {
    prefix: "/api/admin/activity-log",
    permissions: [
      "investor.activity_log.read",
      "settings.activitylog.read",
      "settings.manage",
    ],
  },
  {
    prefix: "/api/admin/rbac",
    permissions: ["roles.manage"],
  },
  {
    prefix: "/api/admin/management/coupons",
    permissions: ["coupons.manage", "settings.manage"],
  },
  {
    prefix: "/api/admin/shipping-rates",
    permissions: ["settings.shipping.manage", "settings.manage"],
  },
  {
    prefix: "/api/admindashboard",
    permissions: ["dashboard.read"],
  },
  {
    prefix: "/api/analytics/summary",
    permissions: ["dashboard.read", "admin.panel.access"],
  },
  {
    prefix: "/api/reports",
    permissions: ["reports.read"],
  },
  {
    prefix: "/api/payroll",
    permissions: ["payroll.manage"],
  },
  {
    prefix: "/api/orders",
    methods: ["GET"],
    permissions: ["orders.read_all", "orders.read_own"],
  },
  {
    prefix: "/api/orders",
    methods: ["PATCH"],
    permissions: ["orders.update"],
  },
  {
    prefix: "/api/shipments",
    methods: ["GET"],
    permissions: [
      "shipments.manage",
      "logistics.manage",
      "orders.read_all",
      "orders.read_own",
    ],
  },
  {
    prefix: "/api/shipments",
    methods: ["POST", "PATCH", "DELETE"],
    permissions: ["shipments.manage", "logistics.manage"],
  },
  {
    prefix: "/api/admin/warehouse-dashboard",
    permissions: [
      "dashboard.read",
      "inventory.manage",
      "orders.read_all",
      "shipments.manage",
    ],
  },
  {
    prefix: "/api/admin/warehouse/payroll",
    permissions: ["payroll.manage"],
  },
  {
    prefix: "/api/blog",
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    permissions: ["blogs.manage"],
  },
  {
    prefix: "/api/products",
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    permissions: ["products.manage"],
  },
  {
    prefix: "/api/product-variants",
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    permissions: ["products.manage"],
  },
  {
    prefix: "/api/product-attributes",
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    permissions: ["products.manage"],
  },
  {
    prefix: "/api/attributes",
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    permissions: ["products.manage"],
  },
  {
    prefix: "/api/attribute-values",
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    permissions: ["products.manage"],
  },
  {
    prefix: "/api/categories",
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    permissions: ["products.manage"],
  },
  {
    prefix: "/api/brands",
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    permissions: ["products.manage"],
  },
  {
    prefix: "/api/writers",
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    permissions: ["products.manage"],
  },
  {
    prefix: "/api/publishers",
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    permissions: ["products.manage"],
  },
  {
    prefix: "/api/digital-assets",
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    permissions: ["products.manage"],
  },
  {
    prefix: "/api/stock-levels",
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    permissions: ["inventory.manage"],
  },
  {
    prefix: "/api/inventory-logs",
    permissions: ["inventory.manage"],
  },
  {
    prefix: "/api/banners",
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    permissions: ["settings.banner.manage", "settings.manage"],
  },
  {
    prefix: "/api/vat-classes",
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    permissions: ["settings.vat.manage", "settings.manage"],
  },
  {
    prefix: "/api/vat-rates",
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    permissions: ["settings.vat.manage", "settings.manage"],
  },
  {
    prefix: "/api/warehouses",
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    permissions: ["settings.warehouse.manage", "settings.manage"],
  },
  {
    prefix: "/api/couriers",
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    permissions: ["settings.courier.manage", "settings.manage"],
  },
  {
    prefix: "/api/delivery-men",
    permissions: ["delivery-men.manage", "logistics.manage"],
  },
  {
    prefix: "/api/newsletter/subscribe",
    permissions: [],
  },
  {
    prefix: "/api/newsletter/unsubscribe",
    permissions: [],
  },
  {
    prefix: "/api/newsletter",
    methods: ["POST", "PUT", "PATCH", "DELETE"],
    permissions: ["newsletter.manage"],
  },
  {
    prefix: "/api/newsletter/subscribers",
    permissions: ["newsletter.manage"],
  },
  {
    prefix: "/api/newsletter/",
    permissions: ["newsletter.manage"],
    excludePrefixes: [
      "/api/newsletter/subscribe",
      "/api/newsletter/unsubscribe",
    ],
  },
];

function getPermissionKeys(session: SessionShape): string[] {
  return Array.isArray(session?.user?.permissions)
    ? session.user.permissions
    : [];
}

function getGlobalPermissionKeys(session: SessionShape): string[] {
  return Array.isArray(session?.user?.globalPermissions)
    ? session.user.globalPermissions
    : [];
}

function hasAnyPermission(
  permissionKeys: string[],
  required: string[],
): boolean {
  if (required.length === 0) return true;
  return required.some((permission) => permissionKeys.includes(permission));
}

function hasAdminPanelAccess(session: SessionShape): boolean {
  const permissionKeys = getPermissionKeys(session);
  return permissionKeys.includes("admin.panel.access");
}

function hasSupplierPortal(session: SessionShape): boolean {
  const permissionKeys = getPermissionKeys(session);
  return permissionKeys.includes("supplier.portal.access");
}

function hasInvestorPortal(session: SessionShape): boolean {
  const permissionKeys = getPermissionKeys(session);
  return permissionKeys.includes("investor.portal.access");
}

function getDefaultAdminRoute(
  session: SessionShape,
): "/admin" | "/admin/warehouse" {
  return session?.user?.defaultAdminRoute === "/admin/warehouse"
    ? "/admin/warehouse"
    : "/admin";
}

function findMatchedRule(
  pathname: string,
  method: string,
  rules: PermissionRule[],
): PermissionRule | null {
  for (const rule of rules) {
    const requiresNestedMatch = rule.prefix.endsWith("/");
    const matchPrefix = requiresNestedMatch
      ? pathname.startsWith(rule.prefix)
      : pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`);

    if (!matchPrefix) {
      continue;
    }

    if (
      rule.excludePrefixes &&
      rule.excludePrefixes.some((excluded) => {
        if (excluded.endsWith("/")) {
          return pathname.startsWith(excluded);
        }
        return pathname === excluded || pathname.startsWith(`${excluded}/`);
      })
    ) {
      continue;
    }

    if (rule.methods && !rule.methods.includes(method.toUpperCase())) {
      continue;
    }
    return rule;
  }
  return null;
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();
  const isAuthRoute = ["/signin", "/sign-up"].includes(pathname);

  // Skip middleware for public paths
  if (
    !isAuthRoute &&
    publicPaths.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    )
  ) {
    return NextResponse.next();
  }

  // Skip middleware for static files
  if (pathname.match(/\.(png|jpg|jpeg|gif|svg|css|js|woff|woff2|ttf|eot)$/)) {
    return NextResponse.next();
  }

  // Most storefront and public API requests do not need authentication. Avoid
  // calling /api/auth/session for those requests: at high traffic that extra
  // round trip would otherwise double the request volume and can touch the
  // session store before a cacheable response is served.
  const matchedApiRule =
    pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/")
      ? findMatchedRule(pathname, method, apiPermissionRules)
      : null;

  if (
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/auth/") &&
    (!matchedApiRule || matchedApiRule.permissions.length === 0)
  ) {
    return NextResponse.next();
  }

  const isUserDashboardRequest =
    pathname === "/ecommerce/user" || pathname.startsWith("/ecommerce/user/");
  const needsPageSession =
    isAuthRoute ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/supplier") ||
    pathname.startsWith("/investor") ||
    pathname === "/delivery" ||
    pathname.startsWith("/delivery/") ||
    isUserDashboardRequest;

  if (!pathname.startsWith("/api/") && !needsPageSession) {
    return NextResponse.next();
  }

  let session: SessionShape = null;

  try {
    const response = await fetch(new URL("/api/auth/session", request.url), {
      headers: {
        cookie: request.headers.get("cookie") || "",
      },
    });

    if (response.ok) {
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const parsedSession = await response.json();
        session = parsedSession?.user ? parsedSession : null;
      }
    }
  } catch (error) {
    console.error("Error checking auth status:", error);
  }

  const permissionKeys = getPermissionKeys(session);
  const globalPermissionKeys = getGlobalPermissionKeys(session);
  const adminAccess = hasAdminPanelAccess(session);
  const defaultAdminRoute = getDefaultAdminRoute(session);
  const dashboardRoute = getDashboardRoute(session?.user);
  const deliveryDashboardAccess = hasDeliveryDashboardAccess(session?.user);
  const supplierPortalAccess =
    hasSupplierPortalAccess(session?.user) || hasSupplierPortal(session);
  const investorPortalAccess =
    hasInvestorPortalAccess(session?.user) || hasInvestorPortal(session);
  const isAdminDeliveryDashboardRoute = isAdminDeliveryRoute(pathname);
  const isLegacyDeliveryRoute = isLegacyDeliveryDashboardRoute(pathname);
  const canUseDeliveryAdminShell =
    deliveryDashboardAccess && isDeliveryAdminShellRoute(pathname);

  // API permission checks
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/")) {
    if (!matchedApiRule) {
      return NextResponse.next();
    }

    if (matchedApiRule.permissions.length === 0) {
      return NextResponse.next();
    }

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const apiPermissionKeys = matchedApiRule.globalOnly
      ? globalPermissionKeys
      : permissionKeys;
    if (!hasAnyPermission(apiPermissionKeys, matchedApiRule.permissions)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.next();
  }

  // Handle protected routes (admin and dashboard)
  const isUserDashboardRoute =
    pathname === "/ecommerce/user" || pathname.startsWith("/ecommerce/user/");
  const isDeliveryDashboardRoute =
    isAdminDeliveryDashboardRoute || isLegacyDeliveryRoute;
  const isProtectedRoute =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/supplier") ||
    pathname.startsWith("/investor") ||
    isUserDashboardRoute ||
    isDeliveryDashboardRoute;

  // Handle permission-aware redirection
  if (session?.user) {
    if (adminAccess && (isUserDashboardRoute || isLegacyDeliveryRoute)) {
      return NextResponse.redirect(new URL(defaultAdminRoute, request.url));
    }

    if (adminAccess && pathname.startsWith("/supplier")) {
      return NextResponse.redirect(new URL(defaultAdminRoute, request.url));
    }

    if (
      adminAccess &&
      pathname.startsWith("/investor") &&
      !investorPortalAccess &&
      session?.user?.role !== "investor"
    ) {
      return NextResponse.redirect(new URL(defaultAdminRoute, request.url));
    }

    if (
      !adminAccess &&
      pathname.startsWith("/admin") &&
      !canUseDeliveryAdminShell
    ) {
      return NextResponse.redirect(new URL(dashboardRoute, request.url));
    }

    if (deliveryDashboardAccess && isUserDashboardRoute) {
      return NextResponse.redirect(new URL(dashboardRoute, request.url));
    }

    if (deliveryDashboardAccess && isLegacyDeliveryRoute) {
      return NextResponse.redirect(new URL(dashboardRoute, request.url));
    }

    if (!deliveryDashboardAccess && isDeliveryDashboardRoute) {
      return NextResponse.redirect(new URL(dashboardRoute, request.url));
    }

    if (pathname.startsWith("/supplier")) {
      if (!supplierPortalAccess) {
        return NextResponse.redirect(new URL(dashboardRoute, request.url));
      }

      const matchedSupplierPageRule = findMatchedRule(
        pathname,
        method,
        supplierPagePermissionRules,
      );
      if (
        matchedSupplierPageRule &&
        !hasAnyPermission(permissionKeys, matchedSupplierPageRule.permissions)
      ) {
        return NextResponse.redirect(new URL(dashboardRoute, request.url));
      }
    }

    if (pathname.startsWith("/investor")) {
      if (!investorPortalAccess) {
        return NextResponse.redirect(new URL(dashboardRoute, request.url));
      }

      const matchedInvestorPageRule = findMatchedRule(
        pathname,
        method,
        investorPagePermissionRules,
      );
      if (
        matchedInvestorPageRule &&
        !hasAnyPermission(permissionKeys, matchedInvestorPageRule.permissions)
      ) {
        return NextResponse.redirect(new URL(dashboardRoute, request.url));
      }
    }

    if (
      (adminAccess || canUseDeliveryAdminShell) &&
      pathname.startsWith("/admin")
    ) {
      if (pathname === "/admin" && defaultAdminRoute !== "/admin") {
        return NextResponse.redirect(new URL(defaultAdminRoute, request.url));
      }

      const matchedPageRule = findMatchedRule(
        pathname,
        method,
        adminPagePermissionRules,
      );
      const pagePermissionKeys = matchedPageRule?.globalOnly
        ? globalPermissionKeys
        : permissionKeys;
      if (
        matchedPageRule &&
        !hasAnyPermission(pagePermissionKeys, matchedPageRule.permissions)
      ) {
        if (pathname !== "/admin") {
          if (pathname === defaultAdminRoute) {
            return NextResponse.redirect(
              new URL("/ecommerce/user/", request.url),
            );
          }
          return NextResponse.redirect(new URL(defaultAdminRoute, request.url));
        }
        return NextResponse.redirect(new URL(dashboardRoute, request.url));
      }
    }
  }

  if (isProtectedRoute && !session?.user) {
    const signInUrl = new URL("/signin", request.url);
    signInUrl.searchParams.set(
      "returnUrl",
      `${pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(signInUrl);
  }

  if (session?.user && isAuthRoute) {
    return NextResponse.redirect(new URL(dashboardRoute, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth|static).*)"],
};
