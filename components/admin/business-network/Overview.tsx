"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertCircle, ArrowRight, Building2, CircleDollarSign, FileCheck2, Handshake, Network, ReceiptText, RefreshCw, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type OverviewData = {
  metrics: Record<string, number | string>;
  recentActivity: Array<{ id: string; action: string; entityType: string; entityId: string; createdAt: string }>;
};

const metricCards = [
  { key: "organizations", label: "Organizations", icon: Building2, href: "/admin/business-network/organizations" },
  { key: "pendingOrganizations", label: "Pending verification", icon: FileCheck2, href: "/admin/business-network/organizations?status=PENDING_VERIFICATION" },
  { key: "activeAccounts", label: "Active accounts", icon: Network, href: "/admin/business-network/accounts" },
  { key: "openRfqs", label: "Open RFQs", icon: ReceiptText, href: "/admin/business-network/rfqs" },
  { key: "activePartners", label: "Active partners", icon: Handshake, href: "/admin/business-network/partners" },
  { key: "pendingPurchaseOrders", label: "POs awaiting review", icon: FileCheck2, href: "/admin/business-network/customer-pos" },
  { key: "payableCommission", label: "Payable commission", icon: CircleDollarSign, href: "/admin/business-network/commission/ledger", money: true },
  { key: "pendingSettlements", label: "Open settlements", icon: WalletCards, href: "/admin/business-network/settlements" },
] as const;

export function BusinessNetworkOverview() {
  const { data: session } = useSession();
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/business-network/overview", { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.error || "Unable to load business-network overview."); return payload as OverviewData; })
      .then(setData).catch((reason) => { if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "Unable to load overview."); });
    return () => controller.abort();
  }, [retry]);

  return <section className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Admin Control Center</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Business Network</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">One governed workspace for corporate commerce, partner operations, pricing, credit, commission and settlements.</p></div>{Array.isArray((session?.user as { permissions?: string[] } | undefined)?.permissions) && (session?.user as { permissions: string[] }).permissions.includes("business.account.manage") ? <Button asChild><Link href="/admin/business-network/organizations/new"><Building2 className="mr-2 h-4 w-4" />Create organization</Link></Button> : null}</div>
    {error ? <div role="alert" className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"><AlertCircle className="h-5 w-5" /><p className="flex-1 text-sm">{error}</p><Button variant="outline" size="sm" onClick={() => { setError(null); setRetry((value) => value + 1); }}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button></div> : null}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metricCards.map((item) => <Card key={item.key} className="group transition-colors hover:border-primary/50"><CardContent className="p-5"><div className="flex items-start justify-between"><div className="rounded-lg bg-primary/10 p-2 text-primary"><item.icon className="h-5 w-5" /></div><Button asChild variant="ghost" size="icon" className="h-8 w-8"><Link href={item.href} aria-label={`Open ${item.label}`}><ArrowRight className="h-4 w-4" /></Link></Button></div>{data ? <p className="mt-4 text-2xl font-semibold">{"money" in item && item.money ? new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }).format(Number(data.metrics[item.key] || 0)) : Number(data.metrics[item.key] || 0).toLocaleString("en-BD")}</p> : <Skeleton className="mt-4 h-8 w-24" />}<p className="mt-1 text-sm text-muted-foreground">{item.label}</p></CardContent></Card>)}</div>
    <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
      <Card><CardHeader><CardTitle className="text-base">Recent audited activity</CardTitle></CardHeader><CardContent className="space-y-1">{data ? data.recentActivity.length ? data.recentActivity.map((item) => <div key={item.id} className="flex items-center gap-3 border-b border-border py-3 last:border-0"><div className="rounded-full bg-primary/10 p-2 text-primary"><FileCheck2 className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.action.replaceAll("_", " ")}</p><p className="truncate text-xs text-muted-foreground">{item.entityType} · {item.entityId}</p></div><time className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleDateString("en-BD")}</time></div>) : <p className="py-8 text-center text-sm text-muted-foreground">No audited activity yet.</p> : Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-14 w-full" />)}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Operational shortcuts</CardTitle></CardHeader><CardContent className="grid gap-2">{[
        ["Review corporate RFQs", "/admin/business-network/rfqs"], ["Prepare quotation", "/admin/business-network/quotations/new"], ["Verify customer POs", "/admin/business-network/customer-pos"], ["Review partner applications", "/admin/business-network/partners"], ["Approve commission", "/admin/business-network/commission/ledger"], ["Process settlements", "/admin/business-network/settlements"], ["Open risk queue", "/admin/business-network/risk"], ["View business reports", "/admin/business-network/reports"],
      ].map(([label, href]) => <Button key={href} asChild variant="outline" className="justify-between"><Link href={href}>{label}<ArrowRight className="h-4 w-4" /></Link></Button>)}</CardContent></Card>
    </div>
  </section>;
}
