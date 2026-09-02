"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, ClipboardCheck, PackageCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScmSectionHeader } from "@/components/admin/scm/ScmSectionHeader";
import { ScmStatCard } from "@/components/admin/scm/ScmStatCard";

type PurchaseOrder = {
  id: number;
  poNumber: string;
  status: string;
  warehouse: { id: number; name: string; code: string };
  supplier: { id: number; name: string; code: string };
  items: Array<{
    id: number;
    quantityOrdered: number;
    quantityReceived: number;
    productVariant: {
      id: number;
      sku: string;
      product: { id: number; name: string };
    };
  }>;
};

type GoodsReceipt = {
  id: number;
  receiptNumber: string;
};

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || fallbackMessage);
  }
  return data as T;
}

export default function NewGoodsReceiptPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const permissions = Array.isArray((session?.user as any)?.permissions)
    ? ((session?.user as any).permissions as string[])
    : [];
  const canManagePosting = permissions.includes("goods_receipts.manage");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState("");
  const [receiptNote, setReceiptNote] = useState("");
  const [quantityDraft, setQuantityDraft] = useState<Record<number, string>>({});

  const loadPurchaseOrders = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/scm/purchase-orders", { cache: "no-store" });
      const data = await readJson<PurchaseOrder[]>(response, "Failed to load purchase orders");
      setPurchaseOrders(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load purchase orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canManagePosting) {
      void loadPurchaseOrders();
    }
  }, [canManagePosting]);

  const eligiblePurchaseOrders = useMemo(
    () =>
      purchaseOrders.filter((purchaseOrder) =>
        ["APPROVED", "PARTIALLY_RECEIVED"].includes(purchaseOrder.status),
      ),
    [purchaseOrders],
  );

  const selectedPurchaseOrder = useMemo(() => {
    const purchaseOrderId = Number(selectedPurchaseOrderId);
    if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) return null;
    return eligiblePurchaseOrders.find((purchaseOrder) => purchaseOrder.id === purchaseOrderId) || null;
  }, [eligiblePurchaseOrders, selectedPurchaseOrderId]);

  useEffect(() => {
    if (!selectedPurchaseOrder) {
      setQuantityDraft({});
      return;
    }
    setQuantityDraft(
      Object.fromEntries(
        selectedPurchaseOrder.items.map((item) => [
          item.id,
          String(Math.max(item.quantityOrdered - item.quantityReceived, 0)),
        ]),
      ),
    );
  }, [selectedPurchaseOrder]);

  const summary = useMemo(
    () => ({
      readyToReceive: eligiblePurchaseOrders.length,
      partiallyReceived: eligiblePurchaseOrders.filter((row) => row.status === "PARTIALLY_RECEIVED")
        .length,
      linesOpen:
        selectedPurchaseOrder?.items.reduce(
          (sum, item) => sum + Math.max(item.quantityOrdered - item.quantityReceived, 0),
          0,
        ) ?? 0,
    }),
    [eligiblePurchaseOrders, selectedPurchaseOrder],
  );

  const postReceipt = async () => {
    if (!selectedPurchaseOrder) {
      toast.error("Select a purchase order");
      return;
    }

    const payloadItems = selectedPurchaseOrder.items
      .map((item) => ({
        purchaseOrderItemId: item.id,
        quantityReceived: Number(quantityDraft[item.id] || 0),
      }))
      .filter((item) => Number.isInteger(item.quantityReceived) && item.quantityReceived > 0);

    if (payloadItems.length === 0) {
      toast.error("At least one receipt quantity must be greater than zero");
      return;
    }

    try {
      setSaving(true);
      const response = await fetch("/api/scm/goods-receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseOrderId: selectedPurchaseOrder.id,
          note: receiptNote,
          items: payloadItems,
        }),
      });
      const created = await readJson<GoodsReceipt>(response, "Failed to post goods receipt");
      toast.success("Goods receipt posted");
      router.push(`/admin/scm/goods-receipts/${created.id}`);
      router.refresh();
    } catch (error: any) {
      toast.error(error?.message || "Failed to post goods receipt");
    } finally {
      setSaving(false);
    }
  };

  if (!canManagePosting) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Forbidden</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            You do not have permission to post goods receipts.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <ScmSectionHeader
        title="Post Goods Receipt"
        description="Use the guided inbound workflow to select an approved PO, confirm quantities, and create the GRN cleanly."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/scm/goods-receipts">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back To Register
              </Link>
            </Button>
            <Button variant="outline" onClick={() => void loadPurchaseOrders()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <ScmStatCard label="Ready To Receive" value={String(summary.readyToReceive)} hint="Approved or partially received PO" icon={PackageCheck} />
        <ScmStatCard label="Partial PO" value={String(summary.partiallyReceived)} hint="Need another inbound receipt" icon={ClipboardCheck} />
        <ScmStatCard label="Open Units" value={String(summary.linesOpen)} hint="Remaining units on selected PO" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Step 1: Select Approved Purchase Order</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Purchase Order</Label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2"
              value={selectedPurchaseOrderId}
              onChange={(event) => setSelectedPurchaseOrderId(event.target.value)}
            >
              <option value="">Select approved purchase order</option>
              {eligiblePurchaseOrders.map((purchaseOrder) => (
                <option key={purchaseOrder.id} value={purchaseOrder.id}>
                  {purchaseOrder.poNumber} • {purchaseOrder.supplier.name} • {purchaseOrder.warehouse.code}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-muted-foreground">
            Only approved or partially received purchase orders are eligible for GRN posting.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 2: Confirm Receipt Quantities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading eligible purchase orders...</p>
          ) : !selectedPurchaseOrder ? (
            <p className="text-sm text-muted-foreground">
              Select an approved purchase order first. Then the system will open the receiving lines below.
            </p>
          ) : (
            <>
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                {selectedPurchaseOrder.supplier.name} • {selectedPurchaseOrder.warehouse.name} • {selectedPurchaseOrder.status}
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Ordered</TableHead>
                      <TableHead>Received</TableHead>
                      <TableHead>Remaining</TableHead>
                      <TableHead>Receive Now</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPurchaseOrder.items.map((item) => {
                      const remaining = Math.max(item.quantityOrdered - item.quantityReceived, 0);
                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium">{item.productVariant.product.name}</div>
                            <div className="text-xs text-muted-foreground">{item.productVariant.sku}</div>
                          </TableCell>
                          <TableCell>{item.quantityOrdered}</TableCell>
                          <TableCell>{item.quantityReceived}</TableCell>
                          <TableCell>{remaining}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              max={remaining}
                              value={quantityDraft[item.id] ?? "0"}
                              onChange={(event) =>
                                setQuantityDraft((prev) => ({ ...prev, [item.id]: event.target.value }))
                              }
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 3: Add Receipt Context</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Receipt Note</Label>
            <Textarea
              rows={4}
              value={receiptNote}
              onChange={(event) => setReceiptNote(event.target.value)}
              placeholder="Optional inbound note, delivery observation, or condition summary"
            />
          </div>
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            After posting, the receipt will enter the GRN register and can then move into requester confirmation,
            attachment upload, and vendor evaluation workflow.
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/admin/scm/goods-receipts")}>
              Cancel
            </Button>
            <Button onClick={() => void postReceipt()} disabled={saving || !selectedPurchaseOrder}>
              {saving ? "Posting..." : "Post Goods Receipt"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
