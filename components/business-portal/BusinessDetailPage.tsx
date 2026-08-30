"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, PageHeader, StatusBadge, Surface } from "./PortalPrimitives";

type DetailKey = "rfq" | "quotation" | "purchaseOrder" | "order" | "invoice" | "lead" | "settlement";
type DetailConfig = {
  endpoint: (id: string) => string;
  objectKey: string;
  titlePath: string;
  eyebrow: string;
  backHref: string;
  fields: Array<{ label: string; path: string; type?: "status" | "date" | "currency"; currencyPath?: string }>;
};

const CONFIG: Record<DetailKey, DetailConfig> = {
  rfq: { endpoint: (id) => `/api/business/rfqs/${id}`, objectKey: "rfq", titlePath: "subject", eyebrow: "Request for quotation", backHref: "/business/rfqs", fields: [{ label: "RFQ number", path: "rfqNumber" }, { label: "Status", path: "status", type: "status" }, { label: "Requested delivery", path: "requestedDelivery", type: "date" }, { label: "Quotation due", path: "quotationDueAt", type: "date" }, { label: "Submitted", path: "submittedAt", type: "date" }, { label: "Created", path: "createdAt", type: "date" }] },
  quotation: { endpoint: (id) => `/api/business/quotations/${id}`, objectKey: "quotation", titlePath: "quotationNumber", eyebrow: "Commercial quotation", backHref: "/business/quotations", fields: [{ label: "Quotation number", path: "quotationNumber" }, { label: "RFQ", path: "salesRfq.rfqNumber" }, { label: "Status", path: "status", type: "status" }, { label: "Grand total", path: "versions.0.grandTotal", type: "currency", currencyPath: "versions.0.currency" }, { label: "Valid until", path: "validUntil", type: "date" }, { label: "Sent", path: "sentAt", type: "date" }] },
  purchaseOrder: { endpoint: (id) => `/api/business/customer-pos/${id}`, objectKey: "customerPurchaseOrder", titlePath: "customerPoNumber", eyebrow: "Purchase order", backHref: "/business/purchase-orders", fields: [{ label: "Customer PO", path: "customerPoNumber" }, { label: "Quotation", path: "quotation.quotationNumber" }, { label: "Status", path: "status", type: "status" }, { label: "Total", path: "totalAmount", type: "currency", currencyPath: "currency" }, { label: "PO date", path: "poDate", type: "date" }, { label: "Expected delivery", path: "expectedDeliveryAt", type: "date" }] },
  order: { endpoint: (id) => `/api/business/orders/${id}`, objectKey: "order", titlePath: "id", eyebrow: "Corporate order", backHref: "/business/orders", fields: [{ label: "Order ID", path: "id" }, { label: "PO number", path: "customerPurchaseOrder.customerPoNumber" }, { label: "Status", path: "status", type: "status" }, { label: "Payment", path: "paymentStatus", type: "status" }, { label: "Grand total", path: "grand_total", type: "currency", currencyPath: "currency" }, { label: "Placed", path: "order_date", type: "date" }] },
  invoice: { endpoint: (id) => `/api/business/invoices/${id}`, objectKey: "invoice", titlePath: "invoiceNumber", eyebrow: "Invoice", backHref: "/business/invoices", fields: [{ label: "Invoice number", path: "invoiceNumber" }, { label: "Order ID", path: "id" }, { label: "Status", path: "invoiceStatus", type: "status" }, { label: "Grand total", path: "grand_total", type: "currency", currencyPath: "currency" }, { label: "Payment method", path: "payment_method" }, { label: "Issued", path: "order_date", type: "date" }] },
  lead: { endpoint: (id) => `/api/business/partner/leads/${id}`, objectKey: "lead", titlePath: "companyName", eyebrow: "Partner lead", backHref: "/business/partner/leads", fields: [{ label: "Lead number", path: "leadNumber" }, { label: "Status", path: "status", type: "status" }, { label: "Contact", path: "contactName" }, { label: "Email", path: "contactEmail" }, { label: "Phone", path: "contactPhone" }, { label: "Estimated value", path: "estimatedValue", type: "currency", currencyPath: "currency" }, { label: "Registered", path: "createdAt", type: "date" }] },
  settlement: { endpoint: (id) => `/api/business/partner/settlements/${id}`, objectKey: "settlement", titlePath: "settlementNumber", eyebrow: "Partner settlement", backHref: "/business/partner/settlements", fields: [{ label: "Settlement", path: "settlementNumber" }, { label: "Status", path: "status", type: "status" }, { label: "Period start", path: "periodStart", type: "date" }, { label: "Period end", path: "periodEnd", type: "date" }, { label: "Gross commission", path: "grossCommission", type: "currency", currencyPath: "currency" }, { label: "Adjustments", path: "adjustments", type: "currency", currencyPath: "currency" }, { label: "Net payable", path: "netPayable", type: "currency", currencyPath: "currency" }, { label: "Paid", path: "paidAt", type: "date" }] },
};

function getPath(item: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (Array.isArray(value) && /^\d+$/.test(key)) return value[Number(key)];
    if (value && typeof value === "object") return (value as Record<string, unknown>)[key];
    return undefined;
  }, item);
}

function DetailValue({ item, field }: { item: Record<string, unknown>; field: DetailConfig["fields"][number] }) {
  const value = getPath(item, field.path);
  if (field.type === "status") return <StatusBadge status={value} />;
  if (field.type === "date") return <>{formatDate(value, true)}</>;
  if (field.type === "currency") return <span className="font-semibold tabular-nums">{formatCurrency(value, String(field.currencyPath ? getPath(item, field.currencyPath) ?? "BDT" : "BDT"))}</span>;
  return <>{value === null || value === undefined || value === "" ? "—" : String(value)}</>;
}

export default function BusinessDetailPage({ resource, id }: { resource: DetailKey; id: string }) {
  const config = CONFIG[resource];
  const [item, setItem] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(config.endpoint(id), { cache: "no-store", signal });
      const data = await response.json() as Record<string, unknown> & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load this record.");
      setItem(data[config.objectKey] as Record<string, unknown>);
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") setError(caught instanceof Error ? caught.message : "Could not load this record.");
    } finally { if (!signal.aborted) setLoading(false); }
  }, [config, id]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load, reload]);

  const status = String(item?.status ?? "");
  const actions = useMemo(() => {
    if (resource === "rfq" && status === "DRAFT") return [{ label: "Submit RFQ", action: "submit", positive: true }, { label: "Cancel RFQ", action: "cancel" }];
    if (resource === "quotation" && ["SENT", "VIEWED"].includes(status)) return [{ label: "Accept quotation", action: "accept", positive: true }, { label: "Reject quotation", action: "reject" }];
    if (resource === "purchaseOrder" && ["SUBMITTED", "UNDER_REVIEW"].includes(status)) return [{ label: "Cancel PO", action: "cancel" }];
    return [];
  }, [resource, status]);

  async function mutate(action: string) {
    const destructive = action === "cancel" || action === "reject";
    if (!window.confirm(`${action[0].toUpperCase()}${action.slice(1)} this record?`)) return;
    setWorking(true);
    try {
      const base = config.endpoint(id);
      const response = await fetch(`${base}/${action}`, {
        method: "POST",
        headers: destructive && resource === "quotation" ? { "Content-Type": "application/json" } : undefined,
        body: destructive && resource === "quotation" ? JSON.stringify({ reason: "Rejected by customer from business portal." }) : undefined,
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "The action could not be completed.");
      toast.success("Record updated successfully.");
      setReload((value) => value + 1);
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "The action could not be completed."); }
    finally { setWorking(false); }
  }

  const title = item ? String(getPath(item, config.titlePath) ?? "Record details") : "Record details";
  return (
    <>
      <PageHeader eyebrow={config.eyebrow} title={title} backHref={config.backHref} />
      {loading && <Surface className="p-6"><div className="h-64 animate-pulse rounded-xl bg-muted" /></Surface>}
      {!loading && error && <Surface className="p-10 text-center"><p className="font-medium text-destructive">{error}</p><Button variant="outline" className="mt-4" onClick={() => setReload((value) => value + 1)}><RefreshCw className="size-4" />Retry</Button></Surface>}
      {!loading && !error && item && (
        <div className="space-y-5">
          <Surface className="p-5 sm:p-6">
            <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
              {config.fields.map((field) => <div key={field.label}><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{field.label}</p><div className="mt-1.5 text-sm"><DetailValue item={item} field={field} /></div></div>)}
            </div>
            {actions.length > 0 && <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-5">{actions.map((action) => <Button key={action.action} variant={action.positive ? "default" : "outline"} disabled={working} onClick={() => void mutate(action.action)}>{action.positive ? <Check className="size-4" /> : <X className="size-4" />}{action.label}</Button>)}</div>}
          </Surface>
          {Array.isArray(item.items) && item.items.length > 0 && (
            <Surface>
              <div className="border-b border-border px-5 py-4"><h2 className="font-semibold">Line items</h2></div>
              <div className="divide-y divide-border">{(item.items as Array<Record<string, unknown>>).map((line, index) => <div key={String(line.id ?? index)} className="grid gap-2 px-5 py-4 text-sm sm:grid-cols-[1fr_auto_auto]"><span className="font-medium">{String(line.productName ?? line.product?.toString() ?? `Item ${index + 1}`)}</span><span className="text-muted-foreground">Qty {String(line.quantity ?? "—")}</span><span className="font-semibold">{formatCurrency(line.lineTotal ?? line.price, String(line.currency ?? "BDT"))}</span></div>)}</div>
            </Surface>
          )}
          {typeof item.notes === "string" && item.notes && <Surface className="p-5"><h2 className="font-semibold">Notes</h2><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.notes}</p></Surface>}
        </div>
      )}
    </>
  );
}

export type { DetailKey };
