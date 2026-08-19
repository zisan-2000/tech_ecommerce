"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  ShoppingBag,
  FileText,
  Settings,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Mail,
  Tag,
  Truck,
  MessageCircle,
  BarChart3,
  Warehouse,
  Forklift,
  Landmark,
  Package,
  Users2,
  DollarSign,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState, useEffect, useMemo, useCallback } from "react";

type MenuItem = {
  name: string;
  href?: string;
  icon?: LucideIcon;
  requiredPermissions?: string[];
  requiredGlobalPermissions?: string[];
  subSections?: Array<{
    label: string;
    items: Array<{
      name: string;
      href: string;
      icon?: LucideIcon;
      requiredPermissions?: string[];
      requiredGlobalPermissions?: string[];
    }>;
  }>;
  items?: Array<{
    name: string;
    href: string;
    icon?: LucideIcon;
    requiredPermissions?: string[];
    requiredGlobalPermissions?: string[];
  }>;
  subItems?: Array<{
    name: string;
    href: string;
    requiredPermissions?: string[];
    requiredGlobalPermissions?: string[];
  }>;
};

const menuItems: MenuItem[] = [
  {
    name: "Overview",
    items: [
      {
        name: "Dashboard",
        href: "/admin",
        icon: LayoutDashboard,
        requiredPermissions: ["dashboard.read", "admin.panel.access"],
      },
      {
        name: "Analytics",
        href: "/admin/analytics",
        icon: BarChart3,
        requiredPermissions: ["dashboard.read", "admin.panel.access"],
      },
      {
        name: "Reports",
        href: "/admin/reports",
        icon: FileText,
        requiredPermissions: ["reports.read"],
      },
    ],
  },
  {
    name: "Operations",
    icon: ClipboardList,
    subItems: [
      {
        name: "Users",
        href: "/admin/operations/users",
        requiredPermissions: ["users.read", "users.manage"],
      },
      {
        name: "Products",
        href: "/admin/operations/products",
        requiredPermissions: ["products.manage"],
      },
      {
        name: "Reviews",
        href: "/admin/operations/review",
        requiredPermissions: ["reviews.manage"],
      },
      {
        name: "Orders",
        href: "/admin/operations/orders",
        requiredPermissions: ["orders.read_all"],
      },
      {
        name: "Shipments",
        href: "/admin/operations/shipments",
        requiredPermissions: ["shipments.manage", "orders.read_all"],
      },
      {
        name: "Delivery",
        href: "/admin/operations/delivery",
        requiredPermissions: ["delivery.dashboard.access"],
      },
    ],
  },
  {
    name: "Warehouse",
    icon: Warehouse,
    subItems: [
      {
        name: "Warehouse Dashboard",
        href: "/admin/warehouse",
        requiredPermissions: [
          "dashboard.read",
          "inventory.manage",
          "orders.read_all",
          "shipments.manage",
        ],
      },
      {
        name: "Logistics",
        href: "/admin/warehouse/logistics",
        requiredPermissions: ["logistics.manage"],
      },
      {
        name: "Stock Management",
        href: "/admin/warehouse/stock",
        requiredPermissions: ["inventory.manage"],
      },
      {
        name: "Shipping Rates",
        href: "/admin/warehouse/shipping-rates",
        requiredPermissions: ["settings.shipping.manage", "settings.manage"],
      },
      {
        name: "Deliveryman",
        href: "/admin/warehouse/delivery-men",
        requiredPermissions: ["delivery-men.manage", "logistics.manage"],
      },
      {
        name: "Payroll",
        href: "/admin/warehouse/payroll",
        requiredPermissions: ["payroll.manage"],
      },
    ],
  },
  {
    name: "SCM",
    icon: BookOpen,
    subSections: [
      {
        label: "Workspace",
        items: [
          {
            name: "SCM Home",
            href: "/admin/scm",
            requiredPermissions: ["scm.access"],
          },
          {
            name: "My Tasks",
            href: "/admin/scm/my-tasks",
            requiredPermissions: ["scm.access"],
          },
          {
            name: "Notifications",
            href: "/admin/scm/notifications",
            requiredPermissions: ["scm.access"],
          },
          {
            name: "Exceptions",
            href: "/admin/scm/exceptions",
            requiredPermissions: ["scm.access"],
          },
        ],
      },
      {
        label: "Procurement",
        items: [
          {
            name: "Purchase Requisitions",
            href: "/admin/scm/purchase-requisitions",
            requiredPermissions: [
              "purchase_requisitions.read",
              "purchase_requisitions.manage",
              "purchase_requisitions.approve",
            ],
          },
          {
            name: "RFQs",
            href: "/admin/scm/rfqs",
            requiredPermissions: ["rfq.read", "rfq.manage", "rfq.approve"],
          },
          {
            name: "Comparative Statements",
            href: "/admin/scm/comparative-statements",
            requiredPermissions: [
              "comparative_statements.read",
              "comparative_statements.manage",
              "comparative_statements.approve_manager",
              "comparative_statements.approve_committee",
              "comparative_statements.approve_final",
            ],
          },
          {
            name: "Purchase Orders",
            href: "/admin/scm/purchase-orders",
            requiredPermissions: [
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
            name: "Landed Costs",
            href: "/admin/scm/landed-costs",
            requiredPermissions: ["landed_costs.read", "landed_costs.manage"],
          },
        ],
      },
      {
        label: "Warehouse",
        items: [
          {
            name: "Goods Receipts",
            href: "/admin/scm/goods-receipts",
            requiredPermissions: [
              "goods_receipts.read",
              "goods_receipts.manage",
              "purchase_orders.manage",
              "purchase_requisitions.manage",
              "supplier.feedback.manage",
            ],
          },
          {
            name: "Material Requests",
            href: "/admin/scm/material-requests",
            requiredPermissions: [
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
            name: "Material Releases",
            href: "/admin/scm/material-releases",
            requiredPermissions: [
              "material_releases.read",
              "material_releases.manage",
              "material_requests.read",
              "material_requests.approve_admin",
            ],
          },
          {
            name: "Release Report",
            href: "/admin/scm/material-releases/report",
            requiredPermissions: [
              "material_releases.read",
              "material_releases.manage",
              "material_requests.read",
              "material_requests.approve_admin",
            ],
          },
          {
            name: "Warehouse Transfers",
            href: "/admin/scm/warehouse-transfers",
            requiredPermissions: [
              "warehouse_transfers.read",
              "warehouse_transfers.manage",
              "warehouse_transfers.approve",
            ],
          },
          {
            name: "Replenishment",
            href: "/admin/scm/replenishment",
            requiredPermissions: ["replenishment.read", "replenishment.manage"],
          },
          {
            name: "Reorder Alerts",
            href: "/admin/scm/reorder-alerts",
            requiredPermissions: ["stock_alerts.read", "stock_alerts.manage"],
          },
          {
            name: "Warehouse Locations",
            href: "/admin/scm/warehouse-locations",
            requiredPermissions: [
              "warehouse_locations.read",
              "warehouse_locations.manage",
            ],
          },
          {
            name: "Stock Reports",
            href: "/admin/scm/stock-reports",
            requiredPermissions: ["stock_reports.read"],
          },
          {
            name: "Stock Cards",
            href: "/admin/scm/stock-cards",
            requiredPermissions: [
              "inventory.manage",
              "material_releases.read",
              "material_releases.manage",
              "material_requests.approve_admin",
            ],
          },
          {
            name: "Physical Verifications",
            href: "/admin/scm/physical-verifications",
            requiredPermissions: [
              "physical_verifications.read",
              "physical_verifications.manage",
              "physical_verifications.approve",
            ],
          },
          {
            name: "Asset Lifecycle",
            href: "/admin/scm/assets",
            requiredPermissions: ["asset_register.read", "asset_register.manage"],
          },
        ],
      },
      {
        label: "Supplier",
        items: [
          {
            name: "Suppliers",
            href: "/admin/scm/suppliers",
            requiredGlobalPermissions: ["suppliers.read", "suppliers.manage"],
          },
          {
            name: "Supplier Portal Access",
            href: "/admin/scm/supplier-portal-access",
            requiredGlobalPermissions: ["suppliers.manage", "users.manage"],
          },
          {
            name: "Vendor Approvals",
            href: "/admin/scm/vendor-approvals",
            requiredGlobalPermissions: [
              "supplier.profile_requests.read",
              "supplier.profile_requests.review",
            ],
          },
          {
            name: "Vendor Feedback",
            href: "/admin/scm/vendor-feedback",
            requiredGlobalPermissions: ["supplier.feedback.manage"],
          },
          {
            name: "Supplier Intelligence",
            href: "/admin/scm/supplier-intelligence",
            requiredGlobalPermissions: ["supplier_performance.read"],
          },
          {
            name: "SLA Policies",
            href: "/admin/scm/sla",
            requiredGlobalPermissions: ["sla.read", "sla.manage"],
          },
          {
            name: "Supplier Returns",
            href: "/admin/scm/supplier-returns",
            requiredPermissions: [
              "supplier_returns.read",
              "supplier_returns.manage",
              "supplier_returns.approve",
            ],
          },
        ],
      },
      {
        label: "Finance",
        items: [
          {
            name: "Payment Requests",
            href: "/admin/scm/payment-requests",
            requiredPermissions: [
              "payment_requests.read",
              "payment_requests.manage",
              "payment_requests.approve_admin",
              "payment_requests.approve_finance",
              "payment_requests.treasury",
            ],
          },
          {
            name: "Payment Reports",
            href: "/admin/scm/payment-reports",
            requiredPermissions: [
              "payment_reports.read",
              "supplier_payments.read",
              "supplier_payments.manage",
            ],
          },
          {
            name: "Supplier Ledger",
            href: "/admin/scm/supplier-ledger",
            requiredPermissions: [
              "supplier_ledger.read",
              "supplier_invoices.read",
              "supplier_payments.read",
            ],
            requiredGlobalPermissions: [
              "supplier_ledger.read",
              "supplier_invoices.read",
              "supplier_payments.read",
            ],
          },
          {
            name: "3-Way Match",
            href: "/admin/scm/three-way-match",
            requiredPermissions: [
              "three_way_match.read",
              "supplier_invoices.read",
              "supplier_invoices.manage",
            ],
            requiredGlobalPermissions: [
              "three_way_match.read",
              "supplier_invoices.read",
              "supplier_invoices.manage",
            ],
          },
        ],
      },
      {
        label: "Governance",
        items: [
          {
            name: "SCM Dashboard",
            href: "/admin/scm/dashboard",
            requiredPermissions: [
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
        ],
      },
    ],
  },
  {
    name: "Investors",
    icon: Landmark,
    requiredGlobalPermissions: [
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
    subSections: [
      {
        label: "Workspace",
        items: [
          {
            name: "Investor Home",
            href: "/admin/investors",
            requiredGlobalPermissions: [
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
          },
          {
            name: "My Tasks",
            href: "/admin/investors/my-tasks",
            requiredGlobalPermissions: [
              "investors.manage",
              "investor_profit.approve",
              "investor_profit.post",
              "investor_payout.approve",
              "investor_payout.pay",
            ],
          },
          {
            name: "Exceptions",
            href: "/admin/investors/exceptions",
            requiredGlobalPermissions: [
              "investors.read",
              "investors.manage",
              "investor_profit.read",
              "investor_profit.manage",
              "investor_payout.read",
              "investor_payout.manage",
            ],
          },
          {
            name: "Notifications",
            href: "/admin/investors/notifications",
            requiredGlobalPermissions: ["investor.notifications.read"],
          },
        ],
      },
      {
        label: "Operations",
        items: [
          {
            name: "Investor Registry",
            href: "/admin/investors/registry",
            requiredGlobalPermissions: ["investors.read", "investors.manage"],
          },
          {
            name: "Documents",
            href: "/admin/investors/documents",
            requiredGlobalPermissions: [
              "investor_documents.read",
              "investor_documents.manage",
              "investor_documents.review",
              "investors.manage",
            ],
          },
          {
            name: "Capital Ledger",
            href: "/admin/investors/ledger",
            requiredGlobalPermissions: [
              "investor_ledger.read",
              "investor_ledger.manage",
            ],
          },
          {
            name: "Allocations",
            href: "/admin/investors/allocations",
            requiredGlobalPermissions: [
              "investor_allocations.read",
              "investor_allocations.manage",
            ],
          },
          {
            name: "Profit Runs",
            href: "/admin/investors/profit-runs",
            requiredGlobalPermissions: [
              "investor_profit.read",
              "investor_profit.manage",
              "investor_profit.approve",
              "investor_profit.post",
            ],
          },
          {
            name: "Payouts",
            href: "/admin/investors/payouts",
            requiredGlobalPermissions: [
              "investor_payout.read",
              "investor_payout.manage",
              "investor_payout.approve",
              "investor_payout.pay",
              "investor_payout.void",
            ],
          },
          {
            name: "Withdrawals",
            href: "/admin/investors/withdrawals",
            requiredGlobalPermissions: [
              "investor_withdrawals.read",
              "investor_withdrawals.review",
              "investor_withdrawals.settle",
              "investors.manage",
            ],
          },
          {
            name: "Retained Profit",
            href: "/admin/investors/retained-profit",
            requiredGlobalPermissions: [
              "investor_profit.read",
              "investor_profit.manage",
              "investor_profit.approve",
              "investor_profit.post",
              "investor_statement.read",
            ],
          },
          {
            name: "Statements",
            href: "/admin/investors/statements",
            requiredGlobalPermissions: ["investor_statement.read"],
          },
          {
            name: "Statement Schedules",
            href: "/admin/investors/statement-schedules",
            requiredGlobalPermissions: ["investor_statement.read", "investors.manage"],
          },
        ],
      },
      {
        label: "Governance",
        items: [
          {
            name: "Profile Requests",
            href: "/admin/investors/profile-requests",
            requiredGlobalPermissions: [
              "investor_profile_requests.read",
              "investor_profile_requests.review",
              "investors.manage",
            ],
          },
          {
            name: "Activity Log",
            href: "/admin/investors/activity-log",
            requiredGlobalPermissions: ["investor.activity_log.read"],
          },
          {
            name: "Portal Access",
            href: "/admin/investors/portal-access",
            requiredGlobalPermissions: ["investors.manage", "users.manage"],
          },
        ],
      },
    ],
  },
  {
    name: "Management",
    icon: ClipboardList,
    requiredPermissions: ["products.manage", "inventory.manage"],
    subItems: [
      {
        name: "Couriers",
        href: "/admin/management/couriers",
        requiredPermissions: ["settings.courier.manage", "settings.manage"],
      },
      {
        name: "VAT Management",
        href: "/admin/management/vatmanagent",
        requiredPermissions: ["settings.vat.manage", "settings.manage"],
      },
      {
        name: "Blogs Management",
        href: "/admin/management/blogs",
        requiredPermissions: ["blogs.manage"],
      },
      {
        name: "Categories",
        href: "/admin/management/categories",
        requiredPermissions: ["products.manage"],
      },
      {
        name: "Brands",
        href: "/admin/management/brands",
        requiredPermissions: ["products.manage"],
      },
      {
        name: "Flash Sales",
        href: "/admin/management/flash-sales",
        requiredPermissions: ["products.manage"],
      },

      {
        name: "Newsletter",
        href: "/admin/management/newsletter",
        requiredPermissions: ["newsletter.manage"],
      },
      {
        name: "Coupons",
        href: "/admin/management/coupons",
        requiredPermissions: ["coupons.manage"],
      },
    ],
  },
  {
    name: "Communication",
    items: [
      {
        name: "Chats",
        href: "/admin/chats",
        icon: MessageCircle,
        requiredPermissions: ["chats.manage"],
      },
    ],
  },
  {
    name: "Settings",
    icon: Settings,
    requiredPermissions: ["settings.manage"],
    subItems: [
      {
        name: "General Settings",
        href: "/admin/settings",
        requiredPermissions: ["settings.manage"],
      },
      {
        name: "Gallery Management",
        href: "/admin/settings/gallery",
        requiredPermissions: ["settings.manage", "gallery.manage"],
      },
      {
        name: "RBAC",
        href: "/admin/settings/rbac",
        requiredPermissions: ["roles.manage"],
      },
      {
        name: "Activity Log",
        href: "/admin/settings/activitylog",
        requiredPermissions: ["settings.activitylog.read", "settings.manage"],
      },
    ],
  },
];

interface MenuItemProps {
  item: MenuItem;
  pathname: string;
  compactSubSections?: boolean;
}

const MenuItem = ({
  item,
  pathname,
  compactSubSections = false,
}: MenuItemProps) => {
  const flattenedSubItems = item.subSections
    ? item.subSections.flatMap((section) => section.items)
    : item.subItems ?? [];
  const hasActiveSubItem = Boolean(
    flattenedSubItems.some(
      (subItem) =>
        pathname === subItem.href ||
        (subItem.href !== "/admin" && pathname.startsWith(`${subItem.href}/`)),
    ),
  );
  const initialOpenState = hasActiveSubItem;

  const [isOpen, setIsOpen] = useState(initialOpenState);
  const hasSubItems = flattenedSubItems.length > 0;
  const hasItems = item.items && item.items.length > 0;

  // Determine active state for parent links
  const isActive = item.href
    ? pathname === item.href ||
      (item.href !== "/admin" && pathname.startsWith(item.href))
    : hasActiveSubItem;

  useEffect(() => {
    if (hasActiveSubItem) {
      setIsOpen(true);
    }
  }, [hasActiveSubItem]);

  return (
    <div>
      {hasSubItems ? (
        <>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className={cn(
              "w-full flex items-center justify-between px-4 py-2.5 transition-all duration-150 group",
              isOpen
                ? "text-primary bg-primary/8 border-l-2 border-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-primary/10 hover:border-l-2 hover:border-primary/50 border-l-2 border-transparent",
            )}
          >
            <div className="flex items-center gap-3">
              {item.icon && (
                <item.icon
                  className={cn(
                    "h-4 w-4 transition-all duration-150",
                    isOpen
                      ? "text-primary"
                      : "text-muted-foreground/60 group-hover:text-muted-foreground",
                  )}
                />
              )}
              <span className="text-sm font-medium">{item.name}</span>
            </div>
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
          {isOpen && (
            <div className="relative">
              <div className="absolute left-6 top-0 bottom-0 w-px border-l border-border" />
              <div className="ml-6 py-1 space-y-0.5">
                {item.subSections
                  ? item.subSections.map((section) => {
                      const isSectionActive = section.items.some(
                        (subItem) =>
                          pathname === subItem.href ||
                          (subItem.href !== "/admin" &&
                            pathname.startsWith(`${subItem.href}/`)),
                      );
                      return (
                        <div key={section.label} className="space-y-1 py-1.5">
                          {compactSubSections ? (
                            <details
                              open={isSectionActive}
                              className="group rounded-md border border-border/60 bg-muted/20"
                            >
                              <summary className="cursor-pointer list-none px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                                {section.label}
                              </summary>
                              <div className="space-y-0.5 pb-1">
                                {section.items.map((subItem) => {
                                  const isSubItemActive = pathname === subItem.href;
                                  return (
                                    <Link
                                      key={subItem.name}
                                      href={subItem.href}
                                      className={cn(
                                        "relative pl-4 pr-4 py-2 text-xs transition-all duration-150 flex items-center gap-2",
                                        isSubItemActive
                                          ? "text-primary font-medium bg-primary/20 border-l-2 border-primary"
                                          : "text-muted-foreground/70 hover:text-foreground hover:bg-primary/10",
                                      )}
                                    >
                                      <div
                                        className={cn(
                                          "w-1.5 h-1.5 rounded-full transition-all duration-150",
                                          isSubItemActive
                                            ? "bg-primary"
                                            : "bg-muted-foreground/40",
                                        )}
                                      />
                                      {subItem.name}
                                      {isSubItemActive && (
                                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary" />
                                      )}
                                    </Link>
                                  );
                                })}
                              </div>
                            </details>
                          ) : (
                            <>
                              <div className="px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                                {section.label}
                              </div>
                              {section.items.map((subItem) => {
                                const isSubItemActive = pathname === subItem.href;
                                return (
                                  <Link
                                    key={subItem.name}
                                    href={subItem.href}
                                    className={cn(
                                      "relative pl-4 pr-4 py-2 text-xs transition-all duration-150 flex items-center gap-2",
                                      isSubItemActive
                                        ? "text-primary font-medium bg-primary/20 border-l-2 border-primary"
                                        : "text-muted-foreground/70 hover:text-foreground hover:bg-primary/10",
                                    )}
                                  >
                                    <div
                                      className={cn(
                                        "w-1.5 h-1.5 rounded-full transition-all duration-150",
                                        isSubItemActive
                                          ? "bg-primary"
                                          : "bg-muted-foreground/40",
                                      )}
                                    />
                                    {subItem.name}
                                    {isSubItemActive && (
                                      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary" />
                                    )}
                                  </Link>
                                );
                              })}
                            </>
                          )}
                        </div>
                      );
                    })
                  : item.subItems?.map((subItem) => {
                      const isSubItemActive = pathname === subItem.href;
                      return (
                        <Link
                          key={subItem.name}
                          href={subItem.href}
                          className={cn(
                            "relative pl-4 pr-4 py-2 text-xs transition-all duration-150 flex items-center gap-2",
                            isSubItemActive
                              ? "text-primary font-medium bg-primary/20 border-l-2 border-primary"
                              : "text-muted-foreground/70 hover:text-foreground hover:bg-primary/10",
                          )}
                        >
                          <div
                            className={cn(
                              "w-1.5 h-1.5 rounded-full transition-all duration-150",
                              isSubItemActive ? "bg-primary" : "bg-muted-foreground/40",
                            )}
                          />
                          {subItem.name}
                          {isSubItemActive && (
                            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary" />
                          )}
                        </Link>
                      );
                    })}
              </div>
            </div>
          )}
        </>
      ) : (
        <Link
          href={item.href || "#"}
          className={cn(
            "flex items-center gap-3 px-4 py-2.5 transition-all duration-150 group",
            isActive
              ? "text-primary bg-primary/10 hover:bg-primary/20 border-l-2 border-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-primary/10 hover:border-l-2 hover:border-primary/50 border-l-2 border-transparent",
          )}
        >
          {item.icon && (
            <item.icon
              className={cn(
                "h-4 w-4 transition-all duration-150",
                isActive
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground/60 group-hover:text-muted-foreground bg-primary/10 group-hover:translate-x-0.5",
              )}
            />
          )}
          <span className="text-sm font-medium">{item.name}</span>
        </Link>
      )}
    </div>
  );
};

// Sidebar Content wrapper
const SidebarContent = ({
  pathname,
  items,
  isWarehouseScopedOnly = false,
  compactSubSections = false,
}: {
  pathname: string;
  items: MenuItem[];
  isWarehouseScopedOnly?: boolean;
  compactSubSections?: boolean;
}) => (
  <nav className="py-6 space-y-2 overflow-y-auto scrollbar-hide-on-idle">
    {items.map((section) => {
      if (section.items) {
        // Section with items
        const visibleItems = section.items.filter(
          (item) => item.href !== "/admin" || !isWarehouseScopedOnly,
        );
        if (visibleItems.length === 0) return null;

        return (
          <div key={section.name}>
            <div className="px-4 pb-2">
              <h3 className="text-[10px] font-semibold tracking-widest text-muted-foreground/60 uppercase">
                {section.name}
              </h3>
            </div>
            <div className="space-y-0.5">
              {visibleItems.map((item) => (
                <MenuItem
                  key={`${item.name}:${item.href ?? "item"}`}
                  item={item}
                  pathname={pathname}
                  compactSubSections={compactSubSections}
                />
              ))}
            </div>
          </div>
        );
      } else {
        // Single menu item (collapsible or regular)
        return (
          <div key={`${section.name}:${section.href ?? "group"}`}>
            <MenuItem item={section} pathname={pathname} />
          </div>
        );
      }
    })}
  </nav>
);

export default function Sidebar({
  isMobile = false,
}: {
  isMobile?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [siteSettings, setSiteSettings] = useState<any>(null);
  const permissionKeys = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];
  const globalPermissionKeys = Array.isArray(
    (session?.user as any)?.globalPermissions,
  )
    ? ((session?.user as any).globalPermissions as string[])
    : [];
  const warehouseIds = Array.isArray((session?.user as any)?.warehouseIds)
    ? ((session?.user as any).warehouseIds as number[])
    : [];
  const defaultAdminRoute = (session?.user as any)?.defaultAdminRoute as
    | "/admin"
    | "/admin/warehouse"
    | undefined;
  const isWarehouseScopedOnly =
    defaultAdminRoute === "/admin/warehouse" && warehouseIds.length > 0;

  const roleNames =
    Array.isArray((session?.user as any)?.roleNames) &&
    ((session?.user as any).roleNames as string[]).length > 0
      ? ((session?.user as any).roleNames as string[])
      : [];
  const userRoleLabel =
    roleNames.length > 0
      ? roleNames.join(", ")
      : ((session?.user as any)?.role as string) || "Admin";

  useEffect(() => {
    const fetchSiteSettings = async () => {
      try {
        const response = await fetch("/api/site");
        const data = await response.json();
        setSiteSettings(data);
      } catch (error) {
        console.error("Failed to fetch site settings:", error);
      }
    };

    fetchSiteSettings();
  }, []);

  const hasPermission = useCallback(
    (required?: string[]) => {
      if (!required || required.length === 0) return true;
      return required.some((permission) => permissionKeys.includes(permission));
    },
    [permissionKeys],
  );

  const hasGlobalPermission = useCallback(
    (required?: string[]) => {
      if (!required || required.length === 0) return true;
      return required.some((permission) =>
        globalPermissionKeys.includes(permission),
      );
    },
    [globalPermissionKeys],
  );

  const visibleMenuItems = useMemo<MenuItem[]>(() => {
    return menuItems
      .map((section) => {
        if (section.items) {
          // Handle section with items
          const visibleItems = section.items.filter((item) => {
            if (item.href === "/admin" && isWarehouseScopedOnly) return false;
            if (item.href === "/admin/warehouse" && warehouseIds.length === 0)
              return false;
            return (
              hasPermission(item.requiredPermissions) &&
              hasGlobalPermission(item.requiredGlobalPermissions)
            );
          });
          if (visibleItems.length === 0) return null;
          return { ...section, items: visibleItems };
        } else if (section.subSections && section.subSections.length > 0) {
          const visibleSubSections = section.subSections
            .map((subSection) => ({
              ...subSection,
              items: subSection.items.filter(
                (subItem) =>
                  hasPermission(subItem.requiredPermissions) &&
                  hasGlobalPermission(subItem.requiredGlobalPermissions),
              ),
            }))
            .filter((subSection) => subSection.items.length > 0);
          if (visibleSubSections.length === 0) {
            return null;
          }
          return {
            ...section,
            subSections: visibleSubSections,
          };
        } else if (section.subItems && section.subItems.length > 0) {
          // Handle collapsible group with subItems
          const visibleSubItems = section.subItems.filter(
            (subItem) =>
              hasPermission(subItem.requiredPermissions) &&
              hasGlobalPermission(subItem.requiredGlobalPermissions),
          );
          if (visibleSubItems.length === 0) {
            return null;
          }
          return {
            ...section,
            subItems: visibleSubItems,
          };
        } else {
          // Handle single item
          if (
            !hasPermission(section.requiredPermissions) ||
            !hasGlobalPermission(section.requiredGlobalPermissions)
          ) {
            return null;
          }
          return section;
        }
      })
      .filter((item): item is MenuItem => item !== null);
  }, [
    hasGlobalPermission,
    hasPermission,
    isWarehouseScopedOnly,
    warehouseIds.length,
  ]);

  // Using CSS variables from global.css
  const themeBg = "bg-background";
  const themeBorder = "border-border";
  const siteTitle = siteSettings?.siteTitle?.trim() || "Tech Ecommerce";
  const headerTitle = userRoleLabel || siteTitle;
  const adminSubtitle = siteTitle ? `${siteTitle}` : "Admin Panel";

  if (isMobile) {
    return (
      <div className={cn("h-full w-[86vw] max-w-80 flex flex-col", themeBg)}>
        {/* Modern Header */}
        <div className="h-20 flex flex-col items-center justify-center border-b border-border px-4">
          <div className="text-center">
            <h2 className={cn("font-bold text-lg text-foreground")}>
              {headerTitle
                ? headerTitle.charAt(0).toUpperCase() + headerTitle.slice(1)
                : ""}
            </h2>
            <p className="text-xs text-muted-foreground">{adminSubtitle}</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SidebarContent
            pathname={pathname}
            items={visibleMenuItems}
            compactSubSections
          />
        </div>
      </div>
    );
  }

  // Desktop Sidebar
  return (
    <aside
      className={cn(
        "w-60 shadow-lg h-screen fixed left-0 top-0 border-r flex flex-col",
        themeBg,
        themeBorder,
      )}
    >
      {/* Premium Brand Header */}
      <div className="h-[72px] flex items-center justify-center border-b border-border sticky top-0 z-10 bg-background flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* Logo Mark */}
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center shadow-sm">
            <LayoutDashboard className="h-4 w-4 text-white" />
          </div>

          {/* Brand Identity */}
          <div className="flex flex-col">
            <h2 className="font-bold text-lg text-foreground">{siteTitle}</h2>
            <div className="bg-primary/10 px-2 py-0.5 rounded-full">
              <p className="text-[10px] font-medium text-primary">
                {userRoleLabel}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-hide-on-idle">
        <SidebarContent
          pathname={pathname}
          items={visibleMenuItems}
          isWarehouseScopedOnly={isWarehouseScopedOnly}
        />
      </div>
      {/* Version */}
      <div className="p-4 border-t border-border/50">
        <h3 className="text-sm font-semibold text-foreground text-center">
          Tech Ecommerce
        </h3>
        <p className="text-[10px] text-muted-foreground/40 text-center">
          V1.1.0
        </p>
      </div>
    </aside>
  );
}
