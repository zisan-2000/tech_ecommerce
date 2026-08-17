"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ScmDocumentLifecycle } from "@/components/admin/scm/ScmDocumentLifecycle";
import { ScmNextStepPanel } from "@/components/admin/scm/ScmNextStepPanel";
import { ScmStatCard } from "@/components/admin/scm/ScmStatCard";
import { ScmStatusChip } from "@/components/admin/scm/ScmStatusChip";

type Warehouse = { id: number; name: string; code: string };
type Supplier = { id: number; name: string; code: string; currency?: string | null };
type PurchaseOrder = {
  id: number;
  poNumber: string;
  supplierId: number;
  purchaseRequisition?: {
    id: number;
    requisitionNumber: string;
    status: string;
  } | null;
  sourceComparativeStatement?: {
    id: number;
    csNumber: string;
    status: string;
    rfq?: {
      id: number;
      rfqNumber: string;
      status: string;
      purchaseRequisition?: {
        id: number;
        requisitionNumber: string;
        status: string;
      } | null;
    } | null;
  } | null;
};
type GoodsReceipt = {
  id: number;
  receiptNumber: string;
  status: string;
  purchaseOrderId?: number | null;
};
type SupplierInvoice = {
  id: number;
  invoiceNumber: string;
  total: number | string;
  status: string;
  purchaseOrder?: PurchaseOrder | null;
};
type ComparativeStatement = {
  id: number;
  csNumber: string;
  status: string;
  rfq?: {
    id: number;
    rfqNumber: string;
    status: string;
    purchaseRequisition?: {
      id: number;
      requisitionNumber: string;
      status: string;
    } | null;
  } | null;
};

type PaymentRequest = {
  id: number;
  prfNumber: string;
  status: string;
  approvalStage: string;
  amount: string | number;
  currency: string;
  requestedAt: string;
  submittedAt?: string | null;
  managerApprovedAt?: string | null;
  financeApprovedAt?: string | null;
  treasuryProcessedAt?: string | null;
  paidAt?: string | null;
  referenceNumber?: string | null;
  note?: string | null;
  supplier: Supplier;
  warehouse?: Warehouse | null;
  purchaseOrder?: PurchaseOrder | null;
  goodsReceipt?: GoodsReceipt | null;
  supplierInvoice?: SupplierInvoice | null;
  comparativeStatement?: ComparativeStatement | null;
  supplierPayment?: {
    id: number;
    paymentNumber: string;
    paymentDate: string;
    amount: string | number;
  } | null;
  createdBy?: { id: string; name: string | null; email: string | null } | null;
  managerApprovedBy?: { id: string; name: string | null; email: string | null } | null;
  financeApprovedBy?: { id: string; name: string | null; email: string | null } | null;
  treasuryProcessedBy?: { id: string; name: string | null; email: string | null } | null;
  approvalEvents?: Array<{
    id: number;
    stage: string;
    decision: string;
    note?: string | null;
    actedAt: string;
    actedBy?: { id: string; name: string | null; email: string | null } | null;
  }>;
  notifications?: Array<{
    id: number;
    stage: string;
    channel: string;
    status: string;
    recipientEmail?: string | null;
    message: string;
    sentAt?: string | null;
    createdAt: string;
    recipientUser?: { id: string; name: string | null; email: string | null } | null;
  }>;
};

async function readJson<T>(res: Response, errorMessage: string) {
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error((payload as { error?: string })?.error || errorMessage);
  }
  return (await res.json()) as T;
}

function fmtDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

function toStageLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function PaymentRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const requestId = Number(params?.id);
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];
  const canApproveAdmin = permissions.includes("payment_requests.approve_admin");
  const canApproveFinance = permissions.includes("payment_requests.approve_finance");
  const canTreasury = permissions.includes("payment_requests.treasury");
  const canManage = permissions.includes("payment_requests.manage");

  const [requestRow, setRequestRow] = useState<PaymentRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [paymentForm, setPaymentForm] = useState({
    paymentDate: "",
    amount: "",
    method: "BANK_TRANSFER",
    reference: "",
    note: "",
    holdOverride: false,
    holdOverrideNote: "",
  });

  const loadRequest = async () => {
    if (!Number.isInteger(requestId) || requestId <= 0) {
      toast.error("Invalid payment request id");
      router.replace("/admin/scm/payment-requests");
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`/api/scm/payment-requests/${requestId}`, { cache: "no-store" });
      const data = await readJson<PaymentRequest>(res, "Failed to load payment request");
      setRequestRow(data);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load payment request");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequest();
  }, [requestId]);

  const actionButtons = useMemo(() => {
    if (!requestRow) return [];
    const buttons: Array<{ action: string; label: string }> = [];
    if (canManage && requestRow.status === "DRAFT") {
      buttons.push({ action: "submit", label: "Submit" });
    }
    if (canApproveAdmin && requestRow.status === "SUBMITTED") {
      buttons.push({ action: "manager_approve", label: "Manager Approve" });
    }
    if (canApproveFinance && requestRow.status === "MANAGER_APPROVED") {
      buttons.push({ action: "finance_approve", label: "Finance Approve" });
    }
    if (canTreasury && requestRow.status === "FINANCE_APPROVED") {
      buttons.push({ action: "treasury_start", label: "Treasury Start" });
    }
    if (canTreasury && ["FINANCE_APPROVED", "TREASURY_PROCESSING"].includes(requestRow.status)) {
      buttons.push({ action: "mark_paid", label: "Mark Paid" });
    }
    if (canManage && ["DRAFT", "SUBMITTED"].includes(requestRow.status)) {
      buttons.push({ action: "cancel", label: "Cancel" });
    }
    if ((canApproveAdmin || canApproveFinance || canTreasury) && !["PAID", "CANCELLED"].includes(requestRow.status)) {
      buttons.push({ action: "reject", label: "Reject" });
    }
    return buttons;
  }, [requestRow, canManage, canApproveAdmin, canApproveFinance, canTreasury]);

  const lifecycleStages = useMemo(() => {
    if (!requestRow) return [];
    const resolvedPurchaseOrder = requestRow.purchaseOrder ?? requestRow.supplierInvoice?.purchaseOrder ?? null;
    const resolvedComparativeStatement =
      requestRow.comparativeStatement ?? resolvedPurchaseOrder?.sourceComparativeStatement ?? null;
    const resolvedRfq = resolvedComparativeStatement?.rfq ?? null;
    const resolvedRequisition =
      resolvedPurchaseOrder?.purchaseRequisition ??
      resolvedRfq?.purchaseRequisition ??
      null;

    return [
      {
        key: "requisition",
        label: "Requisition",
        value: resolvedRequisition?.requisitionNumber || "Not linked",
        helperText: resolvedRequisition ? toStageLabel(resolvedRequisition.status) : "No requisition in chain",
        href: resolvedRequisition ? `/admin/scm/purchase-requisitions/${resolvedRequisition.id}` : null,
        state: resolvedRequisition ? ("linked" as const) : ("pending" as const),
      },
      {
        key: "rfq",
        label: "RFQ",
        value: resolvedRfq?.rfqNumber || "Not linked",
        helperText: resolvedRfq ? toStageLabel(resolvedRfq.status) : "No RFQ in chain",
        href: resolvedRfq ? `/admin/scm/rfqs/${resolvedRfq.id}` : null,
        state: resolvedRfq ? ("linked" as const) : ("pending" as const),
      },
      {
        key: "cs",
        label: "Comparative",
        value: resolvedComparativeStatement?.csNumber || "Not linked",
        helperText: resolvedComparativeStatement
          ? toStageLabel(resolvedComparativeStatement.status)
          : "No comparative statement",
        href: null,
        state: resolvedComparativeStatement ? ("linked" as const) : ("pending" as const),
      },
      {
        key: "po",
        label: "Purchase Order",
        value: resolvedPurchaseOrder?.poNumber || "Not linked",
        helperText: resolvedPurchaseOrder ? "Commercial commitment available" : "No purchase order",
        href: resolvedPurchaseOrder ? `/admin/scm/purchase-orders/${resolvedPurchaseOrder.id}` : null,
        state: resolvedPurchaseOrder ? ("linked" as const) : ("pending" as const),
      },
      {
        key: "grn",
        label: "Goods Receipt",
        value: requestRow.goodsReceipt?.receiptNumber || "Not linked",
        helperText: requestRow.goodsReceipt ? toStageLabel(requestRow.goodsReceipt.status) : "No GRN attached",
        href: null,
        state: requestRow.goodsReceipt ? ("linked" as const) : ("pending" as const),
      },
      {
        key: "invoice",
        label: "Invoice",
        value: requestRow.supplierInvoice?.invoiceNumber || "Not linked",
        helperText: requestRow.supplierInvoice
          ? toStageLabel(requestRow.supplierInvoice.status)
          : "No supplier invoice attached",
        href: null,
        state: requestRow.supplierInvoice ? ("linked" as const) : ("pending" as const),
      },
      {
        key: "prf",
        label: "Payment Request",
        value: requestRow.prfNumber,
        helperText: toStageLabel(requestRow.status),
        href: `/admin/scm/payment-requests/${requestRow.id}`,
        state: "current" as const,
      },
      {
        key: "payment",
        label: "Payment",
        value: requestRow.supplierPayment?.paymentNumber || "Not settled",
        helperText: requestRow.supplierPayment ? "Supplier payment posted" : "Awaiting treasury settlement",
        href: null,
        state: requestRow.supplierPayment ? ("linked" as const) : ("pending" as const),
      },
    ];
  }, [requestRow]);

  const runAction = async (action: string) => {
    if (!requestRow) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/scm/payment-requests/${requestRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          note: note || undefined,
          paymentDate: paymentForm.paymentDate || undefined,
          amount: paymentForm.amount || undefined,
          method: paymentForm.method,
          reference: paymentForm.reference,
          holdOverride: paymentForm.holdOverride,
          holdOverrideNote: paymentForm.holdOverrideNote,
        }),
      });
      await readJson<PaymentRequest>(res, "Failed to update payment request");
      toast.success(`Payment request ${toStageLabel(action)} completed`);
      setNote("");
      await loadRequest();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update payment request");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <p className="text-sm text-muted-foreground">Loading payment request workspace...</p>
      </div>
    );
  }

  if (!requestRow) {
    return (
      <div className="space-y-6 p-6">
        <Button asChild variant="outline">
          <Link href="/admin/scm/payment-requests">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back To Register
          </Link>
        </Button>
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            Payment request not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/scm/payment-requests">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <ScmStatusChip status={requestRow.status} />
            <Badge variant="secondary">{toStageLabel(requestRow.approvalStage)}</Badge>
            {requestRow.supplierPayment ? <Badge variant="secondary">Payment Posted</Badge> : null}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{requestRow.prfNumber}</h1>
            <p className="text-sm text-muted-foreground">
              {requestRow.supplier.name} • {requestRow.warehouse?.name || "No warehouse scope"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadRequest()} disabled={loading || saving}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          {actionButtons.map((button) => (
            <Button
              key={button.action}
              variant={button.action === "reject" || button.action === "cancel" ? "outline" : "default"}
              onClick={() => void runAction(button.action)}
              disabled={saving}
            >
              {button.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ScmStatCard
          label="Supplier"
          value={requestRow.supplier.name}
          hint={requestRow.supplier.code}
        />
        <ScmStatCard
          label="Amount"
          value={`${Number(requestRow.amount).toFixed(2)} ${requestRow.currency}`}
          hint={`Requested ${new Date(requestRow.requestedAt).toLocaleDateString()}`}
        />
        <ScmStatCard
          label="Reference"
          value={requestRow.referenceNumber || "-"}
          hint={requestRow.supplierInvoice?.invoiceNumber || "No invoice linked"}
        />
        <ScmStatCard
          label="Settlement"
          value={requestRow.supplierPayment?.paymentNumber || "Pending"}
          hint={requestRow.paidAt ? `Paid ${fmtDate(requestRow.paidAt)}` : "Not paid yet"}
        />
      </div>

      <ScmDocumentLifecycle stages={lifecycleStages} />

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {[
                  { label: "Drafted", value: fmtDate(requestRow.requestedAt) },
                  { label: "Submitted", value: fmtDate(requestRow.submittedAt) },
                  { label: "Manager Approved", value: fmtDate(requestRow.managerApprovedAt) },
                  { label: "Finance Approved", value: fmtDate(requestRow.financeApprovedAt) },
                  { label: "Paid", value: fmtDate(requestRow.paidAt) },
                ].map((step) => (
                  <div key={step.label} className="rounded-lg border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {step.label}
                    </div>
                    <div className="mt-2 text-sm font-medium">{step.value}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="linked">Linked Docs</TabsTrigger>
              <TabsTrigger value="workflow">Workflow</TabsTrigger>
              <TabsTrigger value="payment">Treasury</TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Commercial Summary</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Supplier</div>
                    <p className="mt-2 text-sm">
                      {requestRow.supplier.name} ({requestRow.supplier.code})
                    </p>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Warehouse</div>
                    <p className="mt-2 text-sm">
                      {requestRow.warehouse ? `${requestRow.warehouse.name} (${requestRow.warehouse.code})` : "-"}
                    </p>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Reference Number</div>
                    <p className="mt-2 text-sm">{requestRow.referenceNumber || "-"}</p>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Current Stage</div>
                    <p className="mt-2 text-sm">{toStageLabel(requestRow.approvalStage)}</p>
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Note</div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{requestRow.note || "-"}</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="linked">
              <Card>
                <CardHeader>
                  <CardTitle>Linked Procurement Documents</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Purchase Order</div>
                    <div className="mt-2 text-sm">
                      {requestRow.purchaseOrder ? (
                        <Link
                          href={`/admin/scm/purchase-orders/${requestRow.purchaseOrder.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {requestRow.purchaseOrder.poNumber}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Goods Receipt</div>
                    <div className="mt-2 text-sm">
                      {requestRow.goodsReceipt ? (
                        <Link
                          href={`/admin/scm/goods-receipts/${requestRow.goodsReceipt.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {requestRow.goodsReceipt.receiptNumber}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Supplier Invoice</div>
                    <div className="mt-2 text-sm">{requestRow.supplierInvoice?.invoiceNumber || "-"}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Comparative Statement</div>
                    <div className="mt-2 text-sm">{requestRow.comparativeStatement?.csNumber || "-"}</div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="workflow" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Workflow Note</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    rows={3}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Add optional note for approval, rejection, treasury, or cancellation."
                  />
                  <p className="text-xs text-muted-foreground">
                    This note will be attached to your next workflow action from this page.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Approval Timeline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(requestRow.approvalEvents?.length || 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">No workflow actions recorded yet.</p>
                  ) : (
                    requestRow.approvalEvents?.map((event) => (
                      <div key={event.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium">
                            {toStageLabel(event.stage)} • {toStageLabel(event.decision)}
                          </div>
                          <div className="text-xs text-muted-foreground">{fmtDate(event.actedAt)}</div>
                        </div>
                        {event.actedBy ? (
                          <div className="mt-2 text-sm text-muted-foreground">
                            {event.actedBy.name || event.actedBy.email || "System"}
                          </div>
                        ) : null}
                        {event.note ? <p className="mt-2 text-sm">{event.note}</p> : null}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="payment">
              <Card>
                <CardHeader>
                  <CardTitle>Treasury Workspace</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {requestRow.supplierPayment ? (
                    <div className="rounded-lg border p-3 text-sm">
                      Payment {requestRow.supplierPayment.paymentNumber} posted on{" "}
                      {fmtDate(requestRow.supplierPayment.paymentDate)} for{" "}
                      {Number(requestRow.supplierPayment.amount).toFixed(2)} {requestRow.currency}.
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No treasury payment posted yet.</p>
                  )}

                  {canTreasury && ["FINANCE_APPROVED", "TREASURY_PROCESSING"].includes(requestRow.status) ? (
                    <div className="grid gap-3 md:grid-cols-3">
                      <Input
                        type="date"
                        value={paymentForm.paymentDate}
                        onChange={(event) =>
                          setPaymentForm((cur) => ({ ...cur, paymentDate: event.target.value }))
                        }
                      />
                      <Input
                        placeholder="Amount"
                        value={paymentForm.amount}
                        onChange={(event) =>
                          setPaymentForm((cur) => ({ ...cur, amount: event.target.value }))
                        }
                      />
                      <Input
                        placeholder="Method"
                        value={paymentForm.method}
                        onChange={(event) =>
                          setPaymentForm((cur) => ({ ...cur, method: event.target.value }))
                        }
                      />
                      <Input
                        placeholder="Reference"
                        value={paymentForm.reference}
                        onChange={(event) =>
                          setPaymentForm((cur) => ({ ...cur, reference: event.target.value }))
                        }
                      />
                      <Input
                        placeholder="Override note"
                        value={paymentForm.holdOverrideNote}
                        onChange={(event) =>
                          setPaymentForm((cur) => ({ ...cur, holdOverrideNote: event.target.value }))
                        }
                      />
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notifications">
              <Card>
                <CardHeader>
                  <CardTitle>Notification Trail</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(requestRow.notifications?.length || 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">No notification trail recorded yet.</p>
                  ) : (
                    requestRow.notifications?.map((notification) => (
                      <div key={notification.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium">
                            {toStageLabel(notification.stage)} • {notification.channel}
                          </div>
                          <ScmStatusChip status={notification.status} />
                        </div>
                        <p className="mt-2 text-sm">{notification.message}</p>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Recipient: {notification.recipientUser?.email || notification.recipientEmail || "-"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Created {fmtDate(notification.createdAt)}
                          {notification.sentAt ? ` • Sent ${fmtDate(notification.sentAt)}` : ""}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>People</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Created By</div>
                <div className="mt-1">{requestRow.createdBy?.name || requestRow.createdBy?.email || "-"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Manager Approved By</div>
                <div className="mt-1">{requestRow.managerApprovedBy?.name || requestRow.managerApprovedBy?.email || "-"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Finance Approved By</div>
                <div className="mt-1">{requestRow.financeApprovedBy?.name || requestRow.financeApprovedBy?.email || "-"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Treasury Processed By</div>
                <div className="mt-1">{requestRow.treasuryProcessedBy?.name || requestRow.treasuryProcessedBy?.email || "-"}</div>
              </div>
            </CardContent>
          </Card>

          <ScmNextStepPanel
            title={requestRow.status}
            subtitle="This panel keeps approval and treasury actions visible without sending users back to the register."
            emptyMessage="No direct workflow action is available for your current permissions."
            actions={actionButtons.map((button) => ({
              key: button.action,
              label: button.label,
              variant:
                button.action === "reject" || button.action === "cancel" ? "outline" : "default",
              disabled: saving,
              onClick: () => void runAction(button.action),
            }))}
          />
        </div>
      </div>
    </div>
  );
}
