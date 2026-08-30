"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarDays,
  CreditCard,
  Download,
  Handshake,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type StatusRow = { status: string; count: number; amount?: string };
type ReportData = {
  meta: { from: string; to: string; granularity: "day" | "week" | "month"; currency: string; timezone: string; inclusiveDays: number; generatedAt: string };
  kpis: {
    orderCount: number; orderCountChange: number | null; orderRevenue: string; orderRevenueChange: number | null;
    averageOrderValue: string; paidRevenue: string; newOrganizations: number; activeOrganizations: number;
    activePartners: number; quotationConversionRate: number; commissionExpense: string; settlementPaid: string; openRiskCases: number;
  };
  trend: Array<{ bucket: string; orders: number; revenue: string; paidRevenue: string }>;
  pipeline: { orders: StatusRow[]; rfqs: StatusRow[]; quotations: StatusRow[]; commissions: StatusRow[]; settlements: StatusRow[] };
  topOrganizations: Array<{ id: string | null; code: string; legalName: string; orders: number; revenue: string }>;
  partnerPerformance: Array<{ id: string; partnerCode: string; legalName: string; conversions: number; attributedRevenue: string; leads: number; wonLeads: number; leadConversionRate: number; commission: string }>;
  credit: {
    accounts: number; limit: string; outstanding: string; available: string; utilizationRate: number;
    exposure: Array<{ id: string; organizationCode: string; legalName: string; limit: string; outstanding: string; utilizationRate: number; paymentTermDays: number; reviewDate: string | null }>;
  };
  risk: { statuses: StatusRow[]; severities: Array<{ severity: string; count: number }> };
};

type Filters = { from: string; to: string; granularity: "day" | "week" | "month"; currency: string };
type ExportSection = "overview" | "organizations" | "partners" | "credit" | "pipeline";

const DAY_MS = 86_400_000;

function dhakaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function shiftDate(value: string, days: number) {
  return new Date(`${value}T00:00:00+06:00`).getTime() + days * DAY_MS;
}

function isoInDhaka(timestamp: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp));
}

function defaultFilters(): Filters {
  const to = dhakaToday();
  return { from: isoInDhaka(shiftDate(to, -29)), to, granularity: "day", currency: "BDT" };
}

function queryString(filters: Filters, section?: ExportSection) {
  const query = new URLSearchParams(filters);
  if (section) query.set("section", section);
  return query.toString();
}

function money(value: string | number, currency = "BDT", compact = false) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    maximumFractionDigits: compact ? 1 : 2,
    notation: compact ? "compact" : "standard",
  }).format(Number(value));
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ChangeBadge({ value }: { value: number | null }) {
  if (value === null) return <Badge variant="secondary">New</Badge>;
  const positive = value >= 0;
  return (
    <Badge className={positive ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300" : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"} variant="outline">
      {positive ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
      {Math.abs(value).toFixed(1)}%
    </Badge>
  );
}

function MetricCard({ title, value, detail, icon: Icon, changeValue }: { title: string; value: string; detail: string; icon: typeof BarChart3; changeValue?: number | null }) {
  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
            <p className="mt-2 truncate text-2xl font-semibold tracking-tight">{value}</p>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              {changeValue !== undefined ? <ChangeBadge value={changeValue} /> : null}
              <span>{detail}</span>
            </div>
          </div>
          <span className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></span>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyRow({ columns, children }: { columns: number; children: string }) {
  return <TableRow><TableCell colSpan={columns} className="h-28 text-center text-muted-foreground">{children}</TableCell></TableRow>;
}

function PipelineCard({ title, rows }: { title: string; rows: StatusRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <div className="rounded-xl border bg-muted/15 p-4">
      <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{title}</h3><Badge variant="secondary">{total}</Badge></div>
      <div className="space-y-2">
        {rows.length ? rows.map((row) => (
          <div key={row.status} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{label(row.status)}</span>
            <span className="font-semibold tabular-nums">{row.count}</span>
          </div>
        )) : <p className="py-3 text-sm text-muted-foreground">No activity in this period.</p>}
      </div>
    </div>
  );
}

export function BusinessReports() {
  const [draft, setDraft] = useState<Filters>(defaultFilters);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportSection, setExportSection] = useState<ExportSection>("overview");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/business-network/reports?${queryString(filters)}`, { cache: "no-store", signal });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Unable to load business reports.");
      setData(payload as ReportData);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "Unable to load business reports.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const chartData = useMemo(() => data?.trend.map((row) => ({ ...row, revenue: Number(row.revenue), paidRevenue: Number(row.paidRevenue) })) ?? [], [data]);

  function applyQuickRange(days: number) {
    const to = dhakaToday();
    const next = { ...draft, from: isoInDhaka(shiftDate(to, -(days - 1))), to, granularity: days > 120 ? "week" as const : "day" as const };
    setDraft(next);
    setFilters(next);
  }

  async function downloadCsv() {
    setExporting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/business-network/reports/export?${queryString(filters, exportSection)}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Unable to export the report.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `business-network-${exportSection}.csv`;
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to export the report.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Governance & Intelligence</p>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold"><BarChart3 className="h-6 w-6 text-primary" />Business Network Reports</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Period-aware corporate sales, partner, commission, credit and risk intelligence from canonical records.</p>
        </div>
        {data ? <p className="text-xs text-muted-foreground">Generated {new Date(data.meta.generatedAt).toLocaleString("en-BD")} · {data.meta.timezone}</p> : null}
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardContent className="p-4 lg:p-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_0.8fr_auto] xl:items-end">
            <label className="space-y-1.5 text-sm font-medium"><span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" />From</span><Input type="date" value={draft.from} max={draft.to} onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))} /></label>
            <label className="space-y-1.5 text-sm font-medium"><span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" />To</span><Input type="date" value={draft.to} min={draft.from} max={dhakaToday()} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))} /></label>
            <label className="space-y-1.5 text-sm font-medium"><span>Granularity</span><select className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" value={draft.granularity} onChange={(event) => setDraft((current) => ({ ...current, granularity: event.target.value as Filters["granularity"] }))}><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option></select></label>
            <Button onClick={() => setFilters(draft)} disabled={loading || !draft.from || !draft.to}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Apply report</Button>
          </div>
          <div className="mt-4 flex flex-col justify-between gap-3 border-t pt-4 md:flex-row md:items-center">
            <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => applyQuickRange(7)}>Last 7 days</Button><Button size="sm" variant="outline" onClick={() => applyQuickRange(30)}>Last 30 days</Button><Button size="sm" variant="outline" onClick={() => applyQuickRange(90)}>Last 90 days</Button></div>
            <div className="flex flex-col gap-2 sm:flex-row"><select aria-label="Export section" className="flex h-9 rounded-md border border-input bg-background px-3 text-sm" value={exportSection} onChange={(event) => setExportSection(event.target.value as ExportSection)}><option value="overview">Overview CSV</option><option value="organizations">Organizations CSV</option><option value="partners">Partners CSV</option><option value="credit">Credit CSV</option><option value="pipeline">Pipeline CSV</option></select><Button size="sm" variant="outline" onClick={() => void downloadCsv()} disabled={exporting || !data}>{exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Export</Button></div>
          </div>
        </CardContent>
      </Card>

      {error ? <div role="alert" className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"><AlertTriangle className="h-5 w-5 shrink-0" />{error}</div> : null}

      {loading && !data ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-32 w-full" />)}</div> : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Corporate revenue" value={money(data.kpis.orderRevenue, data.meta.currency)} detail="vs previous period" icon={WalletCards} changeValue={data.kpis.orderRevenueChange} />
            <MetricCard title="Corporate orders" value={data.kpis.orderCount.toLocaleString("en-BD")} detail="vs previous period" icon={ShoppingCart} changeValue={data.kpis.orderCountChange} />
            <MetricCard title="Average order value" value={money(data.kpis.averageOrderValue, data.meta.currency)} detail={`${money(data.kpis.paidRevenue, data.meta.currency)} paid`} icon={BarChart3} />
            <MetricCard title="Quote conversion" value={`${data.kpis.quotationConversionRate.toFixed(1)}%`} detail={`${data.kpis.newOrganizations} new organizations`} icon={Handshake} />
            <MetricCard title="Active organizations" value={data.kpis.activeOrganizations.toLocaleString("en-BD")} detail="Current verified network" icon={Building2} />
            <MetricCard title="Active partners" value={data.kpis.activePartners.toLocaleString("en-BD")} detail={`${money(data.kpis.commissionExpense, data.meta.currency)} commission`} icon={Handshake} />
            <MetricCard title="Settlements paid" value={money(data.kpis.settlementPaid, data.meta.currency)} detail="Within selected period" icon={CreditCard} />
            <MetricCard title="Open risk cases" value={data.kpis.openRiskCases.toLocaleString("en-BD")} detail="Open, review or confirmed" icon={ShieldAlert} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
            <Card className="border-border/70 shadow-sm"><CardHeader><CardTitle className="text-base">Revenue trend</CardTitle></CardHeader><CardContent><div className="h-[320px] w-full" aria-label="Corporate revenue trend chart">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}><defs><linearGradient id="businessRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} /><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="bucket" tick={{ fontSize: 11 }} tickMargin={8} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => money(value, data.meta.currency, true)} width={78} /><Tooltip formatter={(value) => money(Number(value), data.meta.currency)} labelFormatter={(value) => `Period: ${value}`} /><Legend /><Area type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--primary))" fill="url(#businessRevenue)" strokeWidth={2} /><Area type="monotone" dataKey="paidRevenue" name="Paid revenue" stroke="#059669" fill="transparent" strokeWidth={2} /></AreaChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No corporate orders in this period.</div>}</div></CardContent></Card>
            <Card className="border-border/70 shadow-sm"><CardHeader><CardTitle className="text-base">Credit exposure</CardTitle></CardHeader><CardContent className="space-y-5"><div><div className="flex items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">Outstanding</p><p className="mt-1 text-2xl font-semibold">{money(data.credit.outstanding, data.meta.currency)}</p></div><p className="text-sm font-semibold text-primary">{data.credit.utilizationRate.toFixed(1)}%</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${data.credit.utilizationRate > 85 ? "bg-red-500" : data.credit.utilizationRate > 65 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${Math.min(100, data.credit.utilizationRate)}%` }} /></div></div><div className="grid grid-cols-2 gap-3"><div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Total limit</p><p className="mt-1 font-semibold">{money(data.credit.limit, data.meta.currency)}</p></div><div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Available</p><p className="mt-1 font-semibold">{money(data.credit.available, data.meta.currency)}</p></div></div><p className="text-xs text-muted-foreground">Across {data.credit.accounts} active credit accounts.</p></CardContent></Card>
          </div>

          <Card className="border-border/70 shadow-sm"><CardHeader><CardTitle className="text-base">Commercial pipeline</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><PipelineCard title="Orders" rows={data.pipeline.orders} /><PipelineCard title="RFQs" rows={data.pipeline.rfqs} /><PipelineCard title="Quotations" rows={data.pipeline.quotations} /><PipelineCard title="Commission" rows={data.pipeline.commissions} /><PipelineCard title="Settlements" rows={data.pipeline.settlements} /></CardContent></Card>

          <div className="grid gap-6 2xl:grid-cols-2">
            <Card className="overflow-hidden border-border/70 shadow-sm"><CardHeader><CardTitle className="text-base">Top corporate organizations</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Organization</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader><TableBody>{data.topOrganizations.length ? data.topOrganizations.map((row) => <TableRow key={row.id || row.code}><TableCell><p className="font-medium">{row.legalName}</p><p className="text-xs text-muted-foreground">{row.code}</p></TableCell><TableCell className="text-right tabular-nums">{row.orders}</TableCell><TableCell className="text-right font-semibold tabular-nums">{money(row.revenue, data.meta.currency)}</TableCell></TableRow>) : <EmptyRow columns={3}>No corporate organization revenue in this period.</EmptyRow>}</TableBody></Table></div></CardContent></Card>
            <Card className="overflow-hidden border-border/70 shadow-sm"><CardHeader><CardTitle className="text-base">Partner performance</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Partner</TableHead><TableHead className="text-right">Conversions</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Commission</TableHead></TableRow></TableHeader><TableBody>{data.partnerPerformance.length ? data.partnerPerformance.map((row) => <TableRow key={row.id}><TableCell><p className="font-medium">{row.legalName}</p><p className="text-xs text-muted-foreground">{row.partnerCode} · {row.wonLeads}/{row.leads} leads won</p></TableCell><TableCell className="text-right tabular-nums">{row.conversions}</TableCell><TableCell className="text-right font-semibold tabular-nums">{money(row.attributedRevenue, data.meta.currency)}</TableCell><TableCell className="text-right tabular-nums">{money(row.commission, data.meta.currency)}</TableCell></TableRow>) : <EmptyRow columns={4}>No partner performance activity in this period.</EmptyRow>}</TableBody></Table></div></CardContent></Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
            <Card className="overflow-hidden border-border/70 shadow-sm"><CardHeader><CardTitle className="text-base">Highest credit exposure</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Organization</TableHead><TableHead className="text-right">Limit</TableHead><TableHead className="text-right">Outstanding</TableHead><TableHead className="text-right">Utilization</TableHead></TableRow></TableHeader><TableBody>{data.credit.exposure.length ? data.credit.exposure.map((row) => <TableRow key={row.id}><TableCell><p className="font-medium">{row.legalName}</p><p className="text-xs text-muted-foreground">{row.organizationCode} · {row.paymentTermDays} day terms</p></TableCell><TableCell className="text-right tabular-nums">{money(row.limit, data.meta.currency)}</TableCell><TableCell className="text-right font-semibold tabular-nums">{money(row.outstanding, data.meta.currency)}</TableCell><TableCell className="text-right"><Badge variant={row.utilizationRate > 85 ? "destructive" : "secondary"}>{row.utilizationRate.toFixed(1)}%</Badge></TableCell></TableRow>) : <EmptyRow columns={4}>No active credit exposure.</EmptyRow>}</TableBody></Table></div></CardContent></Card>
            <Card className="border-border/70 shadow-sm"><CardHeader><CardTitle className="text-base">Risk distribution</CardTitle></CardHeader><CardContent className="space-y-5"><div className="grid grid-cols-2 gap-3">{(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((severity) => { const count = data.risk.severities.find((row) => row.severity === severity)?.count ?? 0; return <div key={severity} className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">{label(severity)}</p><p className="mt-1 text-xl font-semibold">{count}</p></div>; })}</div><div className="space-y-2 border-t pt-4">{data.risk.statuses.length ? data.risk.statuses.map((row) => <div key={row.status} className="flex justify-between text-sm"><span className="text-muted-foreground">{label(row.status)}</span><span className="font-semibold">{row.count}</span></div>) : <p className="text-sm text-muted-foreground">No risk cases detected in this period.</p>}</div></CardContent></Card>
          </div>
        </>
      ) : null}
    </section>
  );
}
