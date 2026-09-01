"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { isBusinessActionAvailable, type BusinessAction, type BusinessResourceConfig } from "./types";
import { OrganizationFocus } from "./OrganizationFocus";
import { EditBusinessResourceDialog } from "./EditResourceDialog";
import { BusinessRulesManager } from "./RulesManager";

type JsonRecord = Record<string, unknown>;

function titleCase(value: string) { return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value); if (!Number.isNaN(date.getTime())) return date.toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" });
  }
  return String(value);
}

function isDetailActionAvailable(configKey: string, action: BusinessAction, data: JsonRecord | null) {
  if (!isBusinessActionAvailable(action, data?.status)) return false;
  if (configKey !== "quotations") return true;
  if (!data) return false;

  const status = typeof data.status === "string" ? data.status : "";
  const isApproved = Boolean(data.approvedAt && data.approvedById);

  switch (action.slug) {
    case "submit-review":
      return status === "DRAFT";
    case "approve":
      return status === "INTERNAL_REVIEW" && !isApproved;
    case "send":
      return status === "INTERNAL_REVIEW" && isApproved;
    case "cancel":
      return status === "DRAFT" || status === "INTERNAL_REVIEW";
    default:
      return true;
  }
}

function ObjectSection({ name, value, depth = 0 }: { name: string; value: unknown; depth?: number }) {
  if (Array.isArray(value)) {
    return <Card className="overflow-hidden"><CardHeader className="border-b py-3"><CardTitle className="text-sm">{titleCase(name)} <Badge variant="secondary" className="ml-1">{value.length}</Badge></CardTitle></CardHeader><CardContent className="space-y-3 p-4">{value.length ? value.map((item, index) => isRecord(item) ? <div key={String(item.id ?? index)} className="rounded-lg border border-border bg-muted/20 p-3"><ObjectGrid value={item} depth={depth + 1} /></div> : <p key={index} className="text-sm">{displayValue(item)}</p>) : <p className="text-sm text-muted-foreground">No records.</p>}</CardContent></Card>;
  }
  if (isRecord(value)) return <Card><CardHeader className="border-b py-3"><CardTitle className="text-sm">{titleCase(name)}</CardTitle></CardHeader><CardContent className="p-4"><ObjectGrid value={value} depth={depth + 1} /></CardContent></Card>;
  return null;
}

function ObjectGrid({ value, depth = 0 }: { value: JsonRecord; depth?: number }) {
  const primitives = Object.entries(value).filter(([, item]) => !isRecord(item) && !Array.isArray(item));
  const nested = Object.entries(value).filter(([, item]) => isRecord(item) || Array.isArray(item));
  return <div className="space-y-4"><dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">{primitives.map(([key, item]) => <div key={key} className="min-w-0"><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{titleCase(key)}</dt><dd className="mt-1 break-words text-sm font-medium text-foreground">{typeof item === "string" && (item.startsWith("https://") || item.startsWith("/upload/")) ? <a className="text-primary underline-offset-4 hover:underline" href={item} target="_blank" rel="noreferrer">Open document</a> : displayValue(item)}</dd></div>)}</dl>{depth < 4 && nested.length ? <div className="grid gap-4 xl:grid-cols-2">{nested.map(([key, item]) => <ObjectSection key={key} name={key} value={item} depth={depth} />)}</div> : null}</div>;
}

export function BusinessResourceDetail({ config, id, focus }: { config: BusinessResourceConfig; id: string; focus?: "members" | "documents" | "capabilities" }) {
  const { data: session } = useSession();
  const [data, setData] = useState<JsonRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeAction, setActiveAction] = useState<BusinessAction | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const permissions = useMemo(() => new Set(Array.isArray((session?.user as { permissions?: string[] } | undefined)?.permissions) ? (session?.user as { permissions: string[] }).permissions : []), [session]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`${config.endpoint}/${encodeURIComponent(id)}`, { cache: "no-store", signal });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Request failed with status ${response.status}.`);
      const root = config.detailRoot && isRecord(payload) ? payload[config.detailRoot] : payload;
      setData(isRecord(root) ? root : isRecord(payload) ? payload : {});
    } catch (reason) { if ((reason as { name?: string })?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "Unable to load this record."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [config.detailRoot, config.endpoint, id]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  const openAction = (action: BusinessAction) => {
    const defaults = Object.fromEntries((action.fields || []).map((field) => [field.name, field.name === "idempotencyKey" ? `admin-${crypto.randomUUID()}` : field.defaultValue || ""]));
    setForm(defaults); setActiveAction(action);
  };

  const submitAction = async () => {
    if (!activeAction) return;
    const missing = (activeAction.fields || []).find((field) => field.required && !form[field.name]?.trim());
    if (missing) { toast.error(`${missing.label} is required.`); return; }
    const fieldBody = Object.fromEntries((activeAction.fields || []).flatMap((field) => {
      const value = form[field.name]?.trim();
      if (!value) return [];
      return [[field.name, field.type === "number" ? Number(value) : value === "true" ? true : value === "false" ? false : value]];
    }));
    setSubmitting(true);
    try {
      const response = await fetch(`${config.endpoint}/${encodeURIComponent(id)}/${activeAction.slug}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(activeAction.body || {}), ...fieldBody }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Action failed with status ${response.status}.`);
      toast.success(`${activeAction.label} completed.`); setActiveAction(null); setForm({}); await load();
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "The action could not be completed."); }
    finally { setSubmitting(false); }
  };

  const focusedData = focus && data ? { [focus]: data[focus] } : data;
  return <section className="space-y-5">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><Button asChild variant="ghost" size="sm" className="-ml-3 mb-2"><Link href={config.detailBasePath || "/admin/business-network"}><ArrowLeft className="mr-2 h-4 w-4" />Back to {config.title}</Link></Button><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Business Network Record</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{focus ? titleCase(focus) : config.title}</h1><p className="mt-1 text-sm text-muted-foreground">ID: {id}</p></div>
      <div className="flex flex-wrap gap-2">{config.editForm && data && permissions.has(config.editForm.permission) ? <EditBusinessResourceDialog endpoint={`${config.endpoint}/${encodeURIComponent(id)}`} label={config.editForm.label} fields={config.editForm.fields} record={data} onComplete={() => void load()} /> : null}{config.actions?.filter((action) => permissions.has(action.permission) && isDetailActionAvailable(config.key, action, data)).map((action) => <Button key={action.slug} variant={action.tone === "danger" ? "destructive" : "outline"} onClick={() => openAction(action)}><ShieldCheck className="mr-2 h-4 w-4" />{action.label}</Button>)}</div>
    </div>
    {config.key === "organizations" ? <nav aria-label="Organization record sections" className="flex flex-wrap gap-2 rounded-xl border bg-card p-2">{[["Overview", ""], ["Members", "/members"], ["Documents", "/documents"], ["Capabilities", "/capabilities"]].map(([label, suffix]) => <Button key={label} asChild size="sm" variant={(focus || "overview") === label.toLowerCase() ? "default" : "ghost"}><Link href={`/admin/business-network/organizations/${encodeURIComponent(id)}${suffix}`}>{label}</Link></Button>)}</nav> : null}
    {error ? <div role="alert" className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"><AlertCircle className="h-5 w-5" /><div><p className="font-medium">Could not load record</p><p className="text-sm">{error}</p></div></div> : loading ? <div className="space-y-4"><Skeleton className="h-36 w-full" /><Skeleton className="h-72 w-full" /></div> : focus && data ? <OrganizationFocus focus={focus} organizationId={id} records={data[focus]} endpoint={config.endpoint} permissions={permissions} onComplete={() => void load()} /> : focusedData ? <><div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" />Live record loaded from the protected admin API.</div><ObjectGrid value={focusedData} />{config.key === "tiers" ? <BusinessRulesManager kind="pricing" parentId={id} rules={data?.rules} permissions={permissions} onComplete={() => void load()} /> : config.key === "commission-plans" ? <BusinessRulesManager kind="commission" parentId={id} rules={data?.rules} permissions={permissions} onComplete={() => void load()} /> : null}</> : null}
    <Dialog open={Boolean(activeAction)} onOpenChange={(open) => { if (!open && !submitting) setActiveAction(null); }}><DialogContent><DialogHeader><DialogTitle>{activeAction?.label}</DialogTitle><DialogDescription>This workflow action is permission checked, audited, and validated again by the server.</DialogDescription></DialogHeader><div className="space-y-4 py-2">{activeAction?.fields?.map((field) => <div key={field.name} className="space-y-2"><Label htmlFor={`action-${field.name}`}>{field.label}{field.required ? " *" : ""}</Label>{field.type === "textarea" ? <Textarea id={`action-${field.name}`} value={form[field.name] || ""} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} /> : field.type === "select" ? <Select value={form[field.name] || ""} onValueChange={(value) => setForm((current) => ({ ...current, [field.name]: value }))}><SelectTrigger id={`action-${field.name}`}><SelectValue placeholder={`Select ${field.label.toLowerCase()}`} /></SelectTrigger><SelectContent>{field.options?.map((option) => <SelectItem key={option} value={option}>{titleCase(option)}</SelectItem>)}</SelectContent></Select> : <Input id={`action-${field.name}`} type={field.type === "number" ? "number" : field.type === "date" ? "datetime-local" : "text"} value={form[field.name] || ""} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} />}</div>)}</div><DialogFooter><Button variant="outline" disabled={submitting} onClick={() => setActiveAction(null)}>Cancel</Button><Button variant={activeAction?.tone === "danger" ? "destructive" : "default"} disabled={submitting} onClick={() => void submitAction()}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Confirm {activeAction?.label.toLowerCase()}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
