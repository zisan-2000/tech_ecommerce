import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  supplierInvoiceInclude,
  toSupplierInvoiceLogSnapshot,
} from "@/lib/scm";

const supplierInvoiceVoidInclude = {
  ...supplierInvoiceInclude,
  payments: {
    select: {
      id: true,
      paymentNumber: true,
      amount: true,
      paymentDate: true,
    },
    orderBy: { paymentDate: "desc" as const },
  },
  ledgerEntries: {
    select: {
      id: true,
      entryType: true,
      direction: true,
      amount: true,
      referenceType: true,
      referenceNumber: true,
    },
  },
  paymentRequests: {
    select: {
      id: true,
      prfNumber: true,
      status: true,
    },
  },
  supplierReturns: {
    select: {
      id: true,
      returnNumber: true,
      status: true,
    },
  },
} satisfies Prisma.SupplierInvoiceInclude;

function cleanText(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supplierInvoiceId = Number(id);
    if (!Number.isInteger(supplierInvoiceId) || supplierInvoiceId <= 0) {
      return NextResponse.json({ error: "Invalid supplier invoice id." }, { status: 400 });
    }

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
      action?: unknown;
      note?: unknown;
    };
    const action = cleanText(body.action, 40).toLowerCase();
    const note = cleanText(body.note, 1000);

    if (action !== "void") {
      return NextResponse.json({ error: "Unsupported action. Use: void." }, { status: 400 });
    }
    if (note.length < 3) {
      return NextResponse.json(
        { error: "Void note (minimum 3 characters) is required." },
        { status: 400 },
      );
    }

    const before = await prisma.supplierInvoice.findUnique({
      where: { id: supplierInvoiceId },
      include: supplierInvoiceVoidInclude,
    });
    if (!before) {
      return NextResponse.json({ error: "Supplier invoice not found." }, { status: 404 });
    }
    if (before.status === "CANCELLED") {
      return NextResponse.json({ error: "Supplier invoice is already voided." }, { status: 400 });
    }
    if (before.payments.length > 0) {
      return NextResponse.json(
        { error: "Paid invoices cannot be voided. Reverse the payment first." },
        { status: 400 },
      );
    }
    if (
      before.paymentRequests.some((requestRow) =>
        ["SUBMITTED", "MANAGER_APPROVED", "FINANCE_APPROVED", "PAID"].includes(requestRow.status),
      )
    ) {
      return NextResponse.json(
        { error: "Invoice has an active or paid payment request and cannot be voided." },
        { status: 400 },
      );
    }
    if (before.supplierReturns.some((returnRow) => returnRow.status !== "CANCELLED")) {
      return NextResponse.json(
        { error: "Invoice has an active supplier return and cannot be voided." },
        { status: 400 },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const latest = await tx.supplierInvoice.findUnique({
        where: { id: supplierInvoiceId },
        include: supplierInvoiceVoidInclude,
      });
      if (!latest) throw new Error("Supplier invoice not found.");
      if (latest.status === "CANCELLED") {
        throw new Error("Supplier invoice is already voided.");
      }
      if (latest.payments.length > 0) {
        throw new Error("Paid invoices cannot be voided. Reverse the payment first.");
      }

      const invoiceDebit = latest.ledgerEntries
        .filter((entry) => entry.entryType === "INVOICE" && entry.direction === "DEBIT")
        .reduce((sum, entry) => sum.plus(entry.amount), new Prisma.Decimal(0));
      const existingCredits = latest.ledgerEntries
        .filter((entry) => entry.direction === "CREDIT")
        .reduce((sum, entry) => sum.plus(entry.amount), new Prisma.Decimal(0));
      const reversalAmount = invoiceDebit.minus(existingCredits);

      if (reversalAmount.gt(0)) {
        await tx.supplierLedgerEntry.create({
          data: {
            supplierId: latest.supplierId,
            entryDate: new Date(),
            entryType: "ADJUSTMENT",
            direction: "CREDIT",
            amount: reversalAmount,
            currency: latest.currency,
            note: `Voided supplier invoice ${latest.invoiceNumber}. ${note}`,
            referenceType: "SUPPLIER_INVOICE_VOID",
            referenceNumber: latest.invoiceNumber,
            purchaseOrderId: latest.purchaseOrderId,
            supplierInvoiceId: latest.id,
            createdById: access.userId,
          },
        });
      }

      await tx.supplierInvoice.update({
        where: { id: latest.id },
        data: {
          status: "CANCELLED",
          paymentHoldStatus: "CLEAR",
          paymentHoldReason: null,
          paymentHoldAt: null,
          paymentHoldReleasedAt: null,
          paymentHoldReleasedById: null,
          paymentHoldOverrideNote: null,
          note: latest.note ? `${latest.note}\nVoid note: ${note}` : `Void note: ${note}`,
        },
      });

      return tx.supplierInvoice.findUniqueOrThrow({
        where: { id: latest.id },
        include: supplierInvoiceInclude,
      });
    });

    await logActivity({
      action: "void",
      entity: "supplier_invoice",
      entityId: updated.id,
      access,
      request,
      metadata: {
        message: `Voided supplier invoice ${updated.invoiceNumber}`,
        note,
      },
      before: toSupplierInvoiceLogSnapshot(before),
      after: toSupplierInvoiceLogSnapshot(updated),
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("SUPPLIER INVOICE PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update supplier invoice." },
      { status: 500 },
    );
  }
}
