"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const companyTypes = ["PROPRIETORSHIP", "PARTNERSHIP", "LIMITED_COMPANY", "PUBLIC_LIMITED", "NGO", "GOVERNMENT", "EDUCATIONAL_INSTITUTION", "OTHER"];
const capabilityOptions = ["CORPORATE_BUYER", "AFFILIATE", "RESELLER", "DEALER", "MARKETING_PARTNER", "SERVICE_PARTNER"];
const initial = { legalName: "", displayName: "", companyType: "LIMITED_COMPANY", email: "", phone: "", website: "", tradeLicenseNo: "", tin: "", bin: "", registrationNo: "", ownerUserId: "", country: "BD", currency: "BDT" };

export function OrganizationForm() {
  const router = useRouter(); const [form, setForm] = useState(initial); const [capabilities, setCapabilities] = useState<string[]>(["CORPORATE_BUYER"]); const [submitting, setSubmitting] = useState(false);
  const set = (key: keyof typeof initial, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSubmitting(true);
    try {
      const body = { ...form, displayName: form.displayName || null, website: form.website || null, tradeLicenseNo: form.tradeLicenseNo || null, tin: form.tin || null, bin: form.bin || null, registrationNo: form.registrationNo || null, ownerUserId: form.ownerUserId || null, capabilities };
      const response = await fetch("/api/admin/business-network/organizations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.error || "Organization could not be created.");
      toast.success("Organization created."); router.push(`/admin/business-network/organizations/${payload.organization.id}`); router.refresh();
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Organization could not be created."); } finally { setSubmitting(false); }
  };
  return <section className="mx-auto max-w-5xl space-y-5"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Organization Registry</p><h1 className="mt-1 text-2xl font-semibold">Create organization</h1><p className="mt-1 text-sm text-muted-foreground">Register the master identity first. Commercial accounts and partner profiles remain separate capabilities.</p></div><form onSubmit={submit} className="space-y-5"><Card><CardHeader><CardTitle className="text-base">Legal identity</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">{[
    ["legalName", "Legal name", true], ["displayName", "Display name", false], ["email", "Business email", false], ["phone", "Phone", false], ["website", "Website", false], ["ownerUserId", "Initial owner user ID", false], ["tradeLicenseNo", "Trade license no.", false], ["tin", "TIN", false], ["bin", "BIN", false], ["registrationNo", "Registration no.", false], ["country", "Country code", true], ["currency", "Currency", true],
  ].map(([key, label, required]) => <div key={String(key)} className="space-y-2"><Label htmlFor={String(key)}>{label}{required ? " *" : ""}</Label><Input id={String(key)} required={Boolean(required)} value={form[key as keyof typeof initial]} onChange={(event) => set(key as keyof typeof initial, event.target.value)} /></div>)}<div className="space-y-2 md:col-span-2"><Label>Company type *</Label><Select value={form.companyType} onValueChange={(value) => set("companyType", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{companyTypes.map((item) => <SelectItem key={item} value={item}>{item.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select></div></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Requested capabilities</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{capabilityOptions.map((item) => <label key={item} className="flex items-center gap-3 rounded-lg border p-3 text-sm"><Checkbox checked={capabilities.includes(item)} onCheckedChange={(checked) => setCapabilities((current) => checked ? [...current, item] : current.filter((value) => value !== item))} /><span>{item.replaceAll("_", " ")}</span></label>)}</CardContent></Card><div className="flex justify-end"><Button type="submit" disabled={submitting || capabilities.length === 0}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Create organization</Button></div></form></section>;
}

