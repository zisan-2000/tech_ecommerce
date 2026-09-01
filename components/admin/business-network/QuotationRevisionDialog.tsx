"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type JsonRecord = Record<string, unknown>;

type RevisionLine = {
  productId: number | null;
  variantId: number | null;
  productName: string;
  skuSnapshot: string;
  quantity: string;
  publicUnitPrice: string;
  unitPrice: string;
  discountAmount: string;
  vatAmount: string;
};

type RevisionDraft = {
  validUntil: string;
  currency: string;
  shippingTotal: string;
  paymentTerms: string;
  deliveryTerms: string;
  warrantyTerms: string;
  notes: string;
  lines: RevisionLine[];
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toLocalDateTimeInput(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function asMoneyInput(value: unknown, fallback = "0") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function asPositiveId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  return null;
}

function emptyLine(): RevisionLine {
  return {
    productId: null,
    variantId: null,
    productName: "",
    skuSnapshot: "",
    quantity: "1",
    publicUnitPrice: "",
    unitPrice: "",
    discountAmount: "0",
    vatAmount: "0",
  };
}

function currentVersion(record: JsonRecord) {
  const versions = Array.isArray(record.versions)
    ? record.versions.filter(isRecord)
    : [];
  return versions.find((version) => version.isCurrent === true) ?? versions[0] ?? null;
}

function draftFromRecord(record: JsonRecord): RevisionDraft {
  const version = currentVersion(record);
  const items = version && Array.isArray(version.items)
    ? version.items.filter(isRecord)
    : [];

  const lines = items.map<RevisionLine>((item) => ({
    productId: asPositiveId(item.productId),
    variantId: asPositiveId(item.variantId),
    productName: typeof item.productName === "string" ? item.productName : "",
    skuSnapshot: typeof item.skuSnapshot === "string" ? item.skuSnapshot : "",
    quantity: String(item.quantity ?? 1),
    publicUnitPrice: asMoneyInput(item.publicUnitPrice, ""),
    unitPrice: asMoneyInput(item.unitPrice, ""),
    discountAmount: asMoneyInput(item.discountAmount),
    vatAmount: asMoneyInput(item.vatAmount),
  }));

  return {
    validUntil: toLocalDateTimeInput(record.validUntil),
    currency: typeof version?.currency === "string" ? version.currency : "BDT",
    shippingTotal: asMoneyInput(version?.shippingTotal),
    paymentTerms: typeof version?.paymentTerms === "string" ? version.paymentTerms : "",
    deliveryTerms: typeof version?.deliveryTerms === "string" ? version.deliveryTerms : "",
    warrantyTerms: typeof version?.warrantyTerms === "string" ? version.warrantyTerms : "",
    notes: typeof version?.notes === "string" ? version.notes : "",
    lines: lines.length ? lines : [emptyLine()],
  };
}

export function QuotationRevisionDialog({
  endpoint,
  record,
  onComplete,
}: {
  endpoint: string;
  record: JsonRecord;
  onComplete: () => void | Promise<void>;
}) {
  const version = useMemo(() => currentVersion(record), [record]);
  const nextVersion = Number(version?.versionNumber ?? 0) + 1;
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState<RevisionDraft>(() => draftFromRecord(record));

  const resetDraft = () => setDraft(draftFromRecord(record));

  const setOpenState = (nextOpen: boolean) => {
    if (submitting) return;
    if (nextOpen) resetDraft();
    setOpen(nextOpen);
  };

  const updateLine = (index: number, key: keyof RevisionLine, value: string) => {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [key]: value } : line,
      ),
    }));
  };

  const submit = async () => {
    if (!draft.lines.length) {
      toast.error("At least one quotation line is required.");
      return;
    }
    const invalidLine = draft.lines.find(
      (line) => !line.productName.trim() || Number(line.quantity) < 1 || Number(line.unitPrice) <= 0,
    );
    if (invalidLine) {
      toast.error("Each line requires a product name, quantity, and positive unit price.");
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        validUntil: draft.validUntil || null,
        currency: draft.currency.trim().toUpperCase(),
        shippingTotal: draft.shippingTotal || "0",
        paymentTerms: draft.paymentTerms.trim() || null,
        deliveryTerms: draft.deliveryTerms.trim() || null,
        warrantyTerms: draft.warrantyTerms.trim() || null,
        notes: draft.notes.trim() || null,
        items: draft.lines.map((line) => ({
          productId: line.productId,
          variantId: line.variantId,
          productName: line.productName.trim(),
          skuSnapshot: line.skuSnapshot.trim() || null,
          quantity: Number(line.quantity),
          publicUnitPrice: line.publicUnitPrice || null,
          unitPrice: line.unitPrice,
          discountAmount: line.discountAmount || "0",
          vatAmount: line.vatAmount || "0",
        })),
      };

      const response = await fetch(`${endpoint}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `Revision creation failed with status ${response.status}.`);
      }

      toast.success(`Quotation version ${nextVersion} created as a new draft.`);
      setOpen(false);
      await onComplete();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Quotation revision could not be created.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpenState}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <RotateCcw className="mr-2 h-4 w-4" />
          Create revision
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Create quotation revision</DialogTitle>
          <DialogDescription>
            Create version {nextVersion} from the current commercial terms. The current version will remain in history as superseded, while the new version returns the quotation to draft for a fresh review and maker-checker approval.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="revision-valid-until">Valid until</Label>
              <Input
                id="revision-valid-until"
                type="datetime-local"
                value={draft.validUntil}
                onChange={(event) => setDraft((current) => ({ ...current, validUntil: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="revision-currency">Currency *</Label>
              <Input
                id="revision-currency"
                maxLength={3}
                value={draft.currency}
                onChange={(event) => setDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">Line items</p>
                <p className="text-xs text-muted-foreground">Current version values are prefilled and can be revised before saving.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDraft((current) => ({ ...current, lines: [...current.lines, emptyLine()] }))}
              >
                <Plus className="mr-2 h-4 w-4" />Add line
              </Button>
            </div>

            {draft.lines.map((line, index) => (
              <div key={index} className="grid gap-3 rounded-lg border bg-muted/20 p-4 md:grid-cols-2 xl:grid-cols-6">
                <div className="space-y-2 xl:col-span-2">
                  <Label>Product name *</Label>
                  <Input value={line.productName} onChange={(event) => updateLine(index, "productName", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>SKU</Label>
                  <Input value={line.skuSnapshot} onChange={(event) => updateLine(index, "skuSnapshot", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Quantity *</Label>
                  <Input type="number" min="1" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Unit price *</Label>
                  <Input type="number" min="0.01" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(index, "unitPrice", event.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    disabled={draft.lines.length === 1}
                    onClick={() => setDraft((current) => ({ ...current, lines: current.lines.filter((_, lineIndex) => lineIndex !== index) }))}
                    aria-label={`Remove revision line ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>Discount</Label>
                  <Input type="number" min="0" step="0.01" value={line.discountAmount} onChange={(event) => updateLine(index, "discountAmount", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>VAT</Label>
                  <Input type="number" min="0" step="0.01" value={line.vatAmount} onChange={(event) => updateLine(index, "vatAmount", event.target.value)} />
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="revision-shipping">Shipping total</Label>
              <Input
                id="revision-shipping"
                type="number"
                min="0"
                step="0.01"
                value={draft.shippingTotal}
                onChange={(event) => setDraft((current) => ({ ...current, shippingTotal: event.target.value }))}
              />
            </div>
            <div />
            <div className="space-y-2">
              <Label htmlFor="revision-payment">Payment terms</Label>
              <Textarea id="revision-payment" value={draft.paymentTerms} onChange={(event) => setDraft((current) => ({ ...current, paymentTerms: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="revision-delivery">Delivery terms</Label>
              <Textarea id="revision-delivery" value={draft.deliveryTerms} onChange={(event) => setDraft((current) => ({ ...current, deliveryTerms: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="revision-warranty">Warranty terms</Label>
              <Textarea id="revision-warranty" value={draft.warrantyTerms} onChange={(event) => setDraft((current) => ({ ...current, warrantyTerms: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="revision-notes">Internal notes</Label>
              <Textarea id="revision-notes" value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={submitting} onClick={() => void submit()}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
            Create version {nextVersion}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
