"use client";

import { useState } from "react";
import { Plus, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import BusinessResourcePage from "./BusinessResourcePage";
import { PageHeader, Surface } from "./PortalPrimitives";

export default function PayoutAccountManager() {
  const [open, setOpen] = useState(false); const [type, setType] = useState("BANK"); const [busy, setBusy] = useState(false); const [version, setVersion] = useState(0);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/business/partner/payout-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, accountName: form.get("accountName"), accountNumber: form.get("accountNumber"), bankName: type === "BANK" ? form.get("bankName") || null : null, branchName: type === "BANK" ? form.get("branchName") || null : null, routingNumber: type === "BANK" ? form.get("routingNumber") || null : null, providerName: type === "MOBILE_WALLET" ? form.get("providerName") || null : null, isDefault: form.get("isDefault") === "on" }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not add the payout account.");
      toast.success("Payout account submitted for verification."); setOpen(false); setVersion((value) => value + 1);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not add the payout account."); } finally { setBusy(false); }
  }
  return <><PageHeader eyebrow="Partnership" title="Payout accounts" description="Settlement destinations are encrypted at rest and require administrative verification." />{open ? <Surface className="mb-6 p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold">Add payout destination</h2><p className="text-sm text-muted-foreground">Account details are never returned by the API after submission.</p></div><Button variant="outline" size="icon" onClick={() => setOpen(false)} aria-label="Close form"><X className="size-4" /></Button></div><form onSubmit={submit} className="grid gap-5 sm:grid-cols-2"><Field label="Account type"><select value={type} onChange={(event) => setType(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="BANK">Bank account</option><option value="MOBILE_WALLET">Mobile wallet</option></select></Field><Field label="Account holder name"><Input name="accountName" required minLength={2} maxLength={160} autoComplete="name" /></Field>{type === "BANK" ? <><Field label="Bank name"><Input name="bankName" required maxLength={160} /></Field><Field label="Branch"><Input name="branchName" maxLength={160} /></Field><Field label="Routing number"><Input name="routingNumber" maxLength={64} /></Field></> : <Field label="Wallet provider"><Input name="providerName" required maxLength={100} placeholder="bKash, Nagad…" /></Field>}<Field label="Account number"><Input name="accountNumber" required minLength={6} maxLength={34} inputMode="numeric" autoComplete="off" /></Field><label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="isDefault" className="size-4 rounded border-input" />Use as default payout destination</label><div className="sm:col-span-2"><Button type="submit" disabled={busy}><ShieldCheck className="size-4" />{busy ? "Submitting securely…" : "Submit for verification"}</Button></div></form></Surface> : <Button className="mb-6" onClick={() => setOpen(true)}><Plus className="size-4" />Add payout account</Button>}<div key={version}><BusinessResourcePage resource="payoutAccounts" compact /></div></>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }

