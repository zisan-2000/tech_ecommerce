"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type RiskCase = {
  id: string;
  caseNumber: string;
  severity: string;
  status: string;
  riskScore: number;
  title: string;
  summary: string;
  evidence: Record<string, unknown>;
  detectedAt: string;
  resolutionNote: string | null;
  rule: { code: string; name: string };
  organization: { code: string; legalName: string } | null;
  partnerProfile: { partnerCode: string } | null;
  assignedTo: { name: string | null; email: string } | null;
};

const statuses = ["all", "OPEN", "UNDER_REVIEW", "CONFIRMED", "FALSE_POSITIVE", "RESOLVED"];
const actionsByStatus: Record<string, Array<{ action: string; label: string; needsNote?: boolean; destructive?: boolean }>> = {
  OPEN: [{ action: "START_REVIEW", label: "Start review" }, { action: "FALSE_POSITIVE", label: "False positive", needsNote: true }],
  UNDER_REVIEW: [{ action: "CONFIRM", label: "Confirm risk", needsNote: true, destructive: true }, { action: "FALSE_POSITIVE", label: "False positive", needsNote: true }],
  CONFIRMED: [{ action: "RESOLVE", label: "Resolve case", needsNote: true }],
};

function severityClass(severity: string) {
  if (severity === "CRITICAL") return "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300";
  if (severity === "HIGH") return "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300";
  if (severity === "MEDIUM") return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300";
  return "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";
}

function readable(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase()); }

export function RiskReview() {
  const { data: session } = useSession();
  const permissions = useMemo(() => new Set(Array.isArray((session?.user as { permissions?: string[] } | undefined)?.permissions) ? (session?.user as { permissions: string[] }).permissions : []), [session]);
  const canManage = permissions.has("business.account.manage") || permissions.has("partner.profile.manage");
  const [items, setItems] = useState<RiskCase[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState("OPEN");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<{ riskCase: RiskCase; action: string; label: string; needsNote?: boolean; destructive?: boolean } | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { const timeout = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300); return () => window.clearTimeout(timeout); }, [search]);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const query = new URLSearchParams({ page: String(page), limit: "25" });
      if (status !== "all") query.set("status", status);
      if (debouncedSearch) query.set("search", debouncedSearch);
      const response = await fetch(`/api/admin/business-network/risk?${query}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Risk cases could not be loaded.");
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setCounts(payload.statusCounts || {});
      setPages(Math.max(1, Number(payload.pagination?.pages || 1)));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Risk cases could not be loaded."); }
    finally { setLoading(false); }
  }, [debouncedSearch, page, status]);
  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!active) return;
    if (active.needsNote && note.trim().length < 3) { toast.error("A review note of at least 3 characters is required."); return; }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/business-network/risk/${encodeURIComponent(active.riskCase.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: active.action, ...(active.needsNote ? { note: note.trim() } : {}) }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Risk decision failed.");
      toast.success(`${active.label} completed.`); setActive(null); setNote(""); await load();
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Risk decision failed."); }
    finally { setSubmitting(false); }
  };

  return <section className="space-y-5">
    <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Governance & Intelligence</p><h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold"><ShieldAlert className="h-6 w-6 text-primary" />Fraud & Risk Review</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Evidence-backed signals are deduplicated, scored and resolved through an audited review workflow.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{statuses.slice(1).map((value) => <button key={value} onClick={() => { setStatus(value); setPage(1); }} className={`rounded-xl border p-4 text-left transition ${status === value ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card hover:border-primary/40"}`}><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{readable(value)}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{counts[value] ?? 0}</p></button>)}</div>
    <Card><CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between"><div><CardTitle>Risk cases</CardTitle><p className="mt-1 text-sm text-muted-foreground">Sensitive identities are hashed or masked in stored evidence.</p></div><div className="flex flex-col gap-2 sm:flex-row"><label className="relative"><span className="sr-only">Search risk cases</span><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full pl-9 sm:w-64" placeholder="Case, rule, organization…" /></label><Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}><SelectTrigger className="w-full sm:w-44" aria-label="Risk case status"><SelectValue /></SelectTrigger><SelectContent>{statuses.map((value) => <SelectItem key={value} value={value}>{value === "all" ? "All statuses" : readable(value)}</SelectItem>)}</SelectContent></Select></div></CardHeader><CardContent>
      {error ? <div role="alert" className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"><AlertTriangle className="size-5" />{error}<Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button></div> : loading ? <div className="space-y-3">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-40 animate-pulse rounded-xl bg-muted" />)}</div> : items.length === 0 ? <div className="grid min-h-56 place-items-center text-center"><div><CheckCircle2 className="mx-auto size-10 text-emerald-500" /><h2 className="mt-3 font-semibold">No matching risk cases</h2><p className="mt-1 text-sm text-muted-foreground">The selected review queue is clear.</p></div></div> : <div className="space-y-3">{items.map((item) => <article key={item.id} className="rounded-xl border border-border bg-muted/10 p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={severityClass(item.severity)}>{item.severity}</Badge><Badge variant="secondary">{readable(item.status)}</Badge><span className="font-mono text-xs text-muted-foreground">{item.caseNumber}</span><span className="text-xs font-semibold text-primary">Score {item.riskScore}</span></div><h2 className="mt-3 font-semibold">{item.title}</h2><p className="mt-1 text-sm text-muted-foreground">{item.summary}</p><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4"><div><dt className="text-xs text-muted-foreground">Rule</dt><dd className="font-medium">{item.rule.name}</dd></div><div><dt className="text-xs text-muted-foreground">Organization</dt><dd className="font-medium">{item.organization?.legalName || "—"}</dd></div><div><dt className="text-xs text-muted-foreground">Partner</dt><dd className="font-medium">{item.partnerProfile?.partnerCode || "—"}</dd></div><div><dt className="text-xs text-muted-foreground">Detected</dt><dd className="font-medium">{new Intl.DateTimeFormat("en-BD", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.detectedAt))}</dd></div></dl><details className="mt-4"><summary className="cursor-pointer text-xs font-semibold text-primary">Review evidence</summary><pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(item.evidence, null, 2)}</pre></details>{item.resolutionNote && <p className="mt-3 rounded-lg border bg-card p-3 text-sm"><span className="font-semibold">Resolution:</span> {item.resolutionNote}</p>}</div>{canManage && <div className="flex shrink-0 flex-wrap gap-2">{(actionsByStatus[item.status] || []).map((action) => <Button key={action.action} size="sm" variant={action.destructive ? "destructive" : "outline"} onClick={() => { setActive({ riskCase: item, ...action }); setNote(""); }}>{action.label}</Button>)}</div>}</div></article>)}</div>}
      {!loading && !error && pages > 1 && <div className="mt-5 flex items-center justify-between"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft className="size-4" />Previous</Button><span className="text-sm text-muted-foreground">Page {page} of {pages}</span><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight className="size-4" /></Button></div>}
    </CardContent></Card>
    <Dialog open={Boolean(active)} onOpenChange={(open) => { if (!open && !submitting) { setActive(null); setNote(""); } }}><DialogContent><DialogHeader><DialogTitle>{active?.label}</DialogTitle><DialogDescription>This decision is validated server-side and recorded in the immutable business audit log for {active?.riskCase.caseNumber}.</DialogDescription></DialogHeader>{active?.needsNote && <div className="space-y-2"><Label htmlFor="risk-resolution-note">Review note</Label><Textarea id="risk-resolution-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} placeholder="Document the evidence and decision rationale…" /></div>}<DialogFooter><Button variant="outline" disabled={submitting} onClick={() => setActive(null)}>Cancel</Button><Button variant={active?.destructive ? "destructive" : "default"} disabled={submitting} onClick={() => void submit()}>{submitting && <Loader2 className="size-4 animate-spin" />}Confirm decision</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}

