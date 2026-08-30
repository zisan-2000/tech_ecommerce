"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Surface } from "./PortalPrimitives";

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return <div className="space-y-2"><Label>{label}{required && <span className="ml-1 text-destructive">*</span>}</Label>{children}{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>;
}

async function submitJson(endpoint: string, body: unknown) {
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json() as { error?: string; issues?: Array<{ path?: string; message?: string }> } & Record<string, unknown>;
  if (!response.ok) {
    const issue = data.issues?.map((item) => `${item.path}: ${item.message}`).join("; ");
    throw new Error(issue || data.error || "The request could not be completed.");
  }
  return data;
}

export function RfqCreateForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState([{ productName: "", quantity: 1, targetUnitPrice: "" }]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const data = await submitJson("/api/business/rfqs", {
        subject: form.get("subject"),
        requestedDelivery: form.get("requestedDelivery") || null,
        quotationDueAt: form.get("quotationDueAt") || null,
        notes: form.get("notes") || null,
        items: items.map((item) => ({ productName: item.productName, quantity: Number(item.quantity), targetUnitPrice: item.targetUnitPrice || null })),
      });
      const rfq = data.rfq as { id: string };
      toast.success("RFQ draft created."); router.push(`/business/rfqs/${rfq.id}`); router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create RFQ."); }
    finally { setBusy(false); }
  }
  return (
    <>
      <PageHeader eyebrow="Purchasing" title="Create RFQ" description="Describe the products, quantities and commercial timeline you need." backHref="/business/rfqs" />
      <form onSubmit={submit} className="space-y-5">
        <Surface className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <div className="sm:col-span-2"><Field label="Subject" required><Input name="subject" required minLength={3} maxLength={240} placeholder="Office workstation procurement – Q4" /></Field></div>
          <Field label="Requested delivery"><Input name="requestedDelivery" type="date" /></Field>
          <Field label="Quotation due"><Input name="quotationDueAt" type="datetime-local" /></Field>
          <div className="sm:col-span-2"><Field label="Notes"><Textarea name="notes" rows={4} maxLength={4000} placeholder="Commercial requirements, delivery locations or warranty expectations…" /></Field></div>
        </Surface>
        <Surface>
          <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="font-semibold">Requested items</h2><p className="text-xs text-muted-foreground">Up to 100 line items per RFQ.</p></div><Button type="button" variant="outline" size="sm" onClick={() => setItems((value) => [...value, { productName: "", quantity: 1, targetUnitPrice: "" }])}><Plus className="size-4" />Add item</Button></div>
          <div className="divide-y divide-border">{items.map((item, index) => <div key={index} className="grid gap-4 p-5 md:grid-cols-[1fr_140px_180px_auto]"><Field label="Product or specification" required><Input value={item.productName} required minLength={2} maxLength={240} onChange={(event) => setItems((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, productName: event.target.value } : row))} /></Field><Field label="Quantity" required><Input type="number" min={1} max={1000000} value={item.quantity} onChange={(event) => setItems((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: Number(event.target.value) } : row))} /></Field><Field label="Target unit price"><Input inputMode="decimal" value={item.targetUnitPrice} onChange={(event) => setItems((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, targetUnitPrice: event.target.value } : row))} /></Field><Button type="button" variant="outline" size="icon" className="mt-6" disabled={items.length === 1} onClick={() => setItems((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} aria-label={`Remove item ${index + 1}`}><Trash2 className="size-4" /></Button></div>)}</div>
        </Surface>
        <div className="flex justify-end"><Button type="submit" disabled={busy}><Send className="size-4" />{busy ? "Creating…" : "Create draft RFQ"}</Button></div>
      </form>
    </>
  );
}

export function PurchaseOrderCreateForm() {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget);
    try {
      const data = await submitJson("/api/business/customer-pos", {
        customerPoNumber: form.get("customerPoNumber"), fileUrl: form.get("fileUrl"), quotationId: form.get("quotationId") || null,
        poDate: form.get("poDate") || null, expectedDeliveryAt: form.get("expectedDeliveryAt") || null,
        totalAmount: form.get("totalAmount") || null, currency: form.get("currency") || "BDT",
      });
      const po = data.customerPurchaseOrder as { id: string }; toast.success("Purchase order submitted."); router.push(`/business/purchase-orders/${po.id}`); router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not submit PO."); } finally { setBusy(false); }
  }
  return <><PageHeader eyebrow="Purchasing" title="Submit purchase order" description="Upload or reference the signed customer PO for verification." backHref="/business/purchase-orders" /><Surface className="p-5 sm:p-6"><form onSubmit={submit} className="grid gap-5 sm:grid-cols-2"><Field label="Customer PO number" required><Input name="customerPoNumber" required maxLength={120} /></Field><Field label="Accepted quotation ID"><Input name="quotationId" maxLength={64} /></Field><div className="sm:col-span-2"><Field label="PO document URL" required hint="Use a secure HTTPS URL or an internal /upload/ path."><Input name="fileUrl" required placeholder="/upload/business/purchase-order.pdf" /></Field></div><Field label="PO date"><Input name="poDate" type="date" /></Field><Field label="Expected delivery"><Input name="expectedDeliveryAt" type="date" /></Field><Field label="Total amount"><Input name="totalAmount" inputMode="decimal" /></Field><Field label="Currency"><Input name="currency" defaultValue="BDT" maxLength={3} /></Field><div className="flex justify-end sm:col-span-2"><Button type="submit" disabled={busy}><Send className="size-4" />{busy ? "Submitting…" : "Submit PO"}</Button></div></form></Surface></>;
}

export function PartnerLeadCreateForm() {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget);
    try {
      const data = await submitJson("/api/business/partner/leads", { companyName: form.get("companyName"), contactName: form.get("contactName"), contactEmail: form.get("contactEmail") || null, contactPhone: form.get("contactPhone") || null, requirement: form.get("requirement") || null, estimatedValue: form.get("estimatedValue") || null, currency: form.get("currency") || "BDT" });
      const lead = data.lead as { id: string }; toast.success("Lead registered."); router.push(`/business/partner/leads/${lead.id}`); router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not register lead."); } finally { setBusy(false); }
  }
  return <><PageHeader eyebrow="Partnership" title="Register partner lead" description="Provide enough information for the sales team to verify and protect the opportunity." backHref="/business/partner/leads" /><Surface className="p-5 sm:p-6"><form onSubmit={submit} className="grid gap-5 sm:grid-cols-2"><Field label="Company name" required><Input name="companyName" required minLength={2} maxLength={200} /></Field><Field label="Contact name" required><Input name="contactName" required minLength={2} maxLength={160} /></Field><Field label="Contact email"><Input name="contactEmail" type="email" /></Field><Field label="Contact phone" hint="Use E.164 format, for example +8801712345678."><Input name="contactPhone" type="tel" placeholder="+880…" /></Field><div className="sm:col-span-2"><Field label="Requirement" required><Textarea name="requirement" required minLength={3} rows={5} maxLength={5000} /></Field></div><Field label="Estimated value"><Input name="estimatedValue" inputMode="decimal" /></Field><Field label="Currency"><Input name="currency" defaultValue="BDT" maxLength={3} /></Field><div className="flex justify-end sm:col-span-2"><Button type="submit" disabled={busy}><Send className="size-4" />{busy ? "Registering…" : "Register lead"}</Button></div></form></Surface></>;
}

const roles = ["OWNER", "ADMIN", "BUYER", "APPROVER", "FINANCE", "PARTNER_MANAGER", "PARTNER_MARKETER", "PARTNER_FINANCE", "VIEWER"];
export function MemberInviteForm() {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget); try { await submitJson("/api/business/organization/invitations", { email: form.get("email"), role: form.get("role") }); toast.success("Invitation created and delivery queued."); router.push("/business/organization/members"); router.refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create invitation."); } finally { setBusy(false); } }
  return <><PageHeader eyebrow="Organization" title="Invite member" description="Assign the narrowest role needed. Capability rules still apply to every permission." backHref="/business/organization/members" /><Surface className="max-w-2xl p-5 sm:p-6"><form onSubmit={submit} className="space-y-5"><Field label="Work email" required><Input name="email" type="email" required maxLength={254} /></Field><Field label="Portal role" required><select name="role" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" defaultValue="VIEWER">{roles.map((role) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}</select></Field><Button type="submit" disabled={busy}><Send className="size-4" />{busy ? "Sending…" : "Send invitation"}</Button></form></Surface></>;
}

