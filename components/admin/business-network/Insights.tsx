"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BarChart3, FileWarning, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type JsonRecord = Record<string, unknown>;
function isRecord(value: unknown): value is JsonRecord { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function label(value: string) { return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()); }

export function BusinessInsights({ kind }: { kind: "risk" | "disputes" | "reports" }) {
  const [data, setData] = useState<JsonRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/admin/business-network/${kind}`, { cache: "no-store", signal: controller.signal }).then(async (response) => { const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.error || `Unable to load ${kind}.`); return payload as JsonRecord; }).then(setData).catch((reason) => { if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : `Unable to load ${kind}.`); });
    return () => controller.abort();
  }, [kind]);
  const title = kind === "risk" ? "Risk Review" : kind === "disputes" ? "Dispute Evidence" : "Business Reports";
  const description = kind === "risk" ? "Exception-based review of pending, suspended, rejected and failed business-network records." : kind === "disputes" ? "Central evidence view for rejected and cancelled commercial decisions; source records remain immutable." : "Live commercial, credit, commission and network metrics from the canonical database.";
  const Icon = kind === "risk" ? ShieldAlert : kind === "disputes" ? FileWarning : BarChart3;
  const primitiveGroups = data ? Object.entries(data).filter(([, value]) => isRecord(value)) : [];
  const arrays = data ? Object.entries(data).filter(([, value]) => Array.isArray(value)) : [];
  return <section className="space-y-5"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Governance & Intelligence</p><h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold"><Icon className="h-6 w-6 text-primary" />{title}</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p></div>{error ? <div role="alert" className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"><AlertTriangle className="h-5 w-5" />{error}</div> : !data ? <div className="grid gap-4 md:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-32 w-full" />)}</div> : <>
    {primitiveGroups.map(([group, value]) => <Card key={group}><CardHeader><CardTitle className="text-base">{label(group)}</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(value as JsonRecord).map(([key, item]) => <div key={key} className="rounded-lg border bg-muted/20 p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label(key)}</p><p className="mt-2 text-xl font-semibold">{String(item ?? "—")}</p></div>)}</CardContent></Card>)}
    {arrays.map(([group, value]) => <Card key={group}><CardHeader><CardTitle className="flex items-center justify-between text-base">{label(group)}<Badge variant="secondary">{(value as unknown[]).length}</Badge></CardTitle></CardHeader><CardContent className="space-y-3">{(value as unknown[]).length ? (value as unknown[]).map((item, index) => <div key={isRecord(item) ? String(item.id ?? index) : String(index)} className="grid gap-2 rounded-lg border bg-muted/20 p-4 text-sm sm:grid-cols-2 xl:grid-cols-4">{isRecord(item) ? Object.entries(item).filter(([, cell]) => !isRecord(cell) && !Array.isArray(cell)).slice(0, 8).map(([key, cell]) => <div key={key}><p className="text-xs text-muted-foreground">{label(key)}</p><p className="mt-1 break-words font-medium">{String(cell ?? "—")}</p></div>) : String(item)}</div>) : <p className="py-6 text-center text-sm text-muted-foreground">No current records in this queue.</p>}</CardContent></Card>)}
  </>}</section>;
}

