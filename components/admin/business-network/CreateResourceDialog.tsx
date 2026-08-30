"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionField } from "./types";

function setNested(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split("."); let current = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index]; if (!current[key] || typeof current[key] !== "object") current[key] = {}; current = current[key] as Record<string, unknown>;
  }
  current[parts.at(-1)!] = value;
}

export function CreateBusinessResourceDialog({ endpoint, label, fields, onComplete }: { endpoint: string; label: string; fields: ActionField[]; onComplete: () => void }) {
  const defaults = () => Object.fromEntries(fields.map((field) => [field.name, field.defaultValue || (field.type === "checkbox" ? "false" : "")]));
  const [open, setOpen] = useState(false); const [form, setForm] = useState<Record<string, string>>(defaults); const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    const missing = fields.find((field) => field.required && !form[field.name]?.trim()); if (missing) { toast.error(`${missing.label} is required.`); return; }
    const body: Record<string, unknown> = {};
    for (const field of fields) { const raw = form[field.name]?.trim(); if (!raw && !field.required && field.type !== "checkbox") continue; const value: unknown = field.type === "number" ? Number(raw) : field.type === "checkbox" ? raw === "true" : raw; setNested(body, field.name, value); }
    setSubmitting(true);
    try { const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.error || `${label} could not be created.`); toast.success(`${label} created.`); setOpen(false); setForm(defaults()); onComplete(); } catch (reason) { toast.error(reason instanceof Error ? reason.message : `${label} could not be created.`); } finally { setSubmitting(false); }
  };
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Create {label.toLowerCase()}</Button></DialogTrigger><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Create {label.toLowerCase()}</DialogTitle><DialogDescription>Fields are validated and the mutation is authorized and audited by the server.</DialogDescription></DialogHeader><div className="grid gap-4 py-2 md:grid-cols-2">{fields.map((field) => <div key={field.name} className={`space-y-2 ${field.type === "textarea" ? "md:col-span-2" : ""}`}><Label htmlFor={`create-${field.name}`}>{field.label}{field.required ? " *" : ""}</Label>{field.type === "textarea" ? <Textarea id={`create-${field.name}`} value={form[field.name] || ""} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} /> : field.type === "select" ? <Select value={form[field.name] || ""} onValueChange={(value) => setForm((current) => ({ ...current, [field.name]: value }))}><SelectTrigger id={`create-${field.name}`}><SelectValue placeholder={`Select ${field.label.toLowerCase()}`} /></SelectTrigger><SelectContent>{field.options?.map((option) => <SelectItem key={option} value={option}>{option.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select> : field.type === "checkbox" ? <label className="flex h-10 items-center gap-3 rounded-md border px-3"><Checkbox checked={form[field.name] === "true"} onCheckedChange={(checked) => setForm((current) => ({ ...current, [field.name]: checked ? "true" : "false" }))} /><span className="text-sm">Enabled</span></label> : <Input id={`create-${field.name}`} type={field.type === "number" ? "number" : field.type === "date" ? "datetime-local" : "text"} value={form[field.name] || ""} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} />}</div>)}</div><DialogFooter><Button variant="outline" disabled={submitting} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={submitting} onClick={() => void submit()}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Create</Button></DialogFooter></DialogContent></Dialog>;
}
