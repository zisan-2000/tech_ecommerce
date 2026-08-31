"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, ExternalLink, Plus, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BusinessColumn, BusinessResourceConfig } from "./types";
import { BusinessRowActions } from "./RowActions";
import { CreateBusinessResourceDialog } from "./CreateResourceDialog";

type JsonRecord = Record<string, unknown>;
type Pagination = { page: number; limit: number; total: number; pages: number };

function getValue(record: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value === null || value === undefined) return undefined;
    if (Array.isArray(value) && key === "length") return value.length;
    return typeof value === "object" ? (value as JsonRecord)[key] : undefined;
  }, record);
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(value: unknown) {
  const status = String(value ?? "").toUpperCase();
  if (["ACTIVE", "APPROVED", "VERIFIED", "PAID", "WON", "CONVERTED", "TRUE"].includes(status)) return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (["REJECTED", "FAILED", "CANCELLED", "SUSPENDED", "REVOKED", "FALSE"].includes(status)) return "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300";
  if (["PENDING", "SUBMITTED", "UNDER_REVIEW", "PROCESSING", "HELD", "DRAFT", "PENDING_VERIFICATION"].includes(status)) return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300";
  return "border-border bg-muted/60 text-muted-foreground";
}

function formatCell(row: JsonRecord, column: BusinessColumn) {
  const value = getValue(row, column.path);
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">—</span>;
  if (column.format === "status") return <Badge variant="outline" className={statusTone(value)}>{humanize(String(value))}</Badge>;
  if (column.format === "date") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" });
  }
  if (column.format === "money") {
    const currency = String(getValue(row, column.currencyPath || "currency") || "BDT");
    const amount = Number(value);
    return Number.isFinite(amount)
      ? new Intl.NumberFormat("en-BD", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount)
      : `${currency} ${String(value)}`;
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return Array.isArray(value) ? `${value.length} items` : "View details";
  return String(value);
}

function extractRows(payload: unknown): { items: JsonRecord[]; pagination: Pagination } {
  const record = payload && typeof payload === "object" ? payload as JsonRecord : {};
  const rawItems = Array.isArray(record.items) ? record.items : [];
  const rawPagination = record.pagination && typeof record.pagination === "object" ? record.pagination as JsonRecord : {};
  return {
    items: rawItems.filter((item): item is JsonRecord => Boolean(item && typeof item === "object")),
    pagination: {
      page: Number(rawPagination.page) || 1,
      limit: Number(rawPagination.limit) || 25,
      total: Number(rawPagination.total) || rawItems.length,
      pages: Math.max(1, Number(rawPagination.pages) || 1),
    },
  };
}

export function BusinessResourceList({ config }: { config: BusinessResourceConfig }) {
  const { data: session } = useSession();
  const [rows, setRows] = useState<JsonRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, pages: 1 });
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const permissions = useMemo(() => new Set(Array.isArray((session?.user as { permissions?: string[] } | undefined)?.permissions) ? (session?.user as { permissions: string[] }).permissions : []), [session]);
  const canCreate = Boolean(config.createHref && (!config.createPermission || permissions.has(config.createPermission)));
  const canQuickCreate = Boolean(config.createForm && permissions.has(config.createForm.permission));

  useEffect(() => {
    const timer = window.setTimeout(() => startTransition(() => setQuery(search.trim())), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (page: number, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (query) params.set("search", query);
      if (status !== "ALL") params.set("status", status);
      const response = await fetch(`${config.endpoint}?${params}`, { cache: "no-store", signal });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Request failed with status ${response.status}.`);
      const result = extractRows(payload);
      setRows(result.items);
      setPagination(result.pagination);
    } catch (reason) {
      if ((reason as { name?: string })?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "Unable to load this workspace.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [config.endpoint, query, status]);

  useEffect(() => {
    const controller = new AbortController();
    void load(1, controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <section className="space-y-5" aria-labelledby={`${config.key}-title`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Business Network</p>
          <h1 id={`${config.key}-title`} className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{config.title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{config.description}</p>
        </div>
        {canCreate ? <Button asChild><Link href={config.createHref!}><Plus className="mr-2 h-4 w-4" />Create new</Link></Button> : canQuickCreate && config.createForm ? <CreateBusinessResourceDialog endpoint={config.endpoint} label={config.createForm.label} fields={config.createForm.fields} onComplete={() => void load(1)} /> : null}
      </div>

      <Card>
        <CardHeader className="border-b border-border p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Search {config.title}</span>
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${config.title.toLowerCase()}…`} className="pl-9" />
            </label>
            {config.statuses?.length ? (
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full md:w-56" aria-label="Filter by status"><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent><SelectItem value="ALL">All statuses</SelectItem>{config.statuses.map((item) => <SelectItem key={item} value={item}>{humanize(item)}</SelectItem>)}</SelectContent>
              </Select>
            ) : null}
            <Button variant="outline" size="icon" onClick={() => void load(pagination.page)} disabled={loading} aria-label="Refresh data"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div role="alert" className="m-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div className="flex-1"><p className="font-medium">Could not load data</p><p>{error}</p></div><Button variant="outline" size="sm" onClick={() => void load(1)}>Retry</Button>
            </div>
          ) : loading ? (
            <div className="space-y-3 p-5">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-16 text-center"><p className="font-medium text-foreground">No records found</p><p className="mt-1 text-sm text-muted-foreground">Try a different search or status filter.</p></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>{config.columns.map((column) => <TableHead key={column.path}>{column.label}</TableHead>)}{config.detailBasePath || config.rowActions?.length ? <TableHead className="w-24 text-right">Action</TableHead> : null}</TableRow></TableHeader>
                <TableBody>{rows.map((row, index) => {
                  const id = String(row.id ?? index);
                  return <TableRow key={id}>{config.columns.map((column) => <TableCell key={column.path} className="max-w-72 align-middle"><div className="truncate">{formatCell(row, column)}</div></TableCell>)}{config.detailBasePath || config.rowActions?.length ? <TableCell className="text-right"><div className="flex items-center justify-end gap-1">{config.detailBasePath ? <Button asChild variant="ghost" size="sm"><Link href={`${config.detailBasePath}/${encodeURIComponent(id)}`}>Open<ExternalLink className="ml-2 h-3.5 w-3.5" /></Link></Button> : null}{config.rowActions?.length ? <BusinessRowActions endpoint={config.endpoint} id={id} actions={config.rowActions} permissions={permissions} currentStatus={row.status} onComplete={() => void load(pagination.page)} /> : null}</div></TableCell> : null}</TableRow>;
                })}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <p>{pagination.total.toLocaleString("en-BD")} records · page {pagination.page} of {pagination.pages}</p>
        <div className="flex gap-2"><Button variant="outline" size="sm" disabled={loading || pagination.page <= 1} onClick={() => void load(pagination.page - 1)}><ArrowLeft className="mr-1 h-4 w-4" />Previous</Button><Button variant="outline" size="sm" disabled={loading || pagination.page >= pagination.pages} onClick={() => void load(pagination.page + 1)}>Next<ArrowRight className="ml-1 h-4 w-4" /></Button></div>
      </div>
      <span className="sr-only" aria-live="polite">{loading || isPending ? "Updating results" : `${pagination.total} results loaded`}</span>
    </section>
  );
}
