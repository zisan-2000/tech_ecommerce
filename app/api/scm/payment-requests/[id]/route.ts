import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  generateSupplierPaymentNumber,
  syncSupplierInvoicePaymentStatus,
  toDecimalAmount,
  toPaymentRequestLogSnapshot,
  toSupplierPaymentLogSnapshot,
} from "@/lib/scm";
import { evaluateSupplierInvoiceApControls } from "@/lib/supplier-sla";
import {
  createPaymentRequestWorkflowNotifications,
  dispatchPaymentRequestEmailNotifications,
} from "@/lib/payment-request-notifications";
import {
  createSupplierPortalNotifications,
  dispatchSupplierPortalEmailNotifications,
} from "@/lib/supplier-portal-notifications";

const PAYMENT_REQUEST_READ_PERMISSIONS = [
  "payment_requests.read",
  "payment_requests.manage",
  "payment_requests.approve_admin",
  "payment_requests.approve_finance",
  "payment_requests.treasury",
  "payment_reports.read",
] as const;

function toCleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function hasOwn(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function canReadPaymentRequests(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasAny([...PAYMENT_REQUEST_READ_PERMISSIONS]);
}

function hasGlobalPaymentScope(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return PAYMENT_REQUEST_READ_PERMISSIONS.some((permission) => access.hasGlobal(permission));
}

function canApproveAdmin(access: Awaited<ReturnType<typeof getAccessContext>>, warehouseId?: number | null) {
  if (warehouseId) {
    return access.can("payment_requests.approve_admin", warehouseId);
  }
  return access.hasGlobal("payment_requests.approve_admin");
}

function canApproveFinance(access: Awaited<ReturnType<typeof getAccessContext>>, warehouseId?: number | null) {
  if (warehouseId) {
    return access.can("payment_requests.approve_finance", warehouseId);
  }
  return access.hasGlobal("payment_requests.approve_finance");
}

function canTreasuryProcess(access: Awaited<ReturnType<typeof getAccessContext>>, warehouseId?: number | null) {
  if (warehouseId) {
    return access.can("payment_requests.treasury", warehouseId);
  }
  return access.hasGlobal("payment_requests.treasury");
}

function passesFinanceAuthorityMatrix(amount: Prisma.Decimal, access: Awaited<ReturnType<typeof getAccessContext>>) {
  const value = Number(amount.toString() || "0");
  if (value > 1_000_000) {
    return access.has("settings.manage") || access.hasGlobal("settings.manage");
  }
  if (value > 300_000) {
    return access.hasGlobal("payment_requests.approve_finance");
  }
  return true;
}

async function resolveUsersByPermission(
  tx: Prisma.TransactionClient,
  permissionKeys: string[],
  warehouseId?: number | null,
) {
  if (permissionKeys.length === 0) {
    return [] as Array<{ id: string; email: string }>;
  }

  return tx.user.findMany({
    where: {
      userRoles: {
        some: {
          OR:
            warehouseId && Number.isInteger(warehouseId)
              ? [{ scopeType: "GLOBAL" }, { scopeType: "WAREHOUSE", warehouseId }]
              : [{ scopeType: "GLOBAL" }],
          role: {
            rolePermissions: {
              some: {
                permission: {
                  key: { in: permissionKeys },
                },
              },
            },
          },
        },
      },
    },
    select: {
      id: true,
      email: true,
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}

async function resolveSupplierPortalRecipients(
  tx: Prisma.TransactionClient,
  supplierId: number,
) {
  const [supplier, portalAccesses] = await Promise.all([
    tx.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, email: true, name: true, code: true },
    }),
    tx.supplierPortalAccess.findMany({
      where: { supplierId, status: "ACTIVE" },
      select: {
        userId: true,
        user: { select: { id: true, email: true } },
      },
    }),
  ]);

  const recipients: Array<{ userId: string | null; recipientEmail: string | null }> =
    portalAccesses.map((row) => ({
    userId: row.userId,
    recipientEmail: row.user?.email ?? null,
    }));

  if (supplier?.email && !recipients.some((row) => row.recipientEmail === supplier.email)) {
    recipients.push({ userId: null, recipientEmail: supplier.email });
  }

  return { supplier, recipients };
}

const paymentRequestInclude = {
  supplier: { select: { id: true, name: true, code: true, currency: true } },
  warehouse: { select: { id: true, name: true, code: true } },
  purchaseOrder: {
    select: {
      id: true,
      poNumber: true,
      supplierId: true,
      purchaseRequisition: {
        select: {
          id: true,
          requisitionNumber: true,
          status: true,
        },
      },
      sourceComparativeStatement: {
        select: {
          id: true,
          csNumber: true,
          status: true,
          rfq: {
            select: {
              id: true,
              rfqNumber: true,
              status: true,
            },
          },
        },
      },
    },
  },
  comparativeStatement: {
    select: {
      id: true,
      csNumber: true,
      status: true,
      rfq: {
        select: {
          id: true,
          rfqNumber: true,
          status: true,
          purchaseRequisition: {
            select: {
              id: true,
              requisitionNumber: true,
              status: true,
            },
          },
        },
      },
    },
  },
  goodsReceipt: {
    select: {
      id: true,
      receiptNumber: true,
      status: true,
      purchaseOrderId: true,
    },
  },
  supplierInvoice: {
    select: {
      id: true,
      invoiceNumber: true,
      total: true,
      status: true,
      purchaseOrder: {
        select: {
          id: true,
          poNumber: true,
          purchaseRequisition: {
            select: {
              id: true,
              requisitionNumber: true,
              status: true,
            },
          },
          sourceComparativeStatement: {
            select: {
              id: true,
              csNumber: true,
              status: true,
              rfq: {
                select: {
                  id: true,
                  rfqNumber: true,
                  status: true,
                },
              },
            },
          },
        },
      },
    },
  },
  supplierPayment: { select: { id: true, paymentNumber: true, paymentDate: true, amount: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  managerApprovedBy: { select: { id: true, name: true, email: true } },
  financeApprovedBy: { select: { id: true, name: true, email: true } },
  treasuryProcessedBy: { select: { id: true, name: true, email: true } },
  rejectedBy: { select: { id: true, name: true, email: true } },
  cancelledBy: { select: { id: true, name: true, email: true } },
  approvalEvents: {
    include: { actedBy: { select: { id: true, name: true, email: true } } },
    orderBy: [{ actedAt: "asc" }, { id: "asc" }],
  },
  notifications: {
    include: { recipientUser: { select: { id: true, name: true, email: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  },
} satisfies Prisma.PaymentRequestInclude;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canReadPaymentRequests(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid payment request." }, { status: 400 });
    }

    const requestRow = await prisma.paymentRequest.findUnique({
      where: { id },
      include: paymentRequestInclude,
    });

    if (!requestRow) {
      return NextResponse.json({ error: "Payment request not found." }, { status: 404 });
    }

    if (!hasGlobalPaymentScope(access)) {
      if (requestRow.warehouseId && access.canAccessWarehouse(requestRow.warehouseId)) {
        return NextResponse.json(requestRow);
      }
      if (requestRow.createdById === access.userId) {
        return NextResponse.json(requestRow);
      }
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(requestRow);
  } catch (error) {
    console.error("PAYMENT REQUEST GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load payment request." }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid payment request." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown> & {
      action?: string;
    };
    const action = toCleanText(body.action, 40).toLowerCase();

    const current = await prisma.paymentRequest.findUnique({
      where: { id },
      include: {
        supplierInvoice: {
          select: {
            id: true,
            supplierId: true,
            total: true,
            status: true,
            payments: { select: { amount: true } },
            ledgerEntries: {
              where: { entryType: "ADJUSTMENT", direction: "CREDIT" },
              select: { amount: true },
            },
          },
        },
      },
    });
    if (!current) {
      return NextResponse.json({ error: "Payment request not found." }, { status: 404 });
    }

    if (!hasGlobalPaymentScope(access)) {
      if (current.warehouseId && access.canAccessWarehouse(current.warehouseId)) {
        // allow
      } else if (current.createdById === access.userId) {
        // allow
      } else {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const beforeSnapshot = toPaymentRequestLogSnapshot(current);

    if (!action || action === "update") {
      if (!access.hasAny(["payment_requests.manage"])) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (current.status !== "DRAFT") {
        return NextResponse.json({ error: "Only draft requests can be updated." }, { status: 400 });
      }

      const updateData: Prisma.PaymentRequestUpdateInput = {};
      if (hasOwn(body, "note")) {
        updateData.note = toCleanText(body.note, 500) || null;
      }
      if (hasOwn(body, "referenceNumber")) {
        updateData.referenceNumber = toCleanText(body.referenceNumber, 120) || null;
      }
      if (hasOwn(body, "amount")) {
        const amount = toDecimalAmount(body.amount, "Amount");
        if (amount.lte(0)) {
          return NextResponse.json({ error: "Amount must be greater than 0." }, { status: 400 });
        }
        updateData.amount = amount;
      }

      const updated = await prisma.paymentRequest.update({
        where: { id },
        data: updateData,
        include: paymentRequestInclude,
      });

      await logActivity({
        action: "update",
        entity: "payment_request",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Updated payment request ${updated.prfNumber}`,
        },
        before: beforeSnapshot,
        after: toPaymentRequestLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "submit") {
      if (!access.hasAny(["payment_requests.manage"])) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (current.status !== "DRAFT") {
        return NextResponse.json({ error: "Only draft requests can be submitted." }, { status: 400 });
      }

      const { updated, emailNotificationIds } = await prisma.$transaction(async (tx) => {
        const next = await tx.paymentRequest.update({
          where: { id },
          data: {
            status: "SUBMITTED",
            approvalStage: "MANAGER_REVIEW",
            submittedAt: new Date(),
            rejectedAt: null,
            cancelledAt: null,
            rejectedById: null,
            cancelledById: null,
          },
          include: paymentRequestInclude,
        });

        await tx.paymentRequestApprovalEvent.create({
          data: {
            paymentRequestId: next.id,
            stage: "SUBMISSION",
            decision: "SUBMITTED",
            note: toCleanText(body.note, 255) || null,
            actedById: access.userId,
          },
        });

        const recipients = await resolveUsersByPermission(
          tx,
          ["payment_requests.approve_admin"],
          next.warehouseId ?? undefined,
        );

        const ids = await createPaymentRequestWorkflowNotifications({
          tx,
          paymentRequestId: next.id,
          stage: "SUBMISSION",
          recipients: recipients.map((recipient) => ({
            userId: recipient.id,
            recipientEmail: recipient.email,
          })),
          message: `Payment request ${next.prfNumber} submitted and waiting for Manager-Administration approval.`,
          metadata: {
            prfNumber: next.prfNumber,
            status: next.status,
            approvalStage: next.approvalStage,
          },
          createdById: access.userId,
        });

        return { updated: next, emailNotificationIds: ids };
      });

      void dispatchPaymentRequestEmailNotifications(emailNotificationIds);

      await logActivity({
        action: "submit",
        entity: "payment_request",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Submitted payment request ${updated.prfNumber}`,
        },
        before: beforeSnapshot,
        after: toPaymentRequestLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "manager_approve") {
      if (!canApproveAdmin(access, current.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (current.status !== "SUBMITTED") {
        return NextResponse.json({ error: "Manager approval requires SUBMITTED status." }, { status: 400 });
      }

      const { updated, emailNotificationIds } = await prisma.$transaction(async (tx) => {
        const next = await tx.paymentRequest.update({
          where: { id },
          data: {
            status: "MANAGER_APPROVED",
            approvalStage: "FINANCE_REVIEW",
            managerApprovedAt: new Date(),
            managerApprovedById: access.userId,
          },
          include: paymentRequestInclude,
        });

        await tx.paymentRequestApprovalEvent.create({
          data: {
            paymentRequestId: next.id,
            stage: "MANAGER_REVIEW",
            decision: "APPROVED",
            note: toCleanText(body.note, 255) || null,
            actedById: access.userId,
          },
        });

        const recipients = await resolveUsersByPermission(
          tx,
          ["payment_requests.approve_finance"],
          next.warehouseId ?? undefined,
        );

        const ids = await createPaymentRequestWorkflowNotifications({
          tx,
          paymentRequestId: next.id,
          stage: "MANAGER_REVIEW",
          recipients: recipients.map((recipient) => ({
            userId: recipient.id,
            recipientEmail: recipient.email,
          })),
          message: `Payment request ${next.prfNumber} passed manager approval and is waiting for Manager-Finance review.`,
          metadata: {
            prfNumber: next.prfNumber,
            status: next.status,
            approvalStage: next.approvalStage,
          },
          createdById: access.userId,
        });

        return { updated: next, emailNotificationIds: ids };
      });

      void dispatchPaymentRequestEmailNotifications(emailNotificationIds);

      await logActivity({
        action: "approve",
        entity: "payment_request",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Manager approved payment request ${updated.prfNumber}`,
        },
        before: beforeSnapshot,
        after: toPaymentRequestLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "finance_approve") {
      if (!canApproveFinance(access, current.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (current.status !== "MANAGER_APPROVED") {
        return NextResponse.json({ error: "Finance approval requires MANAGER_APPROVED status." }, { status: 400 });
      }
      if (!passesFinanceAuthorityMatrix(current.amount, access)) {
        return NextResponse.json(
          { error: "Final finance approval denied by authority matrix for this amount." },
          { status: 400 },
        );
      }

      const { updated, emailNotificationIds } = await prisma.$transaction(async (tx) => {
        const next = await tx.paymentRequest.update({
          where: { id },
          data: {
            status: "FINANCE_APPROVED",
            approvalStage: "TREASURY",
            financeApprovedAt: new Date(),
            financeApprovedById: access.userId,
          },
          include: paymentRequestInclude,
        });

        await tx.paymentRequestApprovalEvent.create({
          data: {
            paymentRequestId: next.id,
            stage: "FINANCE_REVIEW",
            decision: "APPROVED",
            note: toCleanText(body.note, 255) || null,
            actedById: access.userId,
          },
        });

        const recipients = await resolveUsersByPermission(
          tx,
          ["payment_requests.treasury"],
          next.warehouseId ?? undefined,
        );

        const ids = await createPaymentRequestWorkflowNotifications({
          tx,
          paymentRequestId: next.id,
          stage: "FINANCE_REVIEW",
          recipients: recipients.map((recipient) => ({
            userId: recipient.id,
            recipientEmail: recipient.email,
          })),
          message: `Payment request ${next.prfNumber} approved by finance. Treasury processing is required.`,
          metadata: {
            prfNumber: next.prfNumber,
            status: next.status,
            approvalStage: next.approvalStage,
          },
          createdById: access.userId,
        });

        return { updated: next, emailNotificationIds: ids };
      });

      void dispatchPaymentRequestEmailNotifications(emailNotificationIds);

      await logActivity({
        action: "approve",
        entity: "payment_request",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Finance approved payment request ${updated.prfNumber}`,
        },
        before: beforeSnapshot,
        after: toPaymentRequestLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "treasury_start") {
      if (!canTreasuryProcess(access, current.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!["FINANCE_APPROVED", "TREASURY_PROCESSING"].includes(current.status)) {
        return NextResponse.json({ error: "Treasury processing requires FINANCE_APPROVED status." }, { status: 400 });
      }

      const updated = await prisma.paymentRequest.update({
        where: { id },
        data: {
          status: "TREASURY_PROCESSING",
          approvalStage: "TREASURY",
          treasuryProcessedAt: new Date(),
          treasuryProcessedById: access.userId,
        },
        include: paymentRequestInclude,
      });

      await prisma.paymentRequestApprovalEvent.create({
        data: {
          paymentRequestId: updated.id,
          stage: "TREASURY",
          decision: "APPROVED",
          note: toCleanText(body.note, 255) || null,
          actedById: access.userId,
        },
      });

      await logActivity({
        action: "update",
        entity: "payment_request",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Treasury started processing ${updated.prfNumber}`,
        },
        before: beforeSnapshot,
        after: toPaymentRequestLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "mark_paid") {
      if (!canTreasuryProcess(access, current.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!["FINANCE_APPROVED", "TREASURY_PROCESSING"].includes(current.status)) {
        return NextResponse.json({ error: "Treasury payment requires finance approval." }, { status: 400 });
      }

      const paymentDate = body.paymentDate ? new Date(String(body.paymentDate)) : new Date();
      if (Number.isNaN(paymentDate.getTime())) {
        return NextResponse.json({ error: "Invalid payment date." }, { status: 400 });
      }
      const amount = toDecimalAmount(body.amount ?? current.amount, "Payment amount");
      if (amount.lte(0)) {
        return NextResponse.json({ error: "Payment amount must be greater than 0." }, { status: 400 });
      }
      const method = (toCleanText(body.method, 40) || "BANK_TRANSFER") as any;
      const reference = toCleanText(body.reference, 120) || null;
      const note = toCleanText(body.note, 500) || null;
      const holdOverrideRequested = body.holdOverride === true;
      const holdOverrideNote = toCleanText(body.holdOverrideNote, 500);

      const { updated, supplierEmailNotificationIds } = await prisma.$transaction(async (tx) => {
        if (current.supplierInvoiceId) {
          const reEvaluatedInvoice = await evaluateSupplierInvoiceApControls(
            tx,
            current.supplierInvoiceId,
            access.userId,
          );

          if (reEvaluatedInvoice.paymentHoldStatus === "HELD") {
            if (!holdOverrideRequested) {
              throw new Error(
                reEvaluatedInvoice.paymentHoldReason ||
                  "Payment is blocked by SLA/AP hold policy. Use an override note if policy allows.",
              );
            }
            if (!access.hasGlobal("supplier_payments.override_hold")) {
              throw new Error(
                "You do not have permission to override held supplier invoice payments.",
              );
            }
            if (holdOverrideNote.trim().length < 3) {
              throw new Error("Hold override note (minimum 3 characters) is required.");
            }

            const activePolicy = await tx.supplierSlaPolicy.findFirst({
              where: { supplierId: current.supplierId, isActive: true },
              orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
              include: {
                financialRule: { select: { allowPaymentHoldOverride: true } },
              },
            });
            if (activePolicy?.financialRule && !activePolicy.financialRule.allowPaymentHoldOverride) {
              throw new Error(
                "Payment hold override is disabled by current supplier SLA financial rule.",
              );
            }

            await tx.supplierInvoice.update({
              where: { id: current.supplierInvoiceId },
              data: {
                paymentHoldStatus: "OVERRIDDEN",
                paymentHoldReleasedAt: new Date(),
                paymentHoldReleasedById: access.userId,
                paymentHoldOverrideNote: holdOverrideNote,
              },
            });
          }

          const latestInvoiceBalance = await tx.supplierInvoice.findUnique({
            where: { id: current.supplierInvoiceId },
            select: {
              status: true,
              total: true,
              payments: { select: { amount: true } },
              ledgerEntries: {
                where: { entryType: "ADJUSTMENT", direction: "CREDIT" },
                select: { amount: true },
              },
            },
          });
          if (!latestInvoiceBalance) {
            throw new Error("Supplier invoice not found.");
          }
          if (latestInvoiceBalance.status === "CANCELLED") {
            throw new Error("Cannot post payment against a cancelled supplier invoice.");
          }
          if (latestInvoiceBalance.status === "PAID") {
            throw new Error("Supplier invoice is already fully settled.");
          }

          const paidSoFar = latestInvoiceBalance.payments.reduce(
            (sum, item) => sum.plus(item.amount),
            new Prisma.Decimal(0),
          );
          const adjustmentCredit = latestInvoiceBalance.ledgerEntries.reduce(
            (sum, entry) => sum.plus(entry.amount),
            new Prisma.Decimal(0),
          );
          const outstanding = latestInvoiceBalance.total
            .minus(paidSoFar)
            .minus(adjustmentCredit);
          if (amount.gt(outstanding)) {
            throw new Error("Payment exceeds the invoice outstanding amount.");
          }
        }

        const paymentNumber = await generateSupplierPaymentNumber(tx);
        const payment = await tx.supplierPayment.create({
          data: {
            paymentNumber,
            supplierId: current.supplierId,
            supplierInvoiceId: current.supplierInvoiceId,
            paymentDate,
            createdById: access.userId,
            amount,
            currency: current.currency,
            method,
            reference,
            note,
          },
        });

        await tx.supplierLedgerEntry.create({
          data: {
            supplierId: current.supplierId,
            entryDate: paymentDate,
            entryType: "PAYMENT",
            direction: "CREDIT",
            amount,
            currency: payment.currency,
            note: payment.note,
            referenceType: "SUPPLIER_PAYMENT",
            referenceNumber: payment.paymentNumber,
            supplierInvoiceId: current.supplierInvoiceId,
            supplierPaymentId: payment.id,
            createdById: access.userId,
          },
        });

        if (current.supplierInvoiceId) {
          await syncSupplierInvoicePaymentStatus(tx, current.supplierInvoiceId);
        }

        const next = await tx.paymentRequest.update({
          where: { id },
          data: {
            status: "PAID",
            approvalStage: "PAID",
            paidAt: new Date(),
            treasuryProcessedAt: new Date(),
            treasuryProcessedById: access.userId,
            supplierPaymentId: payment.id,
          },
          include: paymentRequestInclude,
        });

        await tx.paymentRequestApprovalEvent.create({
          data: {
            paymentRequestId: next.id,
            stage: "PAID",
            decision: "PAID",
            note: toCleanText(body.note, 255) || null,
            actedById: access.userId,
          },
        });

        const supplierRecipients = await resolveSupplierPortalRecipients(tx, next.supplierId);
        const supplierNotificationIds = await createSupplierPortalNotifications({
          tx,
          notifications: supplierRecipients.recipients.map((recipient) => ({
            supplierId: next.supplierId,
            userId: recipient.userId ?? null,
            type: "PAYMENT",
            title: `Payment posted: ${next.prfNumber}`,
            message: `Payment ${payment.paymentNumber} has been posted against PRF ${next.prfNumber}.`,
            recipientEmail: recipient.recipientEmail ?? null,
            metadata: {
              prfNumber: next.prfNumber,
              paymentNumber: payment.paymentNumber,
              amount: payment.amount.toString(),
              currency: payment.currency,
              supplierName: supplierRecipients.supplier?.name ?? null,
            },
            createdById: access.userId,
          })),
        });

        return { updated: next, supplierEmailNotificationIds: supplierNotificationIds };
      });

      void dispatchSupplierPortalEmailNotifications(supplierEmailNotificationIds);

      await logActivity({
        action: "update",
        entity: "payment_request",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Treasury posted payment for ${updated.prfNumber}`,
        },
        before: beforeSnapshot,
        after: toPaymentRequestLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "reject") {
      if (
        !canApproveAdmin(access, current.warehouseId) &&
        !canApproveFinance(access, current.warehouseId) &&
        !canTreasuryProcess(access, current.warehouseId)
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (["PAID", "CANCELLED"].includes(current.status)) {
        return NextResponse.json({ error: "Paid or cancelled requests cannot be rejected." }, { status: 400 });
      }

      const updated = await prisma.paymentRequest.update({
        where: { id },
        data: {
          status: "REJECTED",
          approvalStage: "REJECTION",
          rejectedAt: new Date(),
          rejectedById: access.userId,
        },
        include: paymentRequestInclude,
      });

      await prisma.paymentRequestApprovalEvent.create({
        data: {
          paymentRequestId: updated.id,
          stage: "REJECTION",
          decision: "REJECTED",
          note: toCleanText(body.note, 255) || null,
          actedById: access.userId,
        },
      });

      await logActivity({
        action: "reject",
        entity: "payment_request",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Rejected payment request ${updated.prfNumber}`,
        },
        before: beforeSnapshot,
        after: toPaymentRequestLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "cancel") {
      if (!access.hasAny(["payment_requests.manage"])) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!["DRAFT", "SUBMITTED"].includes(current.status)) {
        return NextResponse.json({ error: "Only draft or submitted requests can be cancelled." }, { status: 400 });
      }

      const updated = await prisma.paymentRequest.update({
        where: { id },
        data: {
          status: "CANCELLED",
          approvalStage: "CANCELLATION",
          cancelledAt: new Date(),
          cancelledById: access.userId,
        },
        include: paymentRequestInclude,
      });

      await prisma.paymentRequestApprovalEvent.create({
        data: {
          paymentRequestId: updated.id,
          stage: "CANCELLATION",
          decision: "CANCELLED",
          note: toCleanText(body.note, 255) || null,
          actedById: access.userId,
        },
      });

      await logActivity({
        action: "cancel",
        entity: "payment_request",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Cancelled payment request ${updated.prfNumber}`,
        },
        before: beforeSnapshot,
        after: toPaymentRequestLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error: any) {
    console.error("PAYMENT REQUEST PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update payment request." },
      { status: 500 },
    );
  }
}
