"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PortalApiError } from "@/lib/business-portal/types";
import { EmptyState, formatCurrency, formatDate, PageHeader, StatusBadge, Surface } from "./PortalPrimitives";

type ResourceKey =
  | "rfqs" | "quotations" | "purchaseOrders" | "orders" | "invoices"
  | "partnerAssets" | "partnerLeads" | "partnerOrders" | "commissions"
  | "settlements" | "payoutAccounts" | "creditStatement" | "members"
  | "branches" | "addresses" | "documents";

type Column = { label: string; path: string; type?: "status" | "date" | "currency" | "count"; currencyPath?: string };
type Config = {
  title: string; eyebrow: string; description: string; endpoint: string; columns: Column[];
  detailBase?: string; action?: { label: string; href: string }; itemKey?: string;
  empty: string; searchable?: boolean;
};

const CONFIG: Record<ResourceKey, Config> = {
  rfqs: { title: "Request for quotations", eyebrow: "Purchasing", description: "Create, submit and track pricing requests for your organization.", endpoint: "/api/business/rfqs", detailBase: "/business/rfqs", action: { label: "New RFQ", href: "/business/rfqs/new" }, searchable: true, empty: "Create your first RFQ to request business pricing.", columns: [{ label: "RFQ", path: "rfqNumber" }, { label: "Subject", path: "subject" }, { label: "Status", path: "status", type: "status" }, { label: "Created", path: "createdAt", type: "date" }] },
  quotations: { title: "Quotations", eyebrow: "Purchasing", description: "Review commercial offers and respond before their validity expires.", endpoint: "/api/business/quotations", detailBase: "/business/quotations", searchable: true, empty: "Sent quotations will appear here.", columns: [{ label: "Quotation", path: "quotationNumber" }, { label: "RFQ", path: "salesRfq.rfqNumber" }, { label: "Total", path: "versions.0.grandTotal", type: "currency", currencyPath: "versions.0.currency" }, { label: "Status", path: "status", type: "status" }, { label: "Valid until", path: "validUntil", type: "date" }] },
  purchaseOrders: { title: "Purchase orders", eyebrow: "Purchasing", description: "Submit customer POs and monitor verification and order conversion.", endpoint: "/api/business/customer-pos", detailBase: "/business/purchase-orders", action: { label: "Submit PO", href: "/business/purchase-orders/new" }, searchable: true, empty: "No purchase orders have been submitted.", columns: [{ label: "PO number", path: "customerPoNumber" }, { label: "Quotation", path: "quotation.quotationNumber" }, { label: "Amount", path: "totalAmount", type: "currency", currencyPath: "currency" }, { label: "Status", path: "status", type: "status" }, { label: "Submitted", path: "createdAt", type: "date" }] },
  orders: { title: "Orders", eyebrow: "Purchasing", description: "Track corporate orders created through approved purchase orders.", endpoint: "/api/business/orders", detailBase: "/business/orders", searchable: true, empty: "Converted corporate orders will appear here.", columns: [{ label: "Order", path: "id" }, { label: "PO number", path: "customerPurchaseOrder.customerPoNumber" }, { label: "Total", path: "grand_total", type: "currency", currencyPath: "currency" }, { label: "Order status", path: "status", type: "status" }, { label: "Payment", path: "paymentStatus", type: "status" }, { label: "Placed", path: "order_date", type: "date" }] },
  invoices: { title: "Invoices", eyebrow: "Finance", description: "View billing records generated from your corporate orders.", endpoint: "/api/business/invoices", detailBase: "/business/invoices", searchable: true, empty: "Invoices will appear after an order is created.", columns: [{ label: "Invoice", path: "invoiceNumber" }, { label: "Order", path: "orderId" }, { label: "Amount", path: "amount", type: "currency", currencyPath: "currency" }, { label: "Status", path: "status", type: "status" }, { label: "Issued", path: "issuedAt", type: "date" }] },
  partnerAssets: { title: "Referral links & codes", eyebrow: "Partnership", description: "Manage trackable referral assets and review their attribution reach.", endpoint: "/api/business/partner/assets", empty: "No referral assets are active yet.", columns: [{ label: "Code", path: "code" }, { label: "Campaign", path: "campaignName" }, { label: "Type", path: "type", type: "status" }, { label: "Status", path: "status", type: "status" }, { label: "Attributions", path: "_count.attributions", type: "count" }, { label: "Created", path: "createdAt", type: "date" }] },
  partnerLeads: { title: "Leads", eyebrow: "Partnership", description: "Register and monitor partner-referred business opportunities.", endpoint: "/api/business/partner/leads", detailBase: "/business/partner/leads", action: { label: "Register lead", href: "/business/partner/leads/new" }, searchable: true, empty: "Register a qualified lead to begin tracking it.", columns: [{ label: "Lead", path: "leadNumber" }, { label: "Company", path: "companyName" }, { label: "Contact", path: "contactName" }, { label: "Estimated value", path: "estimatedValue", type: "currency", currencyPath: "currency" }, { label: "Status", path: "status", type: "status" }, { label: "Registered", path: "createdAt", type: "date" }] },
  partnerOrders: { title: "Referred orders", eyebrow: "Partnership", description: "Orders attributed to your referral links and registered leads.", endpoint: "/api/business/partner/orders", searchable: true, empty: "Attributed orders will appear when referred customers convert.", columns: [{ label: "Order", path: "order.id" }, { label: "Asset", path: "asset.code" }, { label: "Value", path: "order.grand_total", type: "currency", currencyPath: "order.currency" }, { label: "Order status", path: "order.status", type: "status" }, { label: "Attribution", path: "status", type: "status" }, { label: "Converted", path: "convertedAt", type: "date" }] },
  commissions: { title: "Commission", eyebrow: "Partnership", description: "An immutable ledger of earned, held, payable and paid commission.", endpoint: "/api/business/partner/commissions", empty: "Commission entries will appear after eligible conversions.", columns: [{ label: "Reference", path: "id" }, { label: "Type", path: "type", type: "status" }, { label: "Order", path: "orderId" }, { label: "Amount", path: "amount", type: "currency", currencyPath: "currency" }, { label: "Status", path: "status", type: "status" }, { label: "Recorded", path: "createdAt", type: "date" }] },
  settlements: { title: "Settlements", eyebrow: "Partnership", description: "Track commission settlement periods and payout processing.", endpoint: "/api/business/partner/settlements", detailBase: "/business/partner/settlements", searchable: true, empty: "Approved payable commission will be grouped into settlements.", columns: [{ label: "Settlement", path: "settlementNumber" }, { label: "Period start", path: "periodStart", type: "date" }, { label: "Period end", path: "periodEnd", type: "date" }, { label: "Net payable", path: "netPayable", type: "currency", currencyPath: "currency" }, { label: "Status", path: "status", type: "status" }] },
  payoutAccounts: { title: "Payout accounts", eyebrow: "Partnership", description: "Manage verified destinations used for partner settlements.", endpoint: "/api/business/partner/payout-accounts", empty: "Add a payout destination before requesting a settlement.", columns: [{ label: "Account name", path: "accountName" }, { label: "Type", path: "type", type: "status" }, { label: "Institution", path: "bankName" }, { label: "Last 4", path: "accountNumberLast4" }, { label: "Status", path: "status", type: "status" }, { label: "Default", path: "isDefault", type: "status" }] },
  creditStatement: { title: "Credit statement", eyebrow: "Finance", description: "Review every charge, payment, adjustment and credit movement.", endpoint: "/api/business/credit/ledger", empty: "Credit ledger entries will appear when the account is used.", columns: [{ label: "Date", path: "createdAt", type: "date" }, { label: "Type", path: "type", type: "status" }, { label: "Direction", path: "direction", type: "status" }, { label: "Description", path: "description" }, { label: "Amount", path: "amount", type: "currency", currencyPath: "currency" }] },
  members: { title: "Members & roles", eyebrow: "Organization", description: "Control who can use the portal and which responsibilities they hold.", endpoint: "/api/business/organization/members", itemKey: "members", action: { label: "Invite member", href: "/business/organization/members/invite" }, empty: "No active organization members were found.", columns: [{ label: "Member", path: "user.name" }, { label: "Email", path: "user.email" }, { label: "Title", path: "title" }, { label: "Roles", path: "roles", type: "count" }, { label: "Status", path: "status", type: "status" }, { label: "Joined", path: "joinedAt", type: "date" }] },
  branches: { title: "Branches", eyebrow: "Organization", description: "Operational branches associated with this organization.", endpoint: "/api/business/organization/branches", empty: "No branches have been added.", columns: [{ label: "Branch", path: "name" }, { label: "Code", path: "code" }, { label: "District", path: "district" }, { label: "Phone", path: "phone" }, { label: "Status", path: "isActive", type: "status" }] },
  addresses: { title: "Addresses", eyebrow: "Organization", description: "Billing, shipping, office and registered business addresses.", endpoint: "/api/business/organization/addresses", empty: "No organization addresses have been added.", columns: [{ label: "Type", path: "type", type: "status" }, { label: "Label", path: "label" }, { label: "Address", path: "addressLine" }, { label: "District", path: "district" }, { label: "Default", path: "isDefault", type: "status" }] },
  documents: { title: "Documents", eyebrow: "Organization", description: "Verification documents and their review status.", endpoint: "/api/business/organization/documents", empty: "No verification documents have been uploaded.", columns: [{ label: "Type", path: "type", type: "status" }, { label: "Document number", path: "documentNumber" }, { label: "File", path: "fileName" }, { label: "Status", path: "status", type: "status" }, { label: "Expires", path: "expiresAt", type: "date" }] },
};

function getPath(item: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (Array.isArray(value) && /^\d+$/.test(key)) return value[Number(key)];
    if (value && typeof value === "object") return (value as Record<string, unknown>)[key];
    return undefined;
  }, item);
}

function displayCell(item: Record<string, unknown>, column: Column) {
  const value = getPath(item, column.path);
  if (column.type === "status") return <StatusBadge status={typeof value === "boolean" ? (value ? "ACTIVE" : "INACTIVE") : value} />;
  if (column.type === "date") return formatDate(value);
  if (column.type === "currency") return <span className="font-semibold tabular-nums">{formatCurrency(value, String(column.currencyPath ? getPath(item, column.currencyPath) ?? "BDT" : "BDT"))}</span>;
  if (column.type === "count") return Array.isArray(value) ? value.map(String).join(", ") || "—" : String(value ?? "0");
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

export default function BusinessResourcePage({ resource, compact = false }: { resource: ResourceKey; compact?: boolean }) {
  const config = CONFIG[resource];
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(1); setQuery(search.trim()); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (query && config.searchable) params.set("search", query);
      const response = await fetch(`${config.endpoint}?${params}`, { signal, cache: "no-store" });
      const data = await response.json() as PortalApiError & Record<string, unknown>;
      if (!response.ok) throw new Error(data.error || "Could not load this business resource.");
      const nextItems = (config.itemKey ? data[config.itemKey] : data.items) as Array<Record<string, unknown>> | undefined;
      setItems(Array.isArray(nextItems) ? nextItems : []);
      const meta = data.pagination as { pages?: number; total?: number } | undefined;
      setPages(Math.max(1, Number(meta?.pages || 1)));
      setTotal(Number(meta?.total ?? nextItems?.length ?? 0));
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") setError(caught instanceof Error ? caught.message : "Could not load this business resource.");
    } finally { if (!signal.aborted) setLoading(false); }
  }, [config, page, query]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reloadKey]);

  const colspan = useMemo(() => config.columns.length + (config.detailBase ? 1 : 0), [config]);
  return (
    <>
      {!compact && <PageHeader eyebrow={config.eyebrow} title={config.title} description={config.description} action={config.action} />}
      <Surface>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">{total}</span> records</p>
          <div className="flex items-center gap-2">
            {config.searchable && (
              <label className="relative min-w-0 flex-1 sm:w-72">
                <span className="sr-only">Search {config.title}</span>
                <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search records…" className="pl-9" />
              </label>
            )}
            <Button variant="outline" size="icon" onClick={() => setReloadKey((value) => value + 1)} aria-label="Refresh records"><RefreshCw className="size-4" /></Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>{config.columns.map((column) => <th key={column.label} className="px-5 py-3 font-semibold">{column.label}</th>)}{config.detailBase && <th className="px-5 py-3 text-right font-semibold">Action</th>}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && Array.from({ length: 5 }, (_, index) => (
                <tr key={index}>{Array.from({ length: colspan }, (_, cell) => <td key={cell} className="px-5 py-4"><div className="h-4 animate-pulse rounded bg-muted" /></td>)}</tr>
              ))}
              {!loading && error && <tr><td colSpan={colspan} className="px-6 py-14 text-center"><p className="font-medium text-destructive">{error}</p><Button variant="outline" size="sm" className="mt-4" onClick={() => setReloadKey((value) => value + 1)}>Try again</Button></td></tr>}
              {!loading && !error && items.map((item) => (
                <tr key={String(item.id)} className="transition-colors hover:bg-muted/35">
                  {config.columns.map((column) => <td key={column.label} className="max-w-72 px-5 py-4 align-middle text-foreground first:font-medium"><div className="truncate">{displayCell(item, column)}</div></td>)}
                  {config.detailBase && <td className="px-5 py-4 text-right"><Button asChild variant="outline" size="sm"><Link href={`${config.detailBase}/${item.id}`}>View</Link></Button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !error && items.length === 0 && <EmptyState description={config.empty} action={config.action} />}
        {!loading && !error && pages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-5 py-4 text-sm">
            <span className="text-muted-foreground">Page {page} of {pages}</span>
            <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="size-4" />Previous</Button><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight className="size-4" /></Button></div>
          </div>
        )}
      </Surface>
    </>
  );
}

export type { ResourceKey };
