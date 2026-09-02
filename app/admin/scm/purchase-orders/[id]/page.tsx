"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowLeft, ExternalLink, FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ScmDocumentLifecycle } from "@/components/admin/scm/ScmDocumentLifecycle";
import { ScmNextStepPanel } from "@/components/admin/scm/ScmNextStepPanel";
import { ScmStatCard } from "@/components/admin/scm/ScmStatCard";
import { ScmStatusChip } from "@/components/admin/scm/ScmStatusChip";

type PurchaseOrder = {
  id: number;
  poNumber: string;
  status: string;
  approvalStage: string;
  orderDate: string;
  submittedAt?: string | null;
  managerApprovedAt?: string | null;
  committeeApprovedAt?: string | null;
  approvedAt?: string | null;
  expectedAt: string | null;
  notes: string | null;
  termsTemplateName: string | null;
  termsAndConditions: string | null;
  rejectionNote: string | null;
  currency: string;
  grandTotal: number | string;
  subtotal?: number | string;
  supplier: {
    id: number;
    name: string;
    code: string;
    email?: string | null;
    currency?: string;
  };
  warehouse: {
    id: number;
    name: string;
    code: string;
  };
  createdBy?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  approvedBy?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  managerApprovedBy?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  committeeApprovedBy?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  finalApprovedBy?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  rejectedBy?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  purchaseRequisition?: {
    id: number;
    requisitionNumber: string;
    status: string;
    createdBy?: {
      id: string;
      name: string | null;
      email: string;
    } | null;
    assignedProcurementOfficer?: {
      id: string;
      name: string | null;
      email: string;
    } | null;
  } | null;
  sourceComparativeStatement?: {
    id: number;
    csNumber: string;
    status: string;
    rfq?: {
      id: number;
      rfqNumber: string;
    } | null;
  } | null;
  goodsReceipts?: Array<{
    id: number;
    receiptNumber: string;
    status: string;
    receivedAt: string;
  }>;
  landedCosts?: Array<{
    id: number;
    component: string;
    amount: string | number;
    currency?: string;
    incurredAt: string;
    note?: string | null;
    createdBy?: {
      id: string;
      name: string | null;
      email: string;
    } | null;
  }>;
  approvalEvents?: Array<{
    id: number;
    stage: string;
    decision: string;
    note: string | null;
    actedAt: string;
    actedBy?: {
      id: string;
      name: string | null;
      email: string;
    } | null;
  }>;
  notifications?: Array<{
    id: number;
    stage: string;
    channel: string;
    status: string;
    recipientEmail: string | null;
    message: string;
    sentAt: string | null;
    createdAt: string;
    recipientUser?: {
      id: string;
      name: string | null;
      email: string;
    } | null;
  }>;
  items: Array<{
    id: number;
    description: string | null;
    quantityOrdered: number;
    quantityReceived: number;
    unitCost: number | string;
    lineTotal: number | string;
    productVariant: {
      id: number;
      sku: string;
      stock?: number;
      product: {
        id: number;
        name: string;
      };
    };
  }>;
  supplierInvoices?: Array<{
    id: number;
    invoiceNumber: string;
    status: string;
    total: number | string;
    payments?: Array<{
      id: number;
      paymentNumber: string;
      amount: string | number;
      paymentDate: string;
    }>;
  }>;
  paymentRequests?: Array<{
    id: number;
    prfNumber: string;
    status: string;
    amount: number | string;
    supplierPayment?: {
      id: number;
      paymentNumber: string;
      amount: string | number;
      paymentDate: string;
    } | null;
  }>;
};

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || fallbackMessage);
  }
  return data as T;
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

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const purchaseOrderId = Number(params?.id);
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];
  const globalPermissions = Array.isArray((session?.user as any)?.globalPermissions)
    ? ((session?.user as any).globalPermissions as string[])
    : [];
  const canManage = permissions.includes("purchase_orders.manage");
  const canApproveLegacy = permissions.includes("purchase_orders.approve");
  const canApproveManager =
    permissions.includes("purchase_orders.approve_manager") || canApproveLegacy;
  const canApproveCommittee =
    permissions.includes("purchase_orders.approve_committee") || canApproveLegacy;
  const canApproveFinal =
    permissions.includes("purchase_orders.approve_final") || canApproveLegacy;
  const canApproveAny = canApproveManager || canApproveCommittee || canApproveFinal;
  const canManageSupplierInvoices = globalPermissions.includes("supplier_invoices.manage");

  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workflowNote, setWorkflowNote] = useState("");

  const loadPurchaseOrder = async () => {
    if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) {
      toast.error("Invalid purchase order id");
      router.replace("/admin/scm/purchase-orders");
      return;
    }
    try {
      setLoading(true);
      const response = await fetch(`/api/scm/purchase-orders/${purchaseOrderId}`, {
        cache: "no-store",
      });
      const data = await readJson<PurchaseOrder>(
        response,
        "Failed to load purchase order",
      );
      setPurchaseOrder(data);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load purchase order");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPurchaseOrder();
  }, [purchaseOrderId]);

  const actionButtons = useMemo(() => {
    if (!purchaseOrder) return [];
    const buttons: Array<{ action: string; label: string }> = [];
    if (purchaseOrder.status === "DRAFT" && canManage) {
      buttons.push({ action: "submit", label: "Submit" });
    }
    if (purchaseOrder.status === "SUBMITTED" && canApproveManager) {
      buttons.push({ action: "manager_approve", label: "Manager Approve" });
    }
    if (purchaseOrder.status === "MANAGER_APPROVED" && canApproveCommittee) {
      buttons.push({ action: "committee_approve", label: "Committee Approve" });
    }
    if (purchaseOrder.status === "COMMITTEE_APPROVED" && canApproveFinal) {
      buttons.push({ action: "final_approve", label: "Final Approve" });
    }
    if (
      ["SUBMITTED", "MANAGER_APPROVED", "COMMITTEE_APPROVED"].includes(
        purchaseOrder.status,
      ) &&
      canApproveAny
    ) {
      buttons.push({ action: "reject", label: "Reject" });
    }
    if (
      ["DRAFT", "SUBMITTED", "MANAGER_APPROVED", "COMMITTEE_APPROVED", "APPROVED"].includes(
        purchaseOrder.status,
      ) &&
      (canManage || canApproveAny)
    ) {
      buttons.push({ action: "cancel", label: "Cancel" });
    }
    return buttons;
  }, [
    purchaseOrder,
    canManage,
    canApproveManager,
    canApproveCommittee,
    canApproveFinal,
    canApproveAny,
  ]);

  const lifecycleStages = useMemo(() => {
    if (!purchaseOrder) return [];
    const latestReceipt = purchaseOrder.goodsReceipts?.[0] ?? null;
    const latestInvoice = purchaseOrder.supplierInvoices?.[0] ?? null;
    const latestPrf = purchaseOrder.paymentRequests?.[0] ?? null;
    const latestPayment =
      latestPrf?.supplierPayment ??
      purchaseOrder.supplierInvoices?.flatMap((invoice) => invoice.payments ?? [])[0] ??
      null;

    return [
      {
        key: "requisition",
        label: "Requisition",
        value: purchaseOrder.purchaseRequisition?.requisitionNumber || "No requisition",
        helperText: purchaseOrder.purchaseRequisition
          ? toStageLabel(purchaseOrder.purchaseRequisition.status)
          : "Direct procurement",
        href: purchaseOrder.purchaseRequisition
          ? `/admin/scm/purchase-requisitions/${purchaseOrder.purchaseRequisition.id}`
          : null,
        state: purchaseOrder.purchaseRequisition ? ("linked" as const) : ("pending" as const),
      },
      {
        key: "rfq",
        label: "RFQ",
        value: purchaseOrder.sourceComparativeStatement?.rfq?.rfqNumber || "No RFQ",
        helperText: purchaseOrder.sourceComparativeStatement?.rfq ? "Sourcing completed" : "Direct issue",
        href: purchaseOrder.sourceComparativeStatement?.rfq
          ? `/admin/scm/rfqs/${purchaseOrder.sourceComparativeStatement.rfq.id}`
          : null,
        state: purchaseOrder.sourceComparativeStatement?.rfq ? ("linked" as const) : ("pending" as const),
      },
      {
        key: "cs",
        label: "Comparative",
        value: purchaseOrder.sourceComparativeStatement?.csNumber || "Not linked",
        helperText: purchaseOrder.sourceComparativeStatement
          ? toStageLabel(purchaseOrder.sourceComparativeStatement.status)
          : "No comparative statement",
        href: null,
        state: purchaseOrder.sourceComparativeStatement ? ("linked" as const) : ("pending" as const),
      },
      {
        key: "po",
        label: "Purchase Order",
        value: purchaseOrder.poNumber,
        helperText: toStageLabel(purchaseOrder.status),
        href: `/admin/scm/purchase-orders/${purchaseOrder.id}`,
        state: "current" as const,
      },
      {
        key: "grn",
        label: "Goods Receipt",
        value: latestReceipt?.receiptNumber || "Not posted",
        helperText: latestReceipt ? toStageLabel(latestReceipt.status) : "Awaiting receiving",
        href: null,
        state: latestReceipt ? ("linked" as const) : ("pending" as const),
      },
      {
        key: "invoice",
        label: "Invoice",
        value: latestInvoice?.invoiceNumber || "Not posted",
        helperText: latestInvoice ? toStageLabel(latestInvoice.status) : "Awaiting AP posting",
        href: null,
        state: latestInvoice ? ("linked" as const) : ("pending" as const),
      },
      {
        key: "prf",
        label: "Payment Request",
        value: latestPrf?.prfNumber || "Not created",
        helperText: latestPrf ? toStageLabel(latestPrf.status) : "Awaiting payment request",
        href: latestPrf ? `/admin/scm/payment-requests/${latestPrf.id}` : null,
        state: latestPrf ? ("linked" as const) : ("pending" as const),
      },
      {
        key: "payment",
        label: "Payment",
        value: latestPayment?.paymentNumber || "Not settled",
        helperText: latestPayment ? "Supplier payment posted" : "Awaiting treasury settlement",
        href: null,
        state: latestPayment ? ("linked" as const) : ("pending" as const),
      },
    ];
  }, [purchaseOrder]);

  const changeStatus = async (action: string) => {
    if (!purchaseOrder) return;
    try {
      setSaving(true);
      const response = await fetch(`/api/scm/purchase-orders/${purchaseOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          note: workflowNote.trim() || null,
          rejectionNote: workflowNote.trim() || null,
        }),
      });
      await readJson(response, `Failed to ${action} purchase order`);
      toast.success(`Purchase order ${toStageLabel(action)} completed`);
      setWorkflowNote("");
      await loadPurchaseOrder();
    } catch (error: any) {
      toast.error(error?.message || `Failed to ${action} purchase order`);
    } finally {
      setSaving(false);
    }
  };

  const hasReceivedGoods = purchaseOrder?.items.some((item) => item.quantityReceived > 0) ?? false;

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <p className="text-sm text-muted-foreground">Loading purchase order workspace...</p>
      </div>
    );
  }

  if (!purchaseOrder) {
    return (
      <div className="space-y-6 p-6">
        <Button asChild variant="outline">
          <Link href="/admin/scm/purchase-orders">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back To Register
          </Link>
        </Button>
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            Purchase order not found.
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
              <Link href="/admin/scm/purchase-orders">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <ScmStatusChip status={purchaseOrder.status} />
            <Badge variant="secondary">{toStageLabel(purchaseOrder.approvalStage)}</Badge>
            {(purchaseOrder.goodsReceipts?.length || 0) > 0 ? (
              <Badge variant="secondary">Receipts Posted</Badge>
            ) : null}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{purchaseOrder.poNumber}</h1>
            <p className="text-sm text-muted-foreground">
              {purchaseOrder.supplier.name} • {purchaseOrder.warehouse.name}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadPurchaseOrder()} disabled={loading || saving}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          {canManageSupplierInvoices && hasReceivedGoods ? (
            <Button asChild>
              <Link href={`/admin/scm/supplier-invoices?purchaseOrderId=${purchaseOrder.id}`}>
                <FileText className="mr-2 h-4 w-4" />
                Generate Supplier Invoice
              </Link>
            </Button>
          ) : null}
          {actionButtons.map((button) => (
            <Button
              key={button.action}
              variant={button.action === "reject" || button.action === "cancel" ? "outline" : "default"}
              onClick={() => void changeStatus(button.action)}
              disabled={saving}
            >
              {button.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ScmStatCard
          label="Warehouse"
          value={purchaseOrder.warehouse.name}
          hint={purchaseOrder.warehouse.code}
        />
        <ScmStatCard
          label="Expected Delivery"
          value={purchaseOrder.expectedAt ? new Date(purchaseOrder.expectedAt).toLocaleDateString() : "-"}
          hint={`Ordered ${new Date(purchaseOrder.orderDate).toLocaleDateString()}`}
        />
        <ScmStatCard
          label="Grand Total"
          value={`${Number(purchaseOrder.grandTotal).toFixed(2)} ${purchaseOrder.currency}`}
          hint={`Subtotal ${Number(purchaseOrder.subtotal ?? purchaseOrder.grandTotal).toFixed(2)}`}
        />
        <ScmStatCard
          label="Receipts"
          value={`${purchaseOrder.goodsReceipts?.length || 0}`}
          hint={`${purchaseOrder.items.reduce((sum, item) => sum + item.quantityReceived, 0)} units received`}
        />
      </div>

      <ScmDocumentLifecycle stages={lifecycleStages} />

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: "Submitted", value: fmtDate(purchaseOrder.submittedAt) },
                  { label: "Manager Approved", value: fmtDate(purchaseOrder.managerApprovedAt) },
                  { label: "Committee Approved", value: fmtDate(purchaseOrder.committeeApprovedAt) },
                  { label: "Final Approved", value: fmtDate(purchaseOrder.approvedAt) },
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
              <TabsTrigger value="items">Items</TabsTrigger>
              <TabsTrigger value="receipts">Receipts & Costs</TabsTrigger>
              <TabsTrigger value="workflow">Workflow</TabsTrigger>
              <TabsTrigger value="documents">Linked Docs</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Commercial Summary</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Supplier
                    </div>
                    <p className="mt-2 text-sm">
                      {purchaseOrder.supplier.name} ({purchaseOrder.supplier.code})
                    </p>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Terms Template
                    </div>
                    <p className="mt-2 text-sm">{purchaseOrder.termsTemplateName || "Custom / None"}</p>
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Notes
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{purchaseOrder.notes || "-"}</p>
                  </div>
                  <div className="md:col-span-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Terms & Conditions
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm">
                      {purchaseOrder.termsAndConditions || "-"}
                    </p>
                  </div>
                  {purchaseOrder.rejectionNote ? (
                    <div className="md:col-span-2">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Rejection Note
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-destructive">
                        {purchaseOrder.rejectionNote}
                      </p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="items">
              <Card>
                <CardHeader>
                  <CardTitle>Ordered Items</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Ordered</TableHead>
                        <TableHead>Received</TableHead>
                        <TableHead>Unit Cost</TableHead>
                        <TableHead>Line Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseOrder.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium">{item.productVariant.product.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.productVariant.sku}
                            </div>
                          </TableCell>
                          <TableCell>{item.quantityOrdered}</TableCell>
                          <TableCell>{item.quantityReceived}</TableCell>
                          <TableCell>{Number(item.unitCost).toFixed(2)}</TableCell>
                          <TableCell>{Number(item.lineTotal).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="receipts" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Goods Receipts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(purchaseOrder.goodsReceipts?.length || 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">No goods receipt posted yet.</p>
                  ) : (
                    purchaseOrder.goodsReceipts?.map((receipt) => (
                      <div key={receipt.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium">{receipt.receiptNumber}</div>
                          <ScmStatusChip status={receipt.status} />
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          Received {fmtDate(receipt.receivedAt)}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Landed Costs</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(purchaseOrder.landedCosts?.length || 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">No landed costs captured yet.</p>
                  ) : (
                    purchaseOrder.landedCosts?.map((cost) => (
                      <div key={cost.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium">{toStageLabel(cost.component)}</div>
                          <div className="text-sm font-medium">
                            {Number(cost.amount).toFixed(2)} {purchaseOrder.currency}
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Incurred {fmtDate(cost.incurredAt)}
                          {cost.createdBy ? ` • ${cost.createdBy.name || cost.createdBy.email}` : ""}
                        </div>
                        {cost.note ? <p className="mt-2 text-sm">{cost.note}</p> : null}
                      </div>
                    ))
                  )}
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
                    value={workflowNote}
                    onChange={(event) => setWorkflowNote(event.target.value)}
                    placeholder="Add optional note for approval, rejection, or cancellation."
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
                  {(purchaseOrder.approvalEvents?.length || 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">No workflow actions recorded yet.</p>
                  ) : (
                    purchaseOrder.approvalEvents?.map((event) => (
                      <div key={event.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium">
                            {toStageLabel(event.stage)} • {toStageLabel(event.decision)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {fmtDate(event.actedAt)}
                          </div>
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          {event.actedBy?.name || event.actedBy?.email || "System"}
                        </div>
                        {event.note ? <p className="mt-2 text-sm">{event.note}</p> : null}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Linked Procurement Documents</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Purchase Requisition
                    </div>
                    <div className="mt-2 text-sm">
                      {purchaseOrder.purchaseRequisition ? (
                        <Link
                          href={`/admin/scm/purchase-requisitions/${purchaseOrder.purchaseRequisition.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {purchaseOrder.purchaseRequisition.requisitionNumber}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Comparative Statement
                    </div>
                    <div className="mt-2 text-sm">
                      {purchaseOrder.sourceComparativeStatement ? (
                        purchaseOrder.sourceComparativeStatement.csNumber
                      ) : (
                        "-"
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      RFQ
                    </div>
                    <div className="mt-2 text-sm">
                      {purchaseOrder.sourceComparativeStatement?.rfq ? (
                        <Link
                          href={`/admin/scm/rfqs/${purchaseOrder.sourceComparativeStatement.rfq.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {purchaseOrder.sourceComparativeStatement.rfq.rfqNumber}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Notification Trail</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(purchaseOrder.notifications?.length || 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">No notification trail recorded yet.</p>
                  ) : (
                    purchaseOrder.notifications?.map((notification) => (
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
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Created By
                </div>
                <div className="mt-1">
                  {purchaseOrder.createdBy?.name || purchaseOrder.createdBy?.email || "-"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Manager Approved By
                </div>
                <div className="mt-1">
                  {purchaseOrder.managerApprovedBy?.name ||
                    purchaseOrder.managerApprovedBy?.email ||
                    "-"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Committee Approved By
                </div>
                <div className="mt-1">
                  {purchaseOrder.committeeApprovedBy?.name ||
                    purchaseOrder.committeeApprovedBy?.email ||
                    "-"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Final Approved By
                </div>
                <div className="mt-1">
                  {purchaseOrder.finalApprovedBy?.name ||
                    purchaseOrder.finalApprovedBy?.email ||
                    purchaseOrder.approvedBy?.name ||
                    purchaseOrder.approvedBy?.email ||
                    "-"}
                </div>
              </div>
            </CardContent>
          </Card>

          <ScmNextStepPanel
            title={purchaseOrder.status}
            subtitle="This panel keeps approval actions visible without forcing users back into the register."
            emptyMessage="No direct workflow action is available for your current permissions."
            actions={actionButtons.map((button) => ({
              key: button.action,
              label: button.label,
              variant:
                button.action === "reject" || button.action === "cancel" ? "outline" : "default",
              disabled: saving,
              onClick: () => void changeStatus(button.action),
            }))}
          />

          {(purchaseOrder.goodsReceipts?.length || 0) > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Receipt & Invoice Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {purchaseOrder.goodsReceipts?.map((receipt) => (
                    <Button asChild key={receipt.id} variant="outline" className="w-full justify-start">
                    <Link href={`/admin/scm/goods-receipts/${receipt.id}`}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {receipt.receiptNumber}
                    </Link>
                  </Button>
                ))}
                {canManageSupplierInvoices ? (
                  <Button asChild className="w-full justify-start">
                    <Link href={`/admin/scm/supplier-invoices?purchaseOrderId=${purchaseOrder.id}`}>
                      <FileText className="mr-2 h-4 w-4" />
                      Generate Supplier Invoice
                    </Link>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
