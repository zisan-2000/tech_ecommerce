import { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import { purchaseOrderInclude, toPurchaseOrderLogSnapshot } from "@/lib/scm";
import { resolvePurchaseOrderTermsTemplate } from "@/lib/purchase-order-terms";
import {
  createPurchaseOrderWorkflowNotifications,
  dispatchPurchaseOrderWorkflowEmailNotifications,
} from "@/lib/purchase-order-notifications";
import {
  createSupplierPortalNotifications,
  dispatchSupplierPortalEmailNotifications,
} from "@/lib/supplier-portal-notifications";

const purchaseOrderDetailInclude = {
  ...purchaseOrderInclude,
  supplierInvoices: {
    orderBy: [{ issueDate: "desc" as const }, { id: "desc" as const }],
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      total: true,
      payments: {
        orderBy: [{ paymentDate: "desc" as const }, { id: "desc" as const }],
        select: {
          id: true,
          paymentNumber: true,
          amount: true,
          paymentDate: true,
        },
      },
    },
  },
  paymentRequests: {
    orderBy: [{ requestedAt: "desc" as const }, { id: "desc" as const }],
    select: {
      id: true,
      prfNumber: true,
      status: true,
      amount: true,
      supplierPayment: {
        select: {
          id: true,
          paymentNumber: true,
          amount: true,
          paymentDate: true,
        },
      },
    },
  },
} satisfies Prisma.PurchaseOrderInclude;

const PURCHASE_ORDER_READ_PERMISSIONS = [
  "purchase_orders.read",
  "purchase_orders.manage",
  "purchase_orders.approve",
  "purchase_orders.approve_manager",
  "purchase_orders.approve_committee",
  "purchase_orders.approve_final",
  "goods_receipts.manage",
] as const;

function toCleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function hasOwn(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function canReadPurchaseOrders(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasAny([...PURCHASE_ORDER_READ_PERMISSIONS]);
}

function hasGlobalPurchaseOrderScope(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return PURCHASE_ORDER_READ_PERMISSIONS.some((permission) => access.hasGlobal(permission));
}

function hasManagerApprovalPermission(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  warehouseId: number,
) {
  return (
    access.can("purchase_orders.approve_manager", warehouseId) ||
    access.can("purchase_orders.approve", warehouseId)
  );
}

function hasCommitteeApprovalPermission(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  warehouseId: number,
) {
  return (
    access.can("purchase_orders.approve_committee", warehouseId) ||
    access.can("purchase_orders.approve", warehouseId)
  );
}

function hasFinalApprovalPermission(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  warehouseId: number,
) {
  return (
    access.can("purchase_orders.approve_final", warehouseId) ||
    access.can("purchase_orders.approve", warehouseId)
  );
}

function canCancelPurchaseOrder(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  warehouseId: number,
) {
  return (
    access.can("purchase_orders.manage", warehouseId) ||
    hasManagerApprovalPermission(access, warehouseId) ||
    hasCommitteeApprovalPermission(access, warehouseId) ||
    hasFinalApprovalPermission(access, warehouseId)
  );
}

function passesFinalAuthorityMatrix(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  warehouseId: number,
  grandTotal: Prisma.Decimal,
) {
  if (!hasFinalApprovalPermission(access, warehouseId)) {
    return false;
  }

  const amount = Number(grandTotal.toString() || "0");
  if (amount > 1_000_000) {
    return access.can("purchase_orders.approve", warehouseId) && access.has("settings.manage");
  }
  if (amount > 300_000) {
    return access.can("purchase_orders.approve", warehouseId);
  }
  return true;
}

async function resolveUsersByPermission(
  tx: Prisma.TransactionClient,
  permissionKeys: string[],
  warehouseId: number,
) {
  if (permissionKeys.length === 0) {
    return [] as Array<{ id: string; email: string }>;
  }

  return tx.user.findMany({
    where: {
      userRoles: {
        some: {
          OR: [{ scopeType: "GLOBAL" }, { scopeType: "WAREHOUSE", warehouseId }],
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
      select: {
        id: true,
        email: true,
      },
    }),
    tx.supplierPortalAccess.findMany({
      where: {
        supplierId,
        status: "ACTIVE",
      },
      select: {
        userId: true,
        user: {
          select: {
            email: true,
          },
        },
      },
    }),
  ]);

  const deduped = new Map<string, { userId?: string | null; recipientEmail?: string | null }>();

  if (supplier?.email) {
    deduped.set(`|${supplier.email}`, {
      userId: null,
      recipientEmail: supplier.email,
    });
  }

  for (const access of portalAccesses) {
    const email = access.user?.email ?? null;
    const key = `${access.userId}|${email ?? ""}`;
    if (!deduped.has(key)) {
      deduped.set(key, {
        userId: access.userId,
        recipientEmail: email,
      });
    }
  }

  return [...deduped.values()];
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const purchaseOrderId = Number(id);
    if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) {
      return NextResponse.json(
        { error: "Invalid purchase order id." },
        { status: 400 },
      );
    }

    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canReadPurchaseOrders(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: purchaseOrderDetailInclude,
    });
    if (!purchaseOrder) {
      return NextResponse.json(
        { error: "Purchase order not found." },
        { status: 404 },
      );
    }
    if (
      !hasGlobalPurchaseOrderScope(access) &&
      !access.canAccessWarehouse(purchaseOrder.warehouseId)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(purchaseOrder);
  } catch (error) {
    console.error("SCM PURCHASE ORDER GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load purchase order." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const purchaseOrderId = Number(id);
    if (!Number.isInteger(purchaseOrderId) || purchaseOrderId <= 0) {
      return NextResponse.json(
        { error: "Invalid purchase order id." },
        { status: 400 },
      );
    }

    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: purchaseOrderInclude,
    });
    if (!purchaseOrder) {
      return NextResponse.json(
        { error: "Purchase order not found." },
        { status: 404 },
      );
    }

    if (
      !hasGlobalPurchaseOrderScope(access) &&
      !access.canAccessWarehouse(purchaseOrder.warehouseId)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const actionRaw = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
    const action = actionRaw === "approve" ? "final_approve" : actionRaw;
    const before = toPurchaseOrderLogSnapshot(purchaseOrder);

    if (!action) {
      if (!access.can("purchase_orders.manage", purchaseOrder.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (purchaseOrder.status !== "DRAFT") {
        return NextResponse.json(
          { error: "Only draft purchase orders can be edited." },
          { status: 400 },
        );
      }

      const expectedAt = hasOwn(body, "expectedAt")
        ? body.expectedAt
          ? new Date(String(body.expectedAt))
          : null
        : undefined;
      if (expectedAt instanceof Date && Number.isNaN(expectedAt.getTime())) {
        return NextResponse.json(
          { error: "Expected date is invalid." },
          { status: 400 },
        );
      }

      const termsTemplateRequested = hasOwn(body, "termsTemplateId");
      const requestedTemplateIdRaw = Number(body.termsTemplateId);
      const requestedTemplateId =
        termsTemplateRequested && Number.isInteger(requestedTemplateIdRaw) && requestedTemplateIdRaw > 0
          ? requestedTemplateIdRaw
          : null;
      if (
        termsTemplateRequested &&
        body.termsTemplateId !== null &&
        body.termsTemplateId !== "" &&
        requestedTemplateId === null
      ) {
        return NextResponse.json({ error: "Invalid terms template id." }, { status: 400 });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const data: Prisma.PurchaseOrderUpdateInput = {
          ...(expectedAt !== undefined ? { expectedAt } : {}),
          ...(hasOwn(body, "notes") ? { notes: toCleanText(body.notes, 500) || null } : {}),
        };

        let selectedTemplate: Awaited<ReturnType<typeof resolvePurchaseOrderTermsTemplate>> = null;
        if (termsTemplateRequested && requestedTemplateId) {
          selectedTemplate = await resolvePurchaseOrderTermsTemplate(tx, {
            templateId: requestedTemplateId,
            createdById: access.userId,
          });
          if (!selectedTemplate) {
            throw new Error("Selected PO terms template is invalid or inactive.");
          }
        }

        if (termsTemplateRequested) {
          if (selectedTemplate) {
            data.termsTemplate = { connect: { id: selectedTemplate.id } };
            data.termsTemplateCode = selectedTemplate.code;
            data.termsTemplateName = selectedTemplate.name;
          } else {
            data.termsTemplate = { disconnect: true };
            data.termsTemplateCode = null;
            data.termsTemplateName = null;
          }
        }

        if (hasOwn(body, "termsAndConditions")) {
          data.termsAndConditions = toCleanText(body.termsAndConditions, 7000) || null;
        } else if (termsTemplateRequested && selectedTemplate) {
          data.termsAndConditions = selectedTemplate.body;
        }

        return tx.purchaseOrder.update({
          where: { id: purchaseOrderId },
          data,
          include: purchaseOrderInclude,
        });
      });

      await logActivity({
        action: "update",
        entity: "purchase_order",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Updated purchase order ${updated.poNumber}`,
        },
        before,
        after: toPurchaseOrderLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "submit") {
      if (!access.can("purchase_orders.manage", purchaseOrder.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (purchaseOrder.status !== "DRAFT") {
        return NextResponse.json(
          { error: "Only draft purchase orders can be submitted." },
          { status: 400 },
        );
      }

      const { updated, emailNotificationIds } = await prisma.$transaction(async (tx) => {
        const next = await tx.purchaseOrder.update({
          where: { id: purchaseOrder.id },
          data: {
            status: "SUBMITTED",
            approvalStage: "MANAGER_REVIEW",
            submittedAt: new Date(),
            rejectedAt: null,
            rejectedById: null,
            rejectionNote: null,
          },
          include: purchaseOrderInclude,
        });

        await tx.purchaseOrderApprovalEvent.create({
          data: {
            purchaseOrderId: next.id,
            stage: "SUBMISSION",
            decision: "SUBMITTED",
            note: toCleanText(body.note, 255) || null,
            actedById: access.userId,
          },
        });

        const recipients = await resolveUsersByPermission(
          tx,
          ["purchase_orders.approve_manager", "purchase_orders.approve"],
          next.warehouseId,
        );

        const ids = await createPurchaseOrderWorkflowNotifications({
          tx,
          purchaseOrderId: next.id,
          stage: "SUBMISSION",
          recipients: recipients.map((recipient) => ({
            userId: recipient.id,
            recipientEmail: recipient.email,
          })),
          message: `Purchase order ${next.poNumber} submitted and waiting for Procurement Manager approval.`,
          metadata: {
            poNumber: next.poNumber,
            status: next.status,
            approvalStage: next.approvalStage,
          },
        });

        return { updated: next, emailNotificationIds: ids };
      });

      void dispatchPurchaseOrderWorkflowEmailNotifications(emailNotificationIds);

      await logActivity({
        action: "submit",
        entity: "purchase_order",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Submitted purchase order ${updated.poNumber}`,
        },
        before,
        after: toPurchaseOrderLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "manager_approve") {
      if (!hasManagerApprovalPermission(access, purchaseOrder.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (purchaseOrder.status !== "SUBMITTED") {
        return NextResponse.json(
          { error: "Manager approval requires SUBMITTED status." },
          { status: 400 },
        );
      }

      const { updated, emailNotificationIds } = await prisma.$transaction(async (tx) => {
        const next = await tx.purchaseOrder.update({
          where: { id: purchaseOrder.id },
          data: {
            status: "MANAGER_APPROVED",
            approvalStage: "COMMITTEE_REVIEW",
            managerApprovedAt: new Date(),
            managerApprovedById: access.userId,
          },
          include: purchaseOrderInclude,
        });

        await tx.purchaseOrderApprovalEvent.create({
          data: {
            purchaseOrderId: next.id,
            stage: "MANAGER_REVIEW",
            decision: "APPROVED",
            note: toCleanText(body.note, 255) || null,
            actedById: access.userId,
          },
        });

        const recipients = await resolveUsersByPermission(
          tx,
          ["purchase_orders.approve_committee", "purchase_orders.approve"],
          next.warehouseId,
        );

        const ids = await createPurchaseOrderWorkflowNotifications({
          tx,
          purchaseOrderId: next.id,
          stage: "MANAGER_REVIEW",
          recipients: recipients.map((recipient) => ({
            userId: recipient.id,
            recipientEmail: recipient.email,
          })),
          message: `Purchase order ${next.poNumber} passed manager approval and is waiting for Procurement Committee review.`,
          metadata: {
            poNumber: next.poNumber,
            status: next.status,
            approvalStage: next.approvalStage,
          },
        });

        return { updated: next, emailNotificationIds: ids };
      });

      void dispatchPurchaseOrderWorkflowEmailNotifications(emailNotificationIds);

      await logActivity({
        action: "approve_manager",
        entity: "purchase_order",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Manager-approved purchase order ${updated.poNumber}`,
        },
        before,
        after: toPurchaseOrderLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "committee_approve") {
      if (!hasCommitteeApprovalPermission(access, purchaseOrder.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (purchaseOrder.status !== "MANAGER_APPROVED") {
        return NextResponse.json(
          { error: "Committee approval requires MANAGER_APPROVED status." },
          { status: 400 },
        );
      }

      const { updated, emailNotificationIds } = await prisma.$transaction(async (tx) => {
        const next = await tx.purchaseOrder.update({
          where: { id: purchaseOrder.id },
          data: {
            status: "COMMITTEE_APPROVED",
            approvalStage: "FINAL_APPROVAL",
            committeeApprovedAt: new Date(),
            committeeApprovedById: access.userId,
          },
          include: purchaseOrderInclude,
        });

        await tx.purchaseOrderApprovalEvent.create({
          data: {
            purchaseOrderId: next.id,
            stage: "COMMITTEE_REVIEW",
            decision: "APPROVED",
            note: toCleanText(body.note, 255) || null,
            actedById: access.userId,
          },
        });

        const recipients = await resolveUsersByPermission(
          tx,
          ["purchase_orders.approve_final", "purchase_orders.approve"],
          next.warehouseId,
        );

        const ids = await createPurchaseOrderWorkflowNotifications({
          tx,
          purchaseOrderId: next.id,
          stage: "COMMITTEE_REVIEW",
          recipients: recipients.map((recipient) => ({
            userId: recipient.id,
            recipientEmail: recipient.email,
          })),
          message: `Purchase order ${next.poNumber} passed committee review and is waiting for final approval.`,
          metadata: {
            poNumber: next.poNumber,
            status: next.status,
            approvalStage: next.approvalStage,
          },
        });

        return { updated: next, emailNotificationIds: ids };
      });

      void dispatchPurchaseOrderWorkflowEmailNotifications(emailNotificationIds);

      await logActivity({
        action: "approve_committee",
        entity: "purchase_order",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Committee-approved purchase order ${updated.poNumber}`,
        },
        before,
        after: toPurchaseOrderLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "final_approve") {
      if (!passesFinalAuthorityMatrix(access, purchaseOrder.warehouseId, purchaseOrder.grandTotal)) {
        return NextResponse.json(
          {
            error:
              "Final approval denied by authority matrix. Ensure final-approval permission and authority-matrix controls are assigned.",
          },
          { status: 403 },
        );
      }
      if (purchaseOrder.status !== "COMMITTEE_APPROVED") {
        return NextResponse.json(
          { error: "Final approval requires COMMITTEE_APPROVED status." },
          { status: 400 },
        );
      }

      const { updated, emailNotificationIds, supplierEmailNotificationIds } = await prisma.$transaction(
        async (tx) => {
          const next = await tx.purchaseOrder.update({
            where: { id: purchaseOrder.id },
            data: {
              status: "APPROVED",
              approvalStage: "FINAL_APPROVAL",
              approvedAt: new Date(),
              approvedById: access.userId,
              finalApprovedAt: new Date(),
              finalApprovedById: access.userId,
            },
            include: purchaseOrderInclude,
          });

          await tx.purchaseOrderApprovalEvent.create({
            data: {
              purchaseOrderId: next.id,
              stage: "FINAL_APPROVAL",
              decision: "APPROVED",
              note: toCleanText(body.note, 255) || null,
              actedById: access.userId,
              metadata: {
                grandTotal: next.grandTotal.toString(),
                currency: next.currency,
              },
            },
          });

          if (next.rfqAward?.id) {
            await tx.rfqAward.update({
              where: { id: next.rfqAward.id },
              data: { status: "CONVERTED_TO_PO" },
            });
          }

          const creatorRecipients =
            next.createdById && next.createdBy?.email
              ? [{ userId: next.createdById, recipientEmail: next.createdBy.email }]
              : [];
          const poEmailIds = await createPurchaseOrderWorkflowNotifications({
            tx,
            purchaseOrderId: next.id,
            stage: "FINAL_APPROVAL",
            recipients: creatorRecipients,
            message: `Purchase order ${next.poNumber} is fully approved and now active as a work order.`,
            metadata: {
              poNumber: next.poNumber,
              status: next.status,
              approvalStage: next.approvalStage,
            },
          });

          const supplierRecipients = await resolveSupplierPortalRecipients(tx, next.supplierId);
          const supplierEmailIds = await createSupplierPortalNotifications({
            tx,
            notifications: supplierRecipients.map((recipient) => ({
              supplierId: next.supplierId,
              userId: recipient.userId ?? null,
              recipientEmail: recipient.recipientEmail ?? null,
              type: "WORK_ORDER",
              title: `Work Order Issued: ${next.poNumber}`,
              message:
                `Purchase order ${next.poNumber} is approved and issued as work order.` +
                `${next.expectedAt ? ` Expected delivery: ${next.expectedAt.toISOString().slice(0, 10)}.` : ""}`,
              metadata: {
                purchaseOrderId: next.id,
                poNumber: next.poNumber,
                status: next.status,
                approvalStage: next.approvalStage,
                warehouseId: next.warehouseId,
              },
              createdById: access.userId,
            })),
          });

          return {
            updated: next,
            emailNotificationIds: poEmailIds,
            supplierEmailNotificationIds: supplierEmailIds,
          };
        },
      );

      void dispatchPurchaseOrderWorkflowEmailNotifications(emailNotificationIds);
      void dispatchSupplierPortalEmailNotifications(supplierEmailNotificationIds);

      await logActivity({
        action: "approve_final",
        entity: "purchase_order",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Final-approved purchase order ${updated.poNumber}`,
          grandTotal: updated.grandTotal.toString(),
        },
        before,
        after: toPurchaseOrderLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "reject") {
      const canReject =
        hasManagerApprovalPermission(access, purchaseOrder.warehouseId) ||
        hasCommitteeApprovalPermission(access, purchaseOrder.warehouseId) ||
        hasFinalApprovalPermission(access, purchaseOrder.warehouseId);
      if (!canReject) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!["SUBMITTED", "MANAGER_APPROVED", "COMMITTEE_APPROVED"].includes(purchaseOrder.status)) {
        return NextResponse.json(
          { error: "Only in-review purchase orders can be rejected." },
          { status: 400 },
        );
      }

      const rejectionNote =
        toCleanText(body.rejectionNote ?? body.note, 1000) || "Purchase order rejected.";

      const { updated, emailNotificationIds } = await prisma.$transaction(async (tx) => {
        const next = await tx.purchaseOrder.update({
          where: { id: purchaseOrder.id },
          data: {
            status: "REJECTED",
            approvalStage: "REJECTION",
            rejectedAt: new Date(),
            rejectedById: access.userId,
            rejectionNote,
          },
          include: purchaseOrderInclude,
        });

        await tx.purchaseOrderApprovalEvent.create({
          data: {
            purchaseOrderId: next.id,
            stage: "REJECTION",
            decision: "REJECTED",
            note: rejectionNote,
            actedById: access.userId,
          },
        });

        const recipients =
          next.createdById && next.createdBy?.email
            ? [{ userId: next.createdById, recipientEmail: next.createdBy.email }]
            : [];

        const ids = await createPurchaseOrderWorkflowNotifications({
          tx,
          purchaseOrderId: next.id,
          stage: "REJECTION",
          recipients,
          message: `Purchase order ${next.poNumber} was rejected. Note: ${rejectionNote}`,
          metadata: {
            poNumber: next.poNumber,
            status: next.status,
            approvalStage: next.approvalStage,
            rejectionNote,
          },
        });

        return { updated: next, emailNotificationIds: ids };
      });

      void dispatchPurchaseOrderWorkflowEmailNotifications(emailNotificationIds);

      await logActivity({
        action: "reject",
        entity: "purchase_order",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Rejected purchase order ${updated.poNumber}`,
          rejectionNote,
        },
        before,
        after: toPurchaseOrderLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "cancel") {
      if (!canCancelPurchaseOrder(access, purchaseOrder.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!["DRAFT", "SUBMITTED", "MANAGER_APPROVED", "COMMITTEE_APPROVED", "APPROVED"].includes(purchaseOrder.status)) {
        return NextResponse.json(
          { error: "This purchase order can no longer be cancelled." },
          { status: 400 },
        );
      }

      const { updated, emailNotificationIds } = await prisma.$transaction(async (tx) => {
        const next = await tx.purchaseOrder.update({
          where: { id: purchaseOrder.id },
          data: {
            status: "CANCELLED",
            approvalStage: "CANCELLATION",
          },
          include: purchaseOrderInclude,
        });

        await tx.purchaseOrderApprovalEvent.create({
          data: {
            purchaseOrderId: next.id,
            stage: "CANCELLATION",
            decision: "CANCELLED",
            note: toCleanText(body.note, 255) || null,
            actedById: access.userId,
          },
        });

        const recipients =
          next.createdById && next.createdBy?.email
            ? [{ userId: next.createdById, recipientEmail: next.createdBy.email }]
            : [];

        const ids = await createPurchaseOrderWorkflowNotifications({
          tx,
          purchaseOrderId: next.id,
          stage: "CANCELLATION",
          recipients,
          message: `Purchase order ${next.poNumber} was cancelled.`,
          metadata: {
            poNumber: next.poNumber,
            status: next.status,
            approvalStage: next.approvalStage,
          },
        });

        return { updated: next, emailNotificationIds: ids };
      });

      void dispatchPurchaseOrderWorkflowEmailNotifications(emailNotificationIds);

      await logActivity({
        action: "cancel",
        entity: "purchase_order",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Cancelled purchase order ${updated.poNumber}`,
        },
        before,
        after: toPurchaseOrderLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error: any) {
    console.error("SCM PURCHASE ORDER PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update purchase order." },
      { status: 500 },
    );
  }
}
