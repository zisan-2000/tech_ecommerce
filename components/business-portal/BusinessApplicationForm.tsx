"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { Building2, CheckCircle2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const capabilityOptions = [
  ["CORPORATE_BUYER", "Corporate purchasing"], ["AFFILIATE", "Affiliate"], ["RESELLER", "Reseller"],
  ["DEALER", "Dealer"], ["MARKETING_PARTNER", "Marketing partner"], ["SERVICE_PARTNER", "Service partner"],
] as const;

export default function BusinessApplicationForm() {
  const { status } = useSession(); const router = useRouter(); const searchParams = useSearchParams(); const requested = searchParams.get("capability");
  const [selected, setSelected] = useState<string[]>(requested && capabilityOptions.some(([value]) => value === requested) ? [requested] : ["CORPORATE_BUYER"]);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (status !== "authenticated") return; setBusy(true); const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/business/applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ legalName: form.get("legalName"), displayName: form.get("displayName") || null, companyType: form.get("companyType"), email: form.get("email"), phone: form.get("phone"), website: form.get("website") || null, tradeLicenseNo: form.get("tradeLicenseNo") || null, tin: form.get("tin") || null, bin: form.get("bin") || null, capabilities: selected }) });
      const data = await response.json() as { error?: string; application?: { code: string } };
      if (!response.ok) throw new Error(data.error || "Could not submit the application.");
      router.push(`/business/apply/success?reference=${encodeURIComponent(data.application?.code || "")}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not submit the application."); } finally { setBusy(false); }
  }
  return <div className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950 sm:py-16"><div className="mx-auto max-w-4xl"><div className="mb-8 text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-600 text-white"><Building2 className="size-7" /></span><h1 className="mt-5 text-3xl font-bold tracking-tight">Apply for a business account</h1><p className="mx-auto mt-3 max-w-2xl text-muted-foreground">One verified organization can request corporate purchasing and partner capabilities from the same secure portal.</p></div>{status === "unauthenticated" ? <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm"><h2 className="text-lg font-semibold">Sign in to continue</h2><p className="mt-2 text-sm text-muted-foreground">An authenticated owner is required for every organization application.</p><Button asChild className="mt-5"><Link href="/signin?returnUrl=/business/apply">Sign in</Link></Button></div> : <form onSubmit={submit} className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8"><div className="grid gap-5 sm:grid-cols-2"><Field label="Legal company name"><Input name="legalName" required minLength={2} maxLength={240} /></Field><Field label="Display name"><Input name="displayName" minLength={2} maxLength={160} /></Field><Field label="Company type"><select name="companyType" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="LIMITED_COMPANY">Limited company</option><option value="PROPRIETORSHIP">Proprietorship</option><option value="PARTNERSHIP">Partnership</option><option value="PUBLIC_LIMITED">Public limited</option><option value="NGO">NGO</option><option value="GOVERNMENT">Government</option><option value="EDUCATIONAL_INSTITUTION">Educational institution</option><option value="OTHER">Other</option></select></Field><Field label="Business email"><Input name="email" type="email" required /></Field><Field label="Phone"><Input name="phone" type="tel" required /></Field><Field label="Website"><Input name="website" type="url" placeholder="https://" /></Field><Field label="Trade license number"><Input name="tradeLicenseNo" /></Field><Field label="TIN"><Input name="tin" /></Field><Field label="BIN"><Input name="bin" /></Field><div className="sm:col-span-2"><Label>Requested capabilities</Label><div className="mt-2 grid gap-3 sm:grid-cols-2">{capabilityOptions.map(([value, label]) => { const checked = selected.includes(value); return <label key={value} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm ${checked ? "border-blue-500 bg-blue-50 dark:bg-blue-950" : "border-border"}`}><input type="checkbox" checked={checked} onChange={() => setSelected((items) => checked ? items.filter((item) => item !== value) : [...items, value])} className="size-4" /><span className="font-medium">{label}</span>{checked && <CheckCircle2 className="ml-auto size-4 text-blue-600" />}</label>; })}</div></div><div className="sm:col-span-2"><Button type="submit" size="lg" disabled={busy || status !== "authenticated" || selected.length === 0} className="w-full sm:w-auto"><Send className="size-4" />{busy ? "Submitting…" : "Submit application"}</Button></div></div></form>}</div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }

