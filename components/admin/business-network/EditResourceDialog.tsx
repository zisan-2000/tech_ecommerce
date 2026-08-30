"use client";

import { useMemo, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionField } from "./types";

type JsonRecord = Record<string, unknown>;
function readPath(record: JsonRecord, path: string): unknown { return path.split(".").reduce<unknown>((current, key) => current && typeof current === "object" ? (current as JsonRecord)[key] : undefined, record); }

export function EditBusinessResourceDialog({ endpoint, label, fields, record, onComplete }: { endpoint: string; label: string; fields: ActionField[]; record: JsonRecord; onComplete: () => void }) {
  const initial = useMemo(() => Object.fromEntries(fields.map((field) => { const value = readPath(record, field.name); if (field.type === "date" && typeof value === "string") return [field.name, value.slice(0, 16)]; return [field.name, value === null || value === undefined ? "" : String(value)]; })), [fields, record]);
  const [open, setOpen] = useState(false); const [form, setForm] = useState(initial); const [submitting, setSubmitting] = useState(false);
  const submit = async () => { const body: JsonRecord = {}; for (const field of fields) { const raw = form[field.name]?.trim(); if (!raw && !field.required) { body[field.name] = null; continue; } body[field.name] = field.type === "number" ? Number(raw) : field.type === "checkbox" ? raw === "true" : raw; } setSubmitting(true); try { const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.error || `${label} could not be updated.`); toast.success(`${label} updated.`); setOpen(false); onComplete(); } catch (reason) { toast.error(reason instanceof Error ? reason.message : `${label} could not be updated.`); } finally { setSubmitting(false); } };
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline"><Pencil className="mr-2 h-4 w-4" />Edit</Button></DialogTrigger><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Edit {label.toLowerCase()}</DialogTitle><DialogDescription>Only allowed fields are sent; the server revalidates and audits this change.</DialogDescription></DialogHeader><div className="grid gap-4 md:grid-cols-2">{fields.map((field) => <div key={field.name} className={`space-y-2 ${field.type === "textarea" ? "md:col-span-2" : ""}`}><Label htmlFor={`edit-${field.name}`}>{field.label}</Label>{field.type === "textarea" ? <Textarea id={`edit-${field.name}`} value={form[field.name] || ""} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} /> : field.type === "select" ? <Select value={form[field.name] || ""} onValueChange={(value) => setForm((current) => ({ ...current, [field.name]: value }))}><SelectTrigger id={`edit-${field.name}`}><SelectValue /></SelectTrigger><SelectContent>{field.options?.map((option) => <SelectItem key={option} value={option}>{option.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select> : field.type === "checkbox" ? <label className="flex h-10 items-center gap-3 rounded-md border px-3"><Checkbox checked={form[field.name] === "true"} onCheckedChange={(checked) => setForm((current) => ({ ...current, [field.name]: checked ? "true" : "false" }))} /><span className="text-sm">Enabled</span></label> : <Input id={`edit-${field.name}`} type={field.type === "number" ? "number" : field.type === "date" ? "datetime-local" : "text"} value={form[field.name] || ""} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.value }))} />}</div>)}</div><DialogFooter><Button variant="outline" disabled={submitting} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={submitting} onClick={() => void submit()}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save changes</Button></DialogFooter></DialogContent></Dialog>;
}
