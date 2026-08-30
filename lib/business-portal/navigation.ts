import type { LucideIcon } from "lucide-react";
import {
  BadgeDollarSign,
  Bell,
  BookOpen,
  Boxes,
  Building2,
  CircleDollarSign,
  ClipboardList,
  FileCheck2,
  FileClock,
  FileText,
  HandCoins,
  LayoutDashboard,
  Link2,
  MapPin,
  PackageCheck,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldCheck,
  Store,
  Users,
  WalletCards,
} from "lucide-react";
import type { OrganizationPermission } from "@/lib/business-network/permissions";

export const PARTNER_CAPABILITIES = [
  "AFFILIATE",
  "RESELLER",
  "DEALER",
  "MARKETING_PARTNER",
  "SERVICE_PARTNER",
] as const;

export type PortalNavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: OrganizationPermission;
  corporate?: boolean;
  partner?: boolean;
};

export type PortalNavigationGroup = {
  label?: string;
  items: PortalNavigationItem[];
};

export const PORTAL_NAVIGATION: PortalNavigationGroup[] = [
  {
    items: [
      { label: "Overview", href: "/business", icon: LayoutDashboard },
    ],
  },
  {
    label: "Corporate commerce",
    items: [
      { label: "Product catalog", href: "/business/catalog", icon: Boxes, corporate: true },
      { label: "Request for quotations", href: "/business/rfqs", icon: ClipboardList, permission: "rfq.read", corporate: true },
      { label: "Quotations", href: "/business/quotations", icon: FileCheck2, permission: "quotation.read", corporate: true },
      { label: "Purchase orders", href: "/business/purchase-orders", icon: ScrollText, permission: "customer_po.read", corporate: true },
      { label: "Orders", href: "/business/orders", icon: PackageCheck, permission: "order.read", corporate: true },
      { label: "Invoices", href: "/business/invoices", icon: ReceiptText, permission: "invoice.read", corporate: true },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Credit account", href: "/business/credit", icon: WalletCards, permission: "credit.read", corporate: true },
      { label: "Statement", href: "/business/credit/statement", icon: BookOpen, permission: "credit.read", corporate: true },
      { label: "Payments", href: "/business/payments", icon: CircleDollarSign, permission: "invoice.read", corporate: true },
    ],
  },
  {
    label: "Partnership",
    items: [
      { label: "Partner overview", href: "/business/partner", icon: HandCoins, permission: "partner.dashboard.read", partner: true },
      { label: "Referral links & codes", href: "/business/partner/links", icon: Link2, permission: "partner.assets.read", partner: true },
      { label: "Leads", href: "/business/partner/leads", icon: FileClock, permission: "partner.leads.read", partner: true },
      { label: "Referred orders", href: "/business/partner/orders", icon: Store, permission: "partner.orders.read", partner: true },
      { label: "Commission", href: "/business/partner/commissions", icon: BadgeDollarSign, permission: "partner.commissions.read", partner: true },
      { label: "Settlements", href: "/business/partner/settlements", icon: FileText, permission: "partner.settlements.read", partner: true },
      { label: "Payout accounts", href: "/business/partner/payout-accounts", icon: ShieldCheck, permission: "partner.payout_accounts.read", partner: true },
    ],
  },
  {
    label: "Organization",
    items: [
      { label: "Company profile", href: "/business/organization", icon: Building2, permission: "organization.profile.read" },
      { label: "Members & roles", href: "/business/organization/members", icon: Users, permission: "organization.members.read" },
      { label: "Branches", href: "/business/organization/branches", icon: Store, permission: "organization.branches.read" },
      { label: "Addresses", href: "/business/organization/addresses", icon: MapPin, permission: "organization.addresses.read" },
      { label: "Documents", href: "/business/organization/documents", icon: FileText, permission: "organization.documents.read" },
    ],
  },
  {
    items: [
      { label: "Notifications", href: "/business/notifications", icon: Bell },
      { label: "Settings", href: "/business/settings", icon: Settings },
    ],
  },
];

export function isPortalNavigationItemVisible(input: {
  item: PortalNavigationItem;
  permissions: readonly string[];
  capabilities: readonly string[];
}): boolean {
  if (input.item.permission && !input.permissions.includes(input.item.permission)) return false;
  if (input.item.corporate && !input.capabilities.includes("CORPORATE_BUYER")) return false;
  if (input.item.partner && !PARTNER_CAPABILITIES.some((capability) => input.capabilities.includes(capability))) return false;
  return true;
}

