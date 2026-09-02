import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  generateSupplierInvoiceNumber,
  refreshSupplierInvoiceThreeWayMatch,
  supplierInvoiceInclude,
  toDecimalAmount,
  toSupplierInvoiceLogSnapshot,
} from "@/lib/scm";
import { evaluateSupplierInvoiceApControls } from "@/lib/supplier-sla";

function toCleanText(value: unknown, max = 255) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canReadSupplierInvoices(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasGlobal("supplier_ledger.read") || access.hasGlobal("supplier_invoices.read") || access.hasGlobal("supplier_invoices.manage");
}

const supplierInvoiceListInclude = {
  ...supplierInvoiceInclude,
  ledgerEntries: {
    where: {
      entryType: "ADJUSTMENT" as const,
      direction: "CREDIT" as const,
    },
    select: {
      amount: true,
    },
  },
} satisfies Prisma.SupplierInvoiceInclude;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canReadSupplierInvoices(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supplierId = Number(request.nextUrl.searchParams.get("supplierId") || "");
    const status = request.nextUrl.searchParams.get("status")?.trim() || "";
    const invoices = await prisma.supplierInvoice.findMany({
      where: {
        ...(Number.isInteger(supplierId) && supplierId > 0 ? { supplierId } : {}),
        ...(status ? { status: status as any } : {}),
      },
      orderBy: [{ issueDate: "desc" }, { id: "desc" }],
      include: supplierInvoiceListInclude,
    });

    return NextResponse.json(invoices);
  } catch (error) {
    console.error("SUPPLIER INVOICES GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load supplier invoices." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.hasGlobal("supplier_invoices.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      supplierId?: unknown;
      purchaseOrderId?: unknown;
      issueDate?: unknown;
      dueDate?: unknown;
      subtotal?: unknown;
      taxTotal?: unknown;
      otherCharges?: unknown;
      total?: unknown;
      currency?: unknown;
      note?: unknown;
      items?: Array<{
        purchaseOrderItemId?: unknown;
        productVariantId?: unknown;
        quantityInvoiced?: unknown;
        unitCost?: unknown;
        description?: unknown;
      }>;
    };

    const supplierId = Number(body.supplierId);
    const purchaseOrderId =
      body.purchaseOrderId === null || body.purchaseOrderId === undefined || body.purchaseOrderId === ""
        ? null
        : Number(body.purchaseOrderId);

    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      return NextResponse.json({ error: "Supplier is required." }, { status: 400 });
    }
    if (purchaseOrderId !== null && (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0)) {
      return NextResponse.json({ error: "Invalid purchase order." }, { status: 400 });
    }

    const issueDate = body.issueDate ? new Date(String(body.issueDate)) : new Date();
    const dueDate = body.dueDate ? new Date(String(body.dueDate)) : null;
    if (Number.isNaN(issueDate.getTime()) || (dueDate && Number.isNaN(dueDate.getTime()))) {
      return NextResponse.json({ error: "Invalid invoice date." }, { status: 400 });
    }

    const subtotal = toDecimalAmount(body.subtotal ?? 0, "Subtotal");
    const taxTotal = toDecimalAmount(body.taxTotal ?? 0, "Tax total");
    const otherCharges = toDecimalAmount(body.otherCharges ?? 0, "Other charges");
    const requestedTotal =
      body.total === null || body.total === undefined || body.total === ""
        ? null
        : toDecimalAmount(body.total, "Total");

    const [supplier, purchaseOrder] = await Promise.all([
      prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true, name: true, code: true, currency: true },
      }),
      purchaseOrderId
        ? prisma.purchaseOrder.findUnique({
            where: { id: purchaseOrderId },
            include: {
              items: {
                orderBy: { id: "asc" },
                include: {
                  productVariant: {
                    select: {
                      id: true,
                      productId: true,
                      sku: true,
                      product: {
                        select: {
                          name: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          })
        : Promise.resolve(null),
    ]);

    if (!supplier) {
      return NextResponse.json({ error: "Supplier not found." }, { status: 404 });
    }
    if (purchaseOrderId && !purchaseOrder) {
      return NextResponse.json({ error: "Purchase order not found." }, { status: 404 });
    }
    if (purchaseOrder && purchaseOrder.supplierId !== supplierId) {
      return NextResponse.json(
        { error: "Selected purchase order does not belong to the supplier." },
        { status: 400 },
      );
    }

    const requestedItems = Array.isArray(body.items) ? body.items : [];
    const normalizedItems =
      purchaseOrder && requestedItems.length === 0
        ? purchaseOrder.items
            .filter((item) => item.quantityReceived > 0)
            .map((item) => ({
              purchaseOrderItemId: item.id,
              productVariantId: item.productVariantId,
              quantityInvoiced: item.quantityReceived,
              unitCost: item.unitCost,
              description: `${item.productVariant.product.name} (${item.productVariant.sku})`,
            }))
        : requestedItems.map((item, index) => {
            const purchaseOrderItemId =
              item.purchaseOrderItemId === null ||
              item.purchaseOrderItemId === undefined ||
              item.purchaseOrderItemId === ""
                ? null
                : Number(item.purchaseOrderItemId);
            const productVariantId =
              item.productVariantId === null ||
              item.productVariantId === undefined ||
              item.productVariantId === ""
                ? null
                : Number(item.productVariantId);
            const quantityInvoiced = Number(item.quantityInvoiced);

            if (
              purchaseOrderItemId !== null &&
              (!Number.isInteger(purchaseOrderItemId) || purchaseOrderItemId <= 0)
            ) {
              throw new Error(`Item ${index + 1}: invalid purchase order item`);
            }
            if (
              productVariantId !== null &&
              (!Number.isInteger(productVariantId) || productVariantId <= 0)
            ) {
              throw new Error(`Item ${index + 1}: invalid product variant`);
            }
            if (!Number.isInteger(quantityInvoiced) || quantityInvoiced <= 0) {
              throw new Error(`Item ${index + 1}: quantity must be greater than 0`);
            }
            return {
              purchaseOrderItemId,
              productVariantId,
              quantityInvoiced,
              unitCost: toDecimalAmount(item.unitCost, `Item ${index + 1} unit cost`),
              description: toCleanText(item.description, 255),
            };
          });

    if (purchaseOrder && normalizedItems.length === 0) {
      return NextResponse.json(
        { error: "At least one matched invoice line is required for PO-linked invoices." },
        { status: 400 },
      );
    }

    const poItemMap = new Map(
      purchaseOrder?.items.map((item) => [item.id, item]) ?? [],
    );
    const invoiceLineItems = normalizedItems.map((item) => {
      const purchaseOrderItem =
        item.purchaseOrderItemId !== null && item.purchaseOrderItemId !== undefined
          ? poItemMap.get(item.purchaseOrderItemId)
          : purchaseOrder?.items.find(
              (candidate) => candidate.productVariantId === item.productVariantId,
            );

      if (purchaseOrder && !purchaseOrderItem) {
        throw new Error("Invoice line must map to a purchase order item.");
      }

      const productVariantId =
        item.productVariantId ??
        purchaseOrderItem?.productVariantId ??
        null;
      if (!productVariantId) {
        throw new Error("Invoice line is missing product variant mapping.");
      }

      const lineUnitCost =
        item.unitCost instanceof Prisma.Decimal
          ? item.unitCost
          : purchaseOrderItem?.unitCost ?? new Prisma.Decimal(0);

      return {
        purchaseOrderItemId: purchaseOrderItem?.id ?? item.purchaseOrderItemId ?? null,
        productVariantId,
        quantityInvoiced: item.quantityInvoiced,
        unitCost: lineUnitCost,
        lineTotal: lineUnitCost.mul(item.quantityInvoiced),
        description:
          item.description ||
          (purchaseOrderItem
            ? `${purchaseOrderItem.productVariant.product.name} (${purchaseOrderItem.productVariant.sku})`
            : null),
      };
    });

    const derivedSubtotal =
      invoiceLineItems.length > 0
        ? invoiceLineItems.reduce(
            (sum, item) => sum.plus(item.lineTotal),
            new Prisma.Decimal(0),
          )
        : subtotal;

    const normalizedSubtotal =
      body.subtotal === null || body.subtotal === undefined || body.subtotal === ""
        ? derivedSubtotal
        : subtotal;
    const normalizedTotal =
      requestedTotal === null
        ? normalizedSubtotal.plus(taxTotal).plus(otherCharges)
        : requestedTotal;

    if (normalizedTotal.lte(0)) {
      return NextResponse.json(
        { error: "Invoice total must be greater than 0." },
        { status: 400 },
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const invoiceNumber = await generateSupplierInvoiceNumber(tx);
      const invoice = await tx.supplierInvoice.create({
        data: {
          invoiceNumber,
          supplierId,
          purchaseOrderId,
          issueDate,
          dueDate,
          postedAt: new Date(),
          createdById: access.userId,
          currency: toCleanText(body.currency, 3).toUpperCase() || supplier.currency || "BDT",
          subtotal: normalizedSubtotal,
          taxTotal,
          otherCharges,
          total: normalizedTotal,
          note: toCleanText(body.note, 500) || null,
          items: invoiceLineItems.length > 0 ? { create: invoiceLineItems } : undefined,
        },
        include: supplierInvoiceInclude,
      });

      await tx.supplierLedgerEntry.create({
        data: {
          supplierId,
          entryDate: issueDate,
          entryType: "INVOICE",
          direction: "DEBIT",
          amount: normalizedTotal,
          currency: invoice.currency,
          note: invoice.note,
          referenceType: "SUPPLIER_INVOICE",
          referenceNumber: invoice.invoiceNumber,
          purchaseOrderId,
          supplierInvoiceId: invoice.id,
          createdById: access.userId,
        },
      });

      const matched = await refreshSupplierInvoiceThreeWayMatch(
        tx,
        invoice.id,
        access.userId,
      );

      await evaluateSupplierInvoiceApControls(tx, matched.invoice.id, access.userId);

      return tx.supplierInvoice.findUniqueOrThrow({
        where: { id: matched.invoice.id },
        include: supplierInvoiceInclude,
      });
    });

    await logActivity({
      action: "create",
      entity: "supplier_invoice",
      entityId: created.id,
      access,
      request,
      metadata: {
        message: `Created supplier invoice ${created.invoiceNumber}`,
      },
      after: toSupplierInvoiceLogSnapshot(created),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error("SUPPLIER INVOICES POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create supplier invoice." },
      { status: 500 },
    );
  }
}
