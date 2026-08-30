"use client";

import { useState } from "react";
import { Copy, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import BusinessResourcePage from "./BusinessResourcePage";
import { PageHeader, Surface } from "./PortalPrimitives";

export default function PartnerAssetManager() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/business/partner/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.get("type"),
          code: form.get("code") || undefined,
          campaignName: form.get("campaignName") || null,
          destinationPath: form.get("destinationPath") || "/",
        }),
      });
      const data = await response.json() as { error?: string; asset?: { code: string } };
      if (!response.ok) throw new Error(data.error || "Could not create the referral asset.");
      toast.success(`Referral code ${data.asset?.code} created.`);
      setOpen(false);
      setVersion((value) => value + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the referral asset.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Partnership" title="Referral links & codes" description="Create controlled campaign links with first-party attribution." />
      {open ? (
        <Surface className="mb-6 p-5 sm:p-6" id="create-referral">
          <div className="mb-5 flex items-center justify-between">
            <div><h2 className="font-semibold">New referral asset</h2><p className="text-sm text-muted-foreground">Codes are public identifiers; never include private information.</p></div>
            <Button variant="outline" size="icon" onClick={() => setOpen(false)} aria-label="Close form"><X className="size-4" /></Button>
          </div>
          <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
            <Field label="Asset type">
              <select name="type" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="REFERRAL_LINK">Referral link</option>
                <option value="REFERRAL_CODE">Referral code</option>
                <option value="PROMO_CODE">Promo code</option>
              </select>
            </Field>
            <Field label="Custom code"><Input name="code" minLength={4} maxLength={64} placeholder="Auto-generate if blank" /></Field>
            <Field label="Campaign name"><Input name="campaignName" maxLength={160} /></Field>
            <Field label="Destination path"><Input name="destinationPath" defaultValue="/" required /></Field>
            <div className="sm:col-span-2"><Button type="submit" disabled={busy}><Plus className="size-4" />{busy ? "Creating…" : "Create asset"}</Button></div>
          </form>
        </Surface>
      ) : (
        <Button className="mb-6" onClick={() => setOpen(true)}><Copy className="size-4" />Create referral link</Button>
      )}
      <div key={version}><BusinessResourcePage resource="partnerAssets" compact /></div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
