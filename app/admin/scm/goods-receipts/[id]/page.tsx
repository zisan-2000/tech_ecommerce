"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowLeft, ExternalLink, FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { uploadFile } from "@/lib/upload-file";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

type ReceiptRole = "REQUESTER" | "PROCUREMENT" | "ADMINISTRATION";
type AttachmentType = "CHALLAN" | "BILL" | "OTHER";

type GoodsReceipt = {
  id: number;
  receiptNumber: string;
  status: string;
  receivedAt: string;
  note: string | null;
  requesterConfirmedAt: string | null;
  requesterConfirmationNote: string | null;
  warehouse: { id: number; name: string; code: string };
  receivedBy: { id: string; name: string | null; email: string } | null;
  requesterConfirmedBy: { id: string; name: string | null; email: string } | null;
  purchaseOrder: {
    id: number;
    poNumber: string;
    status: string;
    supplier: { id: number; name: string; code: string };
    purchaseRequisition?: { id: number; requisitionNumber: string; status: string } | null;
    sourceComparativeStatement?: {
      id: number;
      csNumber: string;
      status: string;
      rfq?: { id: number; rfqNumber: string } | null;
    } | null;
  };
  items: Array<{
    id: number;
    quantityReceived: number;
    unitCost: string | number;
    productVariant: {
      id: number;
      sku: string;
      product: { id: number; name: string };
    };
  }>;
  attachments: Array<{
    id: number;
    type: AttachmentType;
    fileUrl: string;
    fileName: string | null;
    note: string | null;
    createdAt: string;
    uploadedBy: { id: string; name: string | null; email: string | null } | null;
  }>;
  vendorEvaluations: Array<{
    id: number;
    evaluatorRole: ReceiptRole;
    overallRating: number;
    serviceQualityRating: number | null;
    deliveryRating: number | null;
    complianceRating: number | null;
    comment: string | null;
    updatedAt: string;
    createdBy: { id: string; name: string | null; email: string | null } | null;
  }>;
  invoices: Array<{
    id: number;
    invoiceNumber: string;
    status: string;
    total: string | number;
  }>;
  workflow: {
    requesterUserId: string | null;
    requesterConfirmed: boolean;
    canRequesterConfirm: boolean;
    canManageAttachments: boolean;
    allowedEvaluationRoles: ReceiptRole[];
    submittedEvaluationRoles: ReceiptRole[];
    missingEvaluationRoles: ReceiptRole[];
    evaluationCompleted: boolean;
  };
  matchSummary: {
    orderedQuantity: number;
    receivedQuantity: number;
    invoicedQuantity: number;
    invoiceCount: number;
    status: "PENDING" | "MATCHED" | "VARIANCE";
  };
};

type AttachmentDraft = { type: AttachmentType; note: string; file: File | null };
type EvaluationDraft = {
  evaluatorRole: ReceiptRole;
  overallRating: string;
  serviceQualityRating: string;
  deliveryRating: string;
  complianceRating: string;
  comment: string;
};

const ROLE_LABEL: Record<ReceiptRole, string> = {
  REQUESTER: "Requester",
  PROCUREMENT: "Procurement",
  ADMINISTRATION: "Manager Administration",
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
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString();
}

function toStageLabel(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export default function GoodsReceiptDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const goodsReceiptId = Number(params?.id);
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];
  const globalPermissions = Array.isArray((session?.user as any)?.globalPermissions)
    ? ((session?.user as any).globalPermissions as string[])
    : [];
  const canManagePosting = permissions.includes("goods_receipts.manage");
  const canManageSupplierInvoices = globalPermissions.includes("supplier_invoices.manage");

  const [receipt, setReceipt] = useState<GoodsReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmationNote, setConfirmationNote] = useState("");
  const [attachmentDraft, setAttachmentDraft] = useState<AttachmentDraft>({ type: "CHALLAN", note: "", file: null });
  const [evaluationDraft, setEvaluationDraft] = useState<EvaluationDraft>({
    evaluatorRole: "REQUESTER",
    overallRating: "5",
    serviceQualityRating: "5",
    deliveryRating: "5",
    complianceRating: "5",
    comment: "",
  });

  const loadReceipt = async () => {
    if (!Number.isInteger(goodsReceiptId) || goodsReceiptId <= 0) {
      toast.error("Invalid goods receipt id");
      router.replace("/admin/scm/goods-receipts");
      return;
    }
    try {
      setLoading(true);
      const response = await fetch(`/api/scm/goods-receipts/${goodsReceiptId}`, { cache: "no-store" });
      const data = await readJson<GoodsReceipt>(response, "Failed to load goods receipt");
      setReceipt(data);
      setEvaluationDraft((current) => ({
        ...current,
        evaluatorRole: data.workflow.allowedEvaluationRoles[0] || current.evaluatorRole,
      }));
    } catch (error: any) {
      toast.error(error?.message || "Failed to load goods receipt");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReceipt();
  }, [goodsReceiptId]);

  const lifecycleStages = useMemo(() => {
    if (!receipt) return [];
    const requisition = receipt.purchaseOrder.purchaseRequisition;
    const comparative = receipt.purchaseOrder.sourceComparativeStatement;
    const rfq = comparative?.rfq;
    const latestInvoice = receipt.invoices[0] ?? null;
    return [
      {
        key: "requisition",
        label: "Requisition",
        value: requisition?.requisitionNumber || "Not linked",
        helperText: requisition ? toStageLabel(requisition.status) : "No requisition",
        href: requisition ? `/admin/scm/purchase-requisitions/${requisition.id}` : null,
        state: requisition ? ("linked" as const) : ("pending" as const),
      },
      {
        key: "rfq",
        label: "RFQ",
        value: rfq?.rfqNumber || "Not linked",
        helperText: rfq ? "Sourcing completed" : "No RFQ",
        href: rfq ? `/admin/scm/rfqs/${rfq.id}` : null,
        state: rfq ? ("linked" as const) : ("pending" as const),
      },
      {
        key: "cs",
        label: "Comparative",
        value: comparative?.csNumber || "Not linked",
        helperText: comparative ? toStageLabel(comparative.status) : "No comparative statement",
        href: null,
        state: comparative ? ("linked" as const) : ("pending" as const),
      },
      {
        key: "po",
        label: "Purchase Order",
        value: receipt.purchaseOrder.poNumber,
        helperText: toStageLabel(receipt.purchaseOrder.status),
        href: `/admin/scm/purchase-orders/${receipt.purchaseOrder.id}`,
        state: "linked" as const,
      },
      {
        key: "grn",
        label: "Goods Receipt",
        value: receipt.receiptNumber,
        helperText: toStageLabel(receipt.matchSummary.status),
        href: `/admin/scm/goods-receipts/${receipt.id}`,
        state: "current" as const,
      },
      {
        key: "invoice",
        label: "Invoice",
        value: latestInvoice?.invoiceNumber || "Not posted",
        helperText: latestInvoice ? toStageLabel(latestInvoice.status) : "Awaiting AP posting",
        href: null,
        state: latestInvoice ? ("linked" as const) : ("pending" as const),
      },
    ];
  }, [receipt]);

  const patchReceipt = async (payload: Record<string, unknown>, successMessage: string, key: string) => {
    if (!receipt) return;
    try {
      setBusyKey(key);
      const response = await fetch(`/api/scm/goods-receipts/${receipt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await readJson(response, "Failed to update goods receipt");
      toast.success(successMessage);
      await loadReceipt();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update goods receipt");
    } finally {
      setBusyKey(null);
    }
  };

  const uploadAttachment = async () => {
    if (!receipt || !attachmentDraft.file) {
      toast.error("Select a file first");
      return;
    }
    try {
      setBusyKey("upload_attachment");
      const fileUrl = await uploadFile(attachmentDraft.file, "/api/upload/scm-grn");
      const response = await fetch(`/api/scm/goods-receipts/${receipt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_attachment",
          type: attachmentDraft.type,
          note: attachmentDraft.note,
          fileUrl,
          fileName: attachmentDraft.file.name,
          mimeType: attachmentDraft.file.type || null,
          fileSize: attachmentDraft.file.size,
        }),
      });
      await readJson(response, "Failed to upload attachment");
      toast.success("Attachment uploaded");
      setAttachmentDraft({ type: attachmentDraft.type, note: "", file: null });
      await loadReceipt();
    } catch (error: any) {
      toast.error(error?.message || "Failed to upload attachment");
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) {
    return <div className="space-y-6 p-6"><p className="text-sm text-muted-foreground">Loading goods receipt workspace...</p></div>;
  }

  if (!receipt) {
    return (
      <div className="space-y-6 p-6">
        <Button asChild variant="outline">
          <Link href="/admin/scm/goods-receipts">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back To Register
          </Link>
        </Button>
        <Card><CardContent className="py-10 text-sm text-muted-foreground">Goods receipt not found.</CardContent></Card>
      </div>
    );
  }

  const evaluationsByRole = new Map(receipt.vendorEvaluations.map((item) => [item.evaluatorRole, item]));

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/scm/goods-receipts">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <ScmStatusChip status={receipt.matchSummary.status} />
            {receipt.requesterConfirmedAt ? <ScmStatusChip status="CONFIRMED" /> : null}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{receipt.receiptNumber}</h1>
            <p className="text-sm text-muted-foreground">{receipt.purchaseOrder.poNumber} • {receipt.purchaseOrder.supplier.name}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadReceipt()} disabled={loading || busyKey !== null}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          {canManagePosting ? (
            <Button asChild variant="outline">
              <Link href="/admin/scm/goods-receipts/new">New GRN</Link>
            </Button>
          ) : null}
          {canManageSupplierInvoices ? (
            <Button asChild>
              <Link href={`/admin/scm/supplier-invoices?purchaseOrderId=${receipt.purchaseOrder.id}&goodsReceiptId=${receipt.id}`}>
                <FileText className="mr-2 h-4 w-4" />
                Generate Supplier Invoice
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ScmStatCard label="Warehouse" value={receipt.warehouse.name} hint={receipt.warehouse.code} />
        <ScmStatCard label="Delivered" value={String(receipt.matchSummary.receivedQuantity)} hint={`Ordered ${receipt.matchSummary.orderedQuantity}`} />
        <ScmStatCard label="Invoices" value={String(receipt.matchSummary.invoiceCount)} hint={`Invoiced qty ${receipt.matchSummary.invoicedQuantity}`} />
        <ScmStatCard label="Evaluation" value={receipt.workflow.evaluationCompleted ? "Complete" : "Pending"} hint={receipt.workflow.evaluationCompleted ? "All roles submitted" : receipt.workflow.missingEvaluationRoles.map((role) => ROLE_LABEL[role]).join(", ")} />
      </div>

      <ScmDocumentLifecycle stages={lifecycleStages} />

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="items">Items</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="evaluation">Evaluation</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <Card>
                <CardHeader><CardTitle>Receipt Context</CardTitle></CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Received At</div><p className="mt-2 text-sm">{fmtDate(receipt.receivedAt)}</p></div>
                  <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Received By</div><p className="mt-2 text-sm">{receipt.receivedBy?.name || receipt.receivedBy?.email || "-"}</p></div>
                  <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Requester Confirmation</div><p className="mt-2 text-sm">{receipt.requesterConfirmedAt ? fmtDate(receipt.requesterConfirmedAt) : "Pending"}</p></div>
                  <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Receipt Note</div><p className="mt-2 text-sm whitespace-pre-wrap">{receipt.note || "-"}</p></div>
                  <div className="md:col-span-2"><div className="text-xs uppercase tracking-wide text-muted-foreground">3-Way Match</div><p className="mt-2 text-sm">Ordered {receipt.matchSummary.orderedQuantity} • Delivered {receipt.matchSummary.receivedQuantity} • Invoiced {receipt.matchSummary.invoicedQuantity}</p></div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="items">
              <Card>
                <CardHeader><CardTitle>Received Lines</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Qty Received</TableHead>
                        <TableHead>Unit Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receipt.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium">{item.productVariant.product.name}</div>
                            <div className="text-xs text-muted-foreground">{item.productVariant.sku}</div>
                          </TableCell>
                          <TableCell>{item.quantityReceived}</TableCell>
                          <TableCell>{Number(item.unitCost).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents" className="space-y-4">
              <Card>
                <CardHeader><CardTitle>Requester Confirmation & Attachments</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {receipt.workflow.canRequesterConfirm ? (
                    <div className="space-y-2 rounded-lg border p-3">
                      <div className="text-sm font-medium">Requester Confirmation</div>
                      <Textarea rows={3} placeholder="Confirmation note (optional)" value={confirmationNote} onChange={(event) => setConfirmationNote(event.target.value)} />
                      <Button onClick={() => void patchReceipt({ action: "requester_confirm", note: confirmationNote || undefined }, "Requester confirmation submitted", "requester_confirm")} disabled={busyKey === "requester_confirm"}>
                        Confirm GRN
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-lg border p-3 text-sm text-muted-foreground">{receipt.requesterConfirmedAt ? `Requester confirmed at ${fmtDate(receipt.requesterConfirmedAt)}` : "Requester confirmation is not available for your role."}</div>
                  )}

                  {receipt.attachments.map((attachment) => (
                    <div key={attachment.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">{attachment.type} • {attachment.fileName || "Attachment"}</div>
                        <div className="text-xs text-muted-foreground">{fmtDate(attachment.createdAt)}</div>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">{attachment.uploadedBy?.name || attachment.uploadedBy?.email || "N/A"}</div>
                      {attachment.note ? <p className="mt-2 text-sm">{attachment.note}</p> : null}
                      <Button asChild variant="outline" size="sm" className="mt-3">
                        <a href={attachment.fileUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Open Attachment
                        </a>
                      </Button>
                    </div>
                  ))}

                  {receipt.workflow.canManageAttachments ? (
                    <div className="space-y-3 rounded-lg border p-3">
                      <div className="text-sm font-medium">Upload Challan / Bill</div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={attachmentDraft.type} onChange={(event) => setAttachmentDraft((current) => ({ ...current, type: event.target.value as AttachmentType }))}>
                          <option value="CHALLAN">CHALLAN</option>
                          <option value="BILL">BILL</option>
                          <option value="OTHER">OTHER</option>
                        </select>
                        <Input type="file" onChange={(event) => setAttachmentDraft((current) => ({ ...current, file: event.target.files?.[0] || null }))} />
                      </div>
                      <Textarea rows={2} placeholder="Attachment note (optional)" value={attachmentDraft.note} onChange={(event) => setAttachmentDraft((current) => ({ ...current, note: event.target.value }))} />
                      <Button onClick={() => void uploadAttachment()} disabled={busyKey === "upload_attachment"}>
                        {busyKey === "upload_attachment" ? "Uploading..." : "Upload Attachment"}
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="evaluation">
              <Card>
                <CardHeader><CardTitle>Vendor Performance Evaluation</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    {(["REQUESTER", "PROCUREMENT", "ADMINISTRATION"] as ReceiptRole[]).map((role) => {
                      const evaluation = evaluationsByRole.get(role);
                      return (
                        <div key={role} className="rounded-lg border p-3 text-sm">
                          <div className="font-medium">{ROLE_LABEL[role]}</div>
                          {evaluation ? (
                            <>
                              <div className="mt-2 text-muted-foreground">Overall {evaluation.overallRating}/5</div>
                              <div className="text-muted-foreground">Service {evaluation.serviceQualityRating ?? "N/A"} • Delivery {evaluation.deliveryRating ?? "N/A"} • Compliance {evaluation.complianceRating ?? "N/A"}</div>
                            </>
                          ) : (
                            <div className="mt-2 text-muted-foreground">Pending</div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {receipt.workflow.allowedEvaluationRoles.length > 0 ? (
                    <div className="space-y-3 rounded-lg border p-3">
                      <div className="text-sm font-medium">Submit Evaluation</div>
                      <div className="grid gap-3 md:grid-cols-5">
                        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={evaluationDraft.evaluatorRole} onChange={(event) => setEvaluationDraft((current) => ({ ...current, evaluatorRole: event.target.value as ReceiptRole }))}>
                          {receipt.workflow.allowedEvaluationRoles.map((role) => (
                            <option key={role} value={role}>{ROLE_LABEL[role]}</option>
                          ))}
                        </select>
                        <Input type="number" min={1} max={5} placeholder="Overall" value={evaluationDraft.overallRating} onChange={(event) => setEvaluationDraft((current) => ({ ...current, overallRating: event.target.value }))} />
                        <Input type="number" min={1} max={5} placeholder="Service" value={evaluationDraft.serviceQualityRating} onChange={(event) => setEvaluationDraft((current) => ({ ...current, serviceQualityRating: event.target.value }))} />
                        <Input type="number" min={1} max={5} placeholder="Delivery" value={evaluationDraft.deliveryRating} onChange={(event) => setEvaluationDraft((current) => ({ ...current, deliveryRating: event.target.value }))} />
                        <Input type="number" min={1} max={5} placeholder="Compliance" value={evaluationDraft.complianceRating} onChange={(event) => setEvaluationDraft((current) => ({ ...current, complianceRating: event.target.value }))} />
                      </div>
                      <Textarea rows={2} placeholder="Evaluation note (optional)" value={evaluationDraft.comment} onChange={(event) => setEvaluationDraft((current) => ({ ...current, comment: event.target.value }))} />
                      <Button onClick={() => void patchReceipt({ action: "submit_evaluation", evaluatorRole: evaluationDraft.evaluatorRole, overallRating: Number(evaluationDraft.overallRating), serviceQualityRating: evaluationDraft.serviceQualityRating ? Number(evaluationDraft.serviceQualityRating) : null, deliveryRating: evaluationDraft.deliveryRating ? Number(evaluationDraft.deliveryRating) : null, complianceRating: evaluationDraft.complianceRating ? Number(evaluationDraft.complianceRating) : null, comment: evaluationDraft.comment || null }, `${ROLE_LABEL[evaluationDraft.evaluatorRole]} evaluation submitted`, "submit_evaluation")} disabled={busyKey === "submit_evaluation"}>
                        Submit Evaluation
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">You do not have an evaluation role for this GRN.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history">
              <Card>
                <CardHeader><CardTitle>Invoice and Match History</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {receipt.invoices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No supplier invoice has been posted against this purchase order yet.</p>
                  ) : (
                    receipt.invoices.map((invoice) => (
                      <div key={invoice.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium">{invoice.invoiceNumber}</div>
                          <ScmStatusChip status={invoice.status} />
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">Total {Number(invoice.total).toFixed(2)}</div>
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
            <CardHeader><CardTitle>People</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Received By</div><div className="mt-1">{receipt.receivedBy?.name || receipt.receivedBy?.email || "-"}</div></div>
              <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Requester Confirmed By</div><div className="mt-1">{receipt.requesterConfirmedBy?.name || receipt.requesterConfirmedBy?.email || "-"}</div></div>
            </CardContent>
          </Card>

          <ScmNextStepPanel
            title={receipt.matchSummary.status}
            subtitle="This panel keeps confirmation, invoice review, document upload, and evaluation inside the single GRN workspace."
            actions={
              canManageSupplierInvoices
                ? [
                    {
                      key: "generate_supplier_invoice",
                      label: "Generate Supplier Invoice",
                      onClick: () =>
                        router.push(
                          `/admin/scm/supplier-invoices?purchaseOrderId=${receipt.purchaseOrder.id}&goodsReceiptId=${receipt.id}`,
                        ),
                    },
                  ]
                : []
            }
            emptyMessage="No direct workflow action is required right now."
          >
            <div className="space-y-2 text-sm text-muted-foreground">
              <div>{receipt.requesterConfirmedAt ? `Confirmed ${fmtDate(receipt.requesterConfirmedAt)}` : "Requester confirmation pending"}</div>
              <div>{receipt.workflow.evaluationCompleted ? "All evaluation roles completed" : `Missing: ${receipt.workflow.missingEvaluationRoles.map((role) => ROLE_LABEL[role]).join(", ")}`}</div>
            </div>
          </ScmNextStepPanel>
        </div>
      </div>
    </div>
  );
}
