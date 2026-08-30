"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, ChevronLeft, ChevronRight, Loader2, Mail, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, PageHeader, Surface, formatDate } from "./PortalPrimitives";

type NotificationItem = {
  id: string;
  category: string;
  priority: string;
  title: string;
  body: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
};
type Preferences = {
  emailEnabled: boolean;
  organizationEmail: boolean;
  salesEmail: boolean;
  financeEmail: boolean;
  partnershipEmail: boolean;
  securityEmail: boolean;
};
const defaultPreferences: Preferences = { emailEnabled: true, organizationEmail: true, salesEmail: true, financeEmail: true, partnershipEmail: true, securityEmail: true };

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || "Notification request failed.");
  return payload;
}

export function NotificationCenter() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [state, setState] = useState("all");
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ page: String(page), limit: "20" });
      if (state !== "all") query.set("state", state);
      if (category !== "all") query.set("category", category);
      const payload = await requestJson(`/api/business/notifications?${query}`);
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setUnread(Number(payload.unread || 0));
      setPages(Math.max(1, Number(payload.pagination?.pages || 1)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Notifications could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [category, page, state]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!preferencesOpen) return;
    void requestJson("/api/business/notifications/preferences")
      .then((payload) => setPreferences(payload.preferences as Preferences))
      .catch((reason) => toast.error(reason instanceof Error ? reason.message : "Preferences could not be loaded."));
  }, [preferencesOpen]);

  const markRead = async (id: string) => {
    const item = items.find((entry) => entry.id === id);
    if (item?.readAt) return;
    try {
      await requestJson(`/api/business/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
      setItems((current) => current.map((entry) => entry.id === id ? { ...entry, readAt: new Date().toISOString() } : entry));
      setUnread((current) => Math.max(0, current - 1));
      window.dispatchEvent(new Event("business-notifications-changed"));
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Notification could not be marked read.");
    }
  };

  const markAllRead = async () => {
    try {
      await requestJson("/api/business/notifications/read-all", { method: "POST" });
      setItems((current) => current.map((entry) => ({ ...entry, readAt: entry.readAt || new Date().toISOString() })));
      setUnread(0);
      window.dispatchEvent(new Event("business-notifications-changed"));
      toast.success("All notifications marked as read.");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Notifications could not be updated.");
    }
  };

  const savePreferences = async () => {
    setSaving(true);
    try {
      await requestJson("/api/business/notifications/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(preferences) });
      toast.success("Notification preferences saved.");
      setPreferencesOpen(false);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Preferences could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return <>
    <PageHeader eyebrow="Business portal" title="Notifications" description="Operational updates for RFQs, quotations, orders, leads, commission and settlements." />
    <Surface className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1.5"><Bell className="size-3.5" />{unread} unread</Badge>
          <Select value={state} onValueChange={(value) => { setState(value); setPage(1); }}><SelectTrigger className="w-32" aria-label="Notification read state"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="unread">Unread</SelectItem><SelectItem value="read">Read</SelectItem></SelectContent></Select>
          <Select value={category} onValueChange={(value) => { setCategory(value); setPage(1); }}><SelectTrigger className="w-44" aria-label="Notification category"><SelectValue /></SelectTrigger><SelectContent>{["all", "ORGANIZATION", "SALES", "FINANCE", "PARTNERSHIP", "SECURITY", "SYSTEM"].map((value) => <SelectItem key={value} value={value}>{value === "all" ? "All categories" : value.toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setPreferencesOpen((current) => !current)}><Settings2 className="size-4" />Preferences</Button><Button size="sm" disabled={!unread} onClick={() => void markAllRead()}><CheckCheck className="size-4" />Mark all read</Button></div>
      </div>
      {preferencesOpen && <div className="border-b border-border bg-muted/20 p-5"><div className="flex items-center gap-2"><Mail className="size-4 text-blue-600" /><h2 className="font-semibold">Email delivery preferences</h2></div><p className="mt-1 text-xs text-muted-foreground">Security-sensitive in-app notifications remain available even when email is disabled.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{([
        ["emailEnabled", "Enable notification email"], ["organizationEmail", "Organization"], ["salesEmail", "Sales"], ["financeEmail", "Finance"], ["partnershipEmail", "Partnership"], ["securityEmail", "Security"],
      ] as const).map(([key, label]) => <label key={key} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm font-medium"><input type="checkbox" className="size-4 accent-blue-600" checked={preferences[key]} onChange={(event) => setPreferences((current) => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}</div><div className="mt-4 flex justify-end"><Button disabled={saving} onClick={() => void savePreferences()}>{saving && <Loader2 className="size-4 animate-spin" />}Save preferences</Button></div></div>}
      {error ? <div role="alert" className="p-8 text-center text-destructive">{error}<div><Button variant="outline" className="mt-4" onClick={() => void load()}>Try again</Button></div></div> : loading ? <div className="space-y-3 p-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-xl bg-muted" />)}</div> : items.length === 0 ? <EmptyState title="You're all caught up" description="No notifications match the current filters." /> : <div className="divide-y divide-border">{items.map((item) => <article key={item.id} className={`flex gap-4 p-5 ${item.readAt ? "bg-card" : "bg-blue-50/50 dark:bg-blue-950/10"}`}><span className={`mt-1 size-2.5 shrink-0 rounded-full ${item.readAt ? "bg-muted-foreground/30" : "bg-blue-600"}`} aria-label={item.readAt ? "Read" : "Unread"} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{item.title}</h2><Badge variant="outline">{item.category.toLowerCase()}</Badge>{item.priority === "HIGH" || item.priority === "URGENT" ? <Badge variant="destructive">{item.priority.toLowerCase()}</Badge> : null}</div><p className="mt-1 text-sm text-muted-foreground">{item.body}</p><div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><time dateTime={item.createdAt}>{formatDate(item.createdAt, true)}</time>{!item.readAt && <button className="font-medium text-blue-600 hover:underline" onClick={() => void markRead(item.id)}>Mark as read</button>}{item.actionUrl && <Link href={item.actionUrl} onClick={() => void markRead(item.id)} className="font-medium text-blue-600 hover:underline">Open record</Link>}</div></div></article>)}</div>}
      {!loading && !error && pages > 1 && <div className="flex items-center justify-between border-t border-border p-4"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft className="size-4" />Previous</Button><span className="text-sm text-muted-foreground">Page {page} of {pages}</span><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight className="size-4" /></Button></div>}
    </Surface>
  </>;
}
