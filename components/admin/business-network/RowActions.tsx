"use client";

import { useState } from "react";
import { MoreHorizontal, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { BusinessAction } from "./types";

export function BusinessRowActions({ endpoint, id, actions, permissions, onComplete }: { endpoint: string; id: string; actions: BusinessAction[]; permissions: Set<string>; onComplete: () => void }) {
  const visibleActions = actions.filter((action) => permissions.has(action.permission));
  const [active, setActive] = useState<BusinessAction | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  if (!visibleActions.length) return null;
  const selectAction = (action: BusinessAction) => { setActive(action); setForm(Object.fromEntries((action.fields || []).map((field) => [field.name, field.defaultValue || ""]))); };
  const submit = async () => {
    if (!active) return;
    const missing = (active.fields || []).find((field) => field.required && !form[field.name]?.trim());
    if (missing) { toast.error(`${missing.label} is required.`); return; }
    const values = Object.fromEntries((active.fields || []).flatMap((field) => { const value = form[field.name]?.trim(); if (!value) return []; return [[field.name, field.type === "number" ? Number(value) : value === "true" ? true : value === "false" ? false : value]]; }));
    setSubmitting(true);
    try {
      const actionPath = active.slug ? `/${active.slug}` : "";
      const response = await fetch(`${endpoint}/${encodeURIComponent(id)}${actionPath}`, { method: active.method || "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(active.body || {}), ...values }) });
      const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.error || `Action failed with status ${response.status}.`);
      toast.success(`${active.label} completed.`); setActive(null); setForm({}); onComplete();
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Action could not be completed."); } finally { setSubmitting(false); }
  };
  return <><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Open row actions"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{visibleActions.map((action) => <DropdownMenuItem key={action.slug} className={action.tone === "danger" ? "text-destructive focus:text-destructive" : ""} onSelect={() => selectAction(action)}>{action.label}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu><Dialog open={Boolean(active)} onOpenChange={(open) => { if (!open && !submitting) setActive(null); }}><DialogContent><DialogHeader><DialogTitle>{active?.label}</DialogTitle><DialogDescription>Confirm this audited workflow action for record {id}.</DialogDescription></DialogHeader><div className="space-y-4">{active?.fields?.map((field) => <div key={field.name} className="space-y-2"><Label htmlFor={`row-${id}-${field.name}`}>{field.label}{field.required ? " *" : ""}</Label>{field.type === "textarea" ? <Textarea id={`row-${id}-${field.name}`} value={form[field.name] || ""} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} /> : field.type === "select" ? <Select value={form[field.name] || ""} onValueChange={(value) => setForm((current) => ({ ...current, [field.name]: value }))}><SelectTrigger id={`row-${id}-${field.name}`}><SelectValue /></SelectTrigger><SelectContent>{field.options?.map((option) => <SelectItem key={option} value={option}>{option.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select> : <Input id={`row-${id}-${field.name}`} type={field.type === "number" ? "number" : field.type === "date" ? "datetime-local" : "text"} value={form[field.name] || ""} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} />}</div>)}</div><DialogFooter><Button variant="outline" disabled={submitting} onClick={() => setActive(null)}>Cancel</Button><Button variant={active?.tone === "danger" ? "destructive" : "default"} disabled={submitting} onClick={() => void submit()}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Confirm</Button></DialogFooter></DialogContent></Dialog></>;
}
