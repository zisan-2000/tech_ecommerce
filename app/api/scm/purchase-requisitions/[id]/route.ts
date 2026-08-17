import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { Prisma, type PurchaseRequisitionApprovalStage } from "@/generated/prisma";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  computePurchaseOrderTotals,
  generatePurchaseOrderNumber,
  purchaseOrderInclude,
  purchaseRequisitionInclude,
  toDecimalAmount,
  toPurchaseOrderLogSnapshot,
  toPurchaseRequisitionLogSnapshot,
} from "@/lib/scm";
import { dispatchPurchaseRequisitionEmailNotifications } from "@/lib/purchase-requisition-notifications";

const purchaseRequisitionDetailInclude = {
  ...purchaseRequisitionInclude,
  rfqs: {
    orderBy: [{ id: "desc" as const }],
    select: {
      id: true,
      rfqNumber: true,
      status: true,
      comparativeStatements: {
        orderBy: [{ id: "desc" as const }],
        select: {
          id: true,
          csNumber: true,
          status: true,
          generatedPurchaseOrder: {
            select: {
              id: true,
              poNumber: true,
              status: true,
            },
          },
        },
      },
    },
  },
  purchaseOrders: {
    orderBy: [{ id: "desc" as const }],
    select: {
      id: true,
      poNumber: true,
      status: true,
      supplier: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      goodsReceipts: {
        orderBy: [{ receivedAt: "desc" as const }],
        select: {
          id: true,
          receiptNumber: true,
          status: true,
        },
      },
      supplierInvoices: {
        orderBy: [{ issueDate: "desc" as const }, { id: "desc" as const }],
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          payments: {
            orderBy: [{ paymentDate: "desc" as const }, { id: "desc" as const }],
            select: {
              id: true,
              paymentNumber: true,
              amount: true,
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
          supplierPayment: {
            select: {
              id: true,
              paymentNumber: true,
              amount: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.PurchaseRequisitionInclude;

const PURCHASE_REQUISITION_READ_PERMISSIONS = [
  "purchase_requisitions.read",
  "purchase_requisitions.manage",
  "purchase_requisitions.approve",
  "mrf.budget_clear",
  "mrf.endorse",
  "mrf.final_approve",
] as const;

function toCleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function hasOwn(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function toNullableDecimal(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`${field} must be a non-negative number`);
  }
  return new Prisma.Decimal(numeric);
}

type RequisitionAttachmentInput = {
  fileUrl?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
  fileSize?: unknown;
  note?: unknown;
};

function parseAttachmentInputs(raw: unknown) {
  const attachments = Array.isArray(raw) ? raw : [];
  return attachments
    .map((attachment, index) => {
      const row = attachment as RequisitionAttachmentInput;
      const fileUrl = toCleanText(row?.fileUrl, 600);
      const fileName = toCleanText(row?.fileName, 260);
      if (!fileUrl || !fileName) {
        throw new Error(`Attachment ${index + 1}: file URL and file name are required`);
      }
      const fileSizeRaw =
        row.fileSize === null || row.fileSize === undefined || row.fileSize === ""
          ? null
          : Number(row.fileSize);
      if (fileSizeRaw !== null && (!Number.isInteger(fileSizeRaw) || fileSizeRaw < 0)) {
        throw new Error(`Attachment ${index + 1}: invalid file size`);
      }
      return {
        fileUrl,
        fileName,
        mimeType: toCleanText(row?.mimeType, 160) || null,
        fileSize: fileSizeRaw,
        note: toCleanText(row?.note, 255) || null,
      };
    })
    .slice(0, 20);
}

function canReadPurchaseRequisitions(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return access.hasAny([...PURCHASE_REQUISITION_READ_PERMISSIONS]);
}

function hasGlobalPurchaseRequisitionScope(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return PURCHASE_REQUISITION_READ_PERMISSIONS.some((permission) =>
    access.hasGlobal(permission),
  );
}

function passesFinalAuthorityMatrix(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  warehouseId: number,
  estimatedAmount: Prisma.Decimal | null,
) {
  const numericAmount = Number(estimatedAmount?.toString() || 0);
  if (!access.can("mrf.final_approve", warehouseId)) return false;
  if (numericAmount > 500000) {
    return access.can("purchase_orders.approve", warehouseId) && access.has("settings.manage");
  }
  if (numericAmount > 100000) {
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
    return [] as Array<{ id: string; name: string | null; email: string }>;
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
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}

async function resolveProcurementOfficerCandidates(
  tx: Prisma.TransactionClient,
  warehouseId: number,
) {
  return tx.user.findMany({
    where: {
      userRoles: {
        some: {
          OR: [{ scopeType: "GLOBAL" }, { scopeType: "WAREHOUSE", warehouseId }],
          role: {
            rolePermissions: {
              some: {
                permission: {
                  key: { in: ["rfq.manage", "purchase_orders.manage"] },
                },
              },
            },
          },
        },
      },
    },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}

async function recordRequisitionVersion(
  tx: Prisma.TransactionClient,
  requisitionId: number,
  action: string,
  stage: PurchaseRequisitionApprovalStage,
  createdById: string,
) {
  const requisition = await tx.purchaseRequisition.findUnique({
    where: { id: requisitionId },
    include: purchaseRequisitionInclude,
  });
  if (!requisition) {
    throw new Error("Purchase requisition not found while creating version snapshot.");
  }
  const latest = await tx.purchaseRequisitionVersion.findFirst({
    where: { purchaseRequisitionId: requisitionId },
    orderBy: { versionNo: "desc" },
    select: { versionNo: true },
  });
  await tx.purchaseRequisitionVersion.create({
    data: {
      purchaseRequisitionId: requisitionId,
      versionNo: (latest?.versionNo ?? 0) + 1,
      stage,
      action,
      snapshot: toPurchaseRequisitionLogSnapshot(requisition),
      createdById,
    },
  });
}

async function createWorkflowNotifications(
  tx: Prisma.TransactionClient,
  input: {
    requisitionId: number;
    stage: PurchaseRequisitionApprovalStage;
    warehouseId: number;
    message: string;
    recipientPermissionKeys?: string[];
    explicitUserIds?: string[];
    metadata?: Prisma.InputJsonValue;
  },
): Promise<number[]> {
  const permissionRecipients = await resolveUsersByPermission(
    tx,
    input.recipientPermissionKeys ?? [],
    input.warehouseId,
  );
  const explicitIds = new Set((input.explicitUserIds ?? []).filter(Boolean));
  const explicitRecipients = explicitIds.size
    ? await tx.user.findMany({
        where: { id: { in: [...explicitIds] } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const recipientMap = new Map<string, { id: string; email: string; name: string | null }>();
  for (const user of [...permissionRecipients, ...explicitRecipients]) {
    recipientMap.set(user.id, user);
  }
  if (recipientMap.size === 0) return [];

  const now = new Date();
  const records: Prisma.PurchaseRequisitionNotificationCreateManyInput[] = [];
  const emailTargets: Array<{ userId: string; email: string }> = [];
  for (const recipient of recipientMap.values()) {
    records.push({
      purchaseRequisitionId: input.requisitionId,
      stage: input.stage,
      channel: "SYSTEM",
      status: "SENT",
      recipientUserId: recipient.id,
      recipientEmail: recipient.email,
      message: input.message,
      sentAt: now,
      metadata: input.metadata,
    });
    records.push({
      purchaseRequisitionId: input.requisitionId,
      stage: input.stage,
      channel: "EMAIL",
      status: "PENDING",
      recipientUserId: recipient.id,
      recipientEmail: recipient.email,
      message: input.message,
      metadata: input.metadata,
    });
    emailTargets.push({ userId: recipient.id, email: recipient.email });
  }
  await tx.purchaseRequisitionNotification.createMany({ data: records });

  if (emailTargets.length === 0) {
    return [];
  }

  const createdEmails = await tx.purchaseRequisitionNotification.findMany({
    where: {
      purchaseRequisitionId: input.requisitionId,
      stage: input.stage,
      channel: "EMAIL",
      status: "PENDING",
      recipientUserId: { in: emailTargets.map((item) => item.userId) },
      recipientEmail: { in: emailTargets.map((item) => item.email) },
    },
    select: { id: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: emailTargets.length,
  });

  return createdEmails.map((row) => row.id);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const requisitionId = Number(id);
    if (!Number.isInteger(requisitionId) || requisitionId <= 0) {
      return NextResponse.json(
        { error: "Invalid purchase requisition id." },
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
    if (!canReadPurchaseRequisitions(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const requisition = await prisma.purchaseRequisition.findUnique({
    where: { id: requisitionId },
    include: purchaseRequisitionDetailInclude,
  });
    if (!requisition) {
      return NextResponse.json(
        { error: "Purchase requisition not found." },
        { status: 404 },
      );
    }
    if (
      !hasGlobalPurchaseRequisitionScope(access) &&
      !access.canAccessWarehouse(requisition.warehouseId)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const procurementOfficerCandidates = await resolveProcurementOfficerCandidates(
      prisma,
      requisition.warehouseId,
    );

    return NextResponse.json({
      ...requisition,
      procurementOfficerCandidates,
    });
  } catch (error) {
    console.error("SCM PURCHASE REQUISITION GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load purchase requisition." },
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
    const requisitionId = Number(id);
    if (!Number.isInteger(requisitionId) || requisitionId <= 0) {
      return NextResponse.json(
        { error: "Invalid purchase requisition id." },
        { status: 400 },
      );
    }

    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    const actorUserId = access.userId;
    if (!actorUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requisition = await prisma.purchaseRequisition.findUnique({
      where: { id: requisitionId },
      include: purchaseRequisitionInclude,
    });
    if (!requisition) {
      return NextResponse.json(
        { error: "Purchase requisition not found." },
        { status: 404 },
      );
    }
    if (
      !hasGlobalPurchaseRequisitionScope(access) &&
      !access.canAccessWarehouse(requisition.warehouseId)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
    const normalizedAction = action === "approve" ? "final_approve" : action;
    const before = toPurchaseRequisitionLogSnapshot(requisition);

    if (!normalizedAction) {
      if (!access.can("purchase_requisitions.manage", requisition.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (requisition.status !== "DRAFT") {
        return NextResponse.json(
          { error: "Only draft requisitions can be edited." },
          { status: 400 },
        );
      }
      const neededBy = hasOwn(body, "neededBy")
        ? body.neededBy
          ? new Date(String(body.neededBy))
          : null
        : undefined;
      if (neededBy instanceof Date && Number.isNaN(neededBy.getTime())) {
        return NextResponse.json(
          { error: "Needed-by date is invalid." },
          { status: 400 },
        );
      }

      const attachments = hasOwn(body, "attachments")
        ? parseAttachmentInputs(body.attachments)
        : null;

      const data: Prisma.PurchaseRequisitionUpdateInput = {
        ...(neededBy !== undefined ? { neededBy } : {}),
        ...(hasOwn(body, "title") ? { title: toCleanText(body.title, 180) || null } : {}),
        ...(hasOwn(body, "purpose") ? { purpose: toCleanText(body.purpose, 500) || null } : {}),
        ...(hasOwn(body, "budgetCode")
          ? { budgetCode: toCleanText(body.budgetCode, 120) || null }
          : {}),
        ...(hasOwn(body, "boqReference")
          ? { boqReference: toCleanText(body.boqReference, 160) || null }
          : {}),
        ...(hasOwn(body, "specification")
          ? { specification: toCleanText(body.specification, 4000) || null }
          : {}),
        ...(hasOwn(body, "planningNote")
          ? { planningNote: toCleanText(body.planningNote, 1000) || null }
          : {}),
        ...(hasOwn(body, "estimatedAmount")
          ? {
              estimatedAmount: toNullableDecimal(
                body.estimatedAmount,
                "Estimated amount",
              ),
            }
          : {}),
        ...(hasOwn(body, "endorsementRequiredCount")
          ? {
              endorsementRequiredCount: Math.max(
                1,
                Number.isInteger(Number(body.endorsementRequiredCount))
                  ? Number(body.endorsementRequiredCount)
                  : 1,
              ),
            }
          : {}),
        ...(hasOwn(body, "note") ? { note: toCleanText(body.note, 500) || null } : {}),
      };

      const updated = await prisma.$transaction(async (tx) => {
        if (attachments !== null) {
          await tx.purchaseRequisitionAttachment.deleteMany({
            where: { purchaseRequisitionId: requisition.id },
          });
        }

        const next = await tx.purchaseRequisition.update({
          where: { id: requisition.id },
          data: {
            ...data,
            ...(attachments !== null
              ? {
                  attachments: {
                    create: attachments.map((attachment) => ({
                      ...attachment,
                      uploadedById: actorUserId,
                    })),
                  },
                }
              : {}),
          },
          include: purchaseRequisitionInclude,
        });

        await recordRequisitionVersion(
          tx,
          next.id,
          "update_draft",
          "PLANNING",
          actorUserId,
        );

        return next;
      });

      await logActivity({
        action: "update",
        entity: "purchase_requisition",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Updated purchase requisition ${updated.requisitionNumber}`,
        },
        before,
        after: toPurchaseRequisitionLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (normalizedAction === "submit") {
      if (!access.can("purchase_requisitions.manage", requisition.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (requisition.status !== "DRAFT") {
        return NextResponse.json(
          { error: "Only draft requisitions can be submitted." },
          { status: 400 },
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.purchaseRequisition.update({
          where: { id: requisition.id },
          data: {
            status: "SUBMITTED",
            submittedAt: new Date(),
          },
          include: purchaseRequisitionInclude,
        });

        await tx.purchaseRequisitionApprovalEvent.create({
          data: {
            purchaseRequisitionId: next.id,
            stage: "SUBMISSION",
            decision: "APPROVED",
            note: toCleanText(body.note, 255) || null,
            actedById: actorUserId,
          },
        });

        await recordRequisitionVersion(
          tx,
          next.id,
          "submit",
          "SUBMISSION",
          actorUserId,
        );

        const emailNotificationIds = await createWorkflowNotifications(tx, {
          requisitionId: next.id,
          stage: "SUBMISSION",
          warehouseId: next.warehouseId,
          recipientPermissionKeys: ["mrf.budget_clear"],
          explicitUserIds: [next.createdById || ""],
          message: `MRF ${next.requisitionNumber} submitted and waiting for budget clearance.`,
          metadata: {
            status: next.status,
            requisitionNumber: next.requisitionNumber,
          },
        });

        return { next, emailNotificationIds };
      });

      await logActivity({
        action: "submit",
        entity: "purchase_requisition",
        entityId: updated.next.id,
        access,
        request,
        metadata: {
          message: `Submitted purchase requisition ${updated.next.requisitionNumber}`,
        },
        before,
        after: toPurchaseRequisitionLogSnapshot(updated.next),
      });

      void dispatchPurchaseRequisitionEmailNotifications(updated.emailNotificationIds);

      return NextResponse.json(updated.next);
    }

    if (normalizedAction === "budget_clear") {
      if (!access.can("mrf.budget_clear", requisition.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (requisition.status !== "SUBMITTED") {
        return NextResponse.json(
          { error: "Budget clearance is allowed only for submitted requisitions." },
          { status: 400 },
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.purchaseRequisition.update({
          where: { id: requisition.id },
          data: {
            status: "BUDGET_CLEARED",
            budgetClearedAt: new Date(),
            budgetClearedById: actorUserId,
            rejectedAt: null,
          },
          include: purchaseRequisitionInclude,
        });

        await tx.purchaseRequisitionApprovalEvent.create({
          data: {
            purchaseRequisitionId: next.id,
            stage: "BUDGET_CLEARANCE",
            decision: "APPROVED",
            note: toCleanText(body.note, 255) || null,
            actedById: actorUserId,
          },
        });

        await recordRequisitionVersion(
          tx,
          next.id,
          "budget_clear",
          "BUDGET_CLEARANCE",
          actorUserId,
        );

        const emailNotificationIds = await createWorkflowNotifications(tx, {
          requisitionId: next.id,
          stage: "BUDGET_CLEARANCE",
          warehouseId: next.warehouseId,
          recipientPermissionKeys: ["mrf.endorse"],
          explicitUserIds: [next.createdById || ""],
          message: `MRF ${next.requisitionNumber} passed budget clearance and needs endorsement sign-off.`,
          metadata: {
            status: next.status,
            requisitionNumber: next.requisitionNumber,
          },
        });

        return { next, emailNotificationIds };
      });

      await logActivity({
        action: "budget_clear",
        entity: "purchase_requisition",
        entityId: updated.next.id,
        access,
        request,
        metadata: {
          message: `Budget cleared purchase requisition ${updated.next.requisitionNumber}`,
        },
        before,
        after: toPurchaseRequisitionLogSnapshot(updated.next),
      });

      void dispatchPurchaseRequisitionEmailNotifications(updated.emailNotificationIds);

      return NextResponse.json(updated.next);
    }

    if (normalizedAction === "endorse") {
      if (!access.can("mrf.endorse", requisition.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (requisition.status !== "BUDGET_CLEARED") {
        return NextResponse.json(
          { error: "Endorsement is allowed only after budget clearance." },
          { status: 400 },
        );
      }

      const existingEndorsement = requisition.approvalEvents.find(
        (event) => event.stage === "ENDORSEMENT" && event.actedById === actorUserId,
      );
      if (existingEndorsement) {
        return NextResponse.json(
          { error: "You already endorsed this requisition." },
          { status: 400 },
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.purchaseRequisitionApprovalEvent.create({
          data: {
            purchaseRequisitionId: requisition.id,
            stage: "ENDORSEMENT",
            decision: "APPROVED",
            note: toCleanText(body.note, 255) || null,
            actedById: actorUserId,
          },
        });

        const endorsementCount = await tx.purchaseRequisitionApprovalEvent.count({
          where: {
            purchaseRequisitionId: requisition.id,
            stage: "ENDORSEMENT",
            decision: "APPROVED",
          },
        });

        const reachedRequiredEndorsements =
          endorsementCount >= Math.max(1, requisition.endorsementRequiredCount || 1);

        const next = await tx.purchaseRequisition.update({
          where: { id: requisition.id },
          data: reachedRequiredEndorsements
            ? {
                status: "ENDORSED",
                endorsedAt: new Date(),
                endorsedById: actorUserId,
              }
            : {},
          include: purchaseRequisitionInclude,
        });

        await recordRequisitionVersion(
          tx,
          next.id,
          reachedRequiredEndorsements ? "endorse_complete" : "endorse_partial",
          "ENDORSEMENT",
          actorUserId,
        );

        let emailNotificationIds: number[] = [];
        if (reachedRequiredEndorsements) {
          emailNotificationIds = await createWorkflowNotifications(tx, {
            requisitionId: next.id,
            stage: "ENDORSEMENT",
            warehouseId: next.warehouseId,
            recipientPermissionKeys: ["mrf.final_approve"],
            explicitUserIds: [next.createdById || ""],
            message: `MRF ${next.requisitionNumber} completed endorsements and is ready for final approval.`,
            metadata: {
              status: next.status,
              requisitionNumber: next.requisitionNumber,
              endorsements: endorsementCount,
              requiredEndorsements: requisition.endorsementRequiredCount,
            },
          });
        }

        return { next, endorsementCount, reachedRequiredEndorsements, emailNotificationIds };
      });

      await logActivity({
        action: "endorse",
        entity: "purchase_requisition",
        entityId: updated.next.id,
        access,
        request,
        metadata: {
          message: `Endorsed purchase requisition ${updated.next.requisitionNumber}`,
          endorsementCount: updated.endorsementCount,
          requiredEndorsements: requisition.endorsementRequiredCount,
          reachedRequiredEndorsements: updated.reachedRequiredEndorsements,
        },
        before,
        after: toPurchaseRequisitionLogSnapshot(updated.next),
      });

      void dispatchPurchaseRequisitionEmailNotifications(updated.emailNotificationIds);

      return NextResponse.json({
        ...updated.next,
        endorsementSummary: {
          endorsementCount: updated.endorsementCount,
          requiredEndorsements: requisition.endorsementRequiredCount,
          reachedRequiredEndorsements: updated.reachedRequiredEndorsements,
        },
      });
    }

    if (normalizedAction === "final_approve") {
      if (!passesFinalAuthorityMatrix(access, requisition.warehouseId, requisition.estimatedAmount)) {
        return NextResponse.json(
          {
            error:
              "Final approval denied by authority matrix. Ensure mrf.final_approve and required approval authority permissions are assigned.",
          },
          { status: 403 },
        );
      }
      if (requisition.status !== "ENDORSED") {
        return NextResponse.json(
          { error: "Only endorsed requisitions can be final-approved." },
          { status: 400 },
        );
      }

      const selectedOfficerId = toCleanText(body.assignedProcurementOfficerId, 80) || null;
      if (!selectedOfficerId) {
        return NextResponse.json(
          { error: "Procurement officer selection is required before final approval." },
          { status: 400 },
        );
      }
      const procurementOfficerCandidates = await resolveProcurementOfficerCandidates(
        prisma,
        requisition.warehouseId,
      );
      const assignedOfficer = procurementOfficerCandidates.find(
        (candidate) => candidate.id === selectedOfficerId,
      );
      if (!assignedOfficer) {
        return NextResponse.json(
          { error: "Selected procurement officer is not eligible for this warehouse." },
          { status: 400 },
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const assignedOfficerId = assignedOfficer.id;

        const next = await tx.purchaseRequisition.update({
          where: { id: requisition.id },
          data: {
            status: "APPROVED",
            approvedAt: new Date(),
            approvedById: actorUserId,
            rejectedAt: null,
            assignedProcurementOfficerId: assignedOfficerId,
            routedToProcurementAt: assignedOfficerId ? new Date() : null,
          },
          include: purchaseRequisitionInclude,
        });

        await tx.purchaseRequisitionApprovalEvent.create({
          data: {
            purchaseRequisitionId: next.id,
            stage: "FINAL_APPROVAL",
            decision: "APPROVED",
            note: toCleanText(body.note, 255) || null,
            actedById: actorUserId,
          },
        });

        await recordRequisitionVersion(
          tx,
          next.id,
          "final_approve",
          "FINAL_APPROVAL",
          actorUserId,
        );

        const emailNotificationIds = await createWorkflowNotifications(tx, {
          requisitionId: next.id,
          stage: "ROUTED_TO_PROCUREMENT",
          warehouseId: next.warehouseId,
          explicitUserIds: [next.createdById || "", assignedOfficerId],
          message: `MRF ${next.requisitionNumber} final-approved and routed to assigned procurement officer.`,
          metadata: {
            status: next.status,
            requisitionNumber: next.requisitionNumber,
            assignedProcurementOfficerId: assignedOfficerId,
          },
        });

        return { next, emailNotificationIds };
      });

      await logActivity({
        action: "approve",
        entity: "purchase_requisition",
        entityId: updated.next.id,
        access,
        request,
        metadata: {
          message: `Final-approved purchase requisition ${updated.next.requisitionNumber}`,
          routedToProcurementAt: updated.next.routedToProcurementAt?.toISOString() ?? null,
          assignedProcurementOfficerId: updated.next.assignedProcurementOfficerId ?? null,
        },
        before,
        after: toPurchaseRequisitionLogSnapshot(updated.next),
      });

      void dispatchPurchaseRequisitionEmailNotifications(updated.emailNotificationIds);

      return NextResponse.json(updated.next);
    }

    if (normalizedAction === "reject") {
      const canReject =
        access.can("purchase_requisitions.approve", requisition.warehouseId) ||
        access.can("mrf.budget_clear", requisition.warehouseId) ||
        access.can("mrf.endorse", requisition.warehouseId) ||
        access.can("mrf.final_approve", requisition.warehouseId);
      if (!canReject) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!["SUBMITTED", "BUDGET_CLEARED", "ENDORSED"].includes(requisition.status)) {
        return NextResponse.json(
          { error: "Only submitted/budget-cleared/endorsed requisitions can be rejected." },
          { status: 400 },
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.purchaseRequisition.update({
          where: { id: requisition.id },
          data: {
            status: "REJECTED",
            rejectedAt: new Date(),
          },
          include: purchaseRequisitionInclude,
        });

        await tx.purchaseRequisitionApprovalEvent.create({
          data: {
            purchaseRequisitionId: next.id,
            stage: "REJECTION",
            decision: "REJECTED",
            note: toCleanText(body.note, 255) || null,
            actedById: actorUserId,
          },
        });

        await recordRequisitionVersion(
          tx,
          next.id,
          "reject",
          "REJECTION",
          actorUserId,
        );

        const emailNotificationIds = await createWorkflowNotifications(tx, {
          requisitionId: next.id,
          stage: "REJECTION",
          warehouseId: next.warehouseId,
          explicitUserIds: [next.createdById || ""],
          message: `MRF ${next.requisitionNumber} was rejected. Please review comments and resubmit if needed.`,
          metadata: {
            status: next.status,
            requisitionNumber: next.requisitionNumber,
          },
        });

        return { next, emailNotificationIds };
      });

      await logActivity({
        action: "reject",
        entity: "purchase_requisition",
        entityId: updated.next.id,
        access,
        request,
        metadata: {
          message: `Rejected purchase requisition ${updated.next.requisitionNumber}`,
        },
        before,
        after: toPurchaseRequisitionLogSnapshot(updated.next),
      });

      void dispatchPurchaseRequisitionEmailNotifications(updated.emailNotificationIds);

      return NextResponse.json(updated.next);
    }

    if (normalizedAction === "cancel") {
      if (!access.can("purchase_requisitions.manage", requisition.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (
        !["DRAFT", "SUBMITTED", "BUDGET_CLEARED", "ENDORSED", "APPROVED"].includes(
          requisition.status,
        )
      ) {
        return NextResponse.json(
          { error: "This purchase requisition can no longer be cancelled." },
          { status: 400 },
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.purchaseRequisition.update({
          where: { id: requisition.id },
          data: {
            status: "CANCELLED",
          },
          include: purchaseRequisitionInclude,
        });

        await recordRequisitionVersion(
          tx,
          next.id,
          "cancel",
          "CANCELLATION",
          actorUserId,
        );

        return next;
      });

      await logActivity({
        action: "cancel",
        entity: "purchase_requisition",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Cancelled purchase requisition ${updated.requisitionNumber}`,
        },
        before,
        after: toPurchaseRequisitionLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (normalizedAction === "convert") {
      if (!access.can("purchase_orders.manage", requisition.warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (requisition.status !== "APPROVED") {
        return NextResponse.json(
          { error: "Only approved requisitions can be converted to purchase orders." },
          { status: 400 },
        );
      }
      if (requisition.purchaseOrders.length > 0) {
        return NextResponse.json(
          { error: "This requisition is already linked to a purchase order." },
          { status: 400 },
        );
      }

      const supplierId = Number(body.supplierId);
      if (!Number.isInteger(supplierId) || supplierId <= 0) {
        return NextResponse.json({ error: "Supplier is required." }, { status: 400 });
      }

      const unitCostsRaw = Array.isArray(body.unitCosts) ? body.unitCosts : [];
      const unitCostMap = new Map<number, ReturnType<typeof toDecimalAmount>>();
      for (const item of unitCostsRaw) {
        const itemId = Number(item.itemId);
        if (!Number.isInteger(itemId) || itemId <= 0) continue;
        unitCostMap.set(itemId, toDecimalAmount(item.unitCost, `Unit cost for item ${itemId}`));
      }

      for (const item of requisition.items) {
        if (!unitCostMap.has(item.id)) {
          return NextResponse.json(
            { error: `Unit cost is required for ${item.productVariant.sku}.` },
            { status: 400 },
          );
        }
      }

      const [supplier, warehouse] = await Promise.all([
        prisma.supplier.findUnique({
          where: { id: supplierId },
          select: { id: true, name: true, code: true, currency: true },
        }),
        prisma.warehouse.findUnique({
          where: { id: requisition.warehouseId },
          select: { id: true, name: true, code: true },
        }),
      ]);

      if (!supplier) {
        return NextResponse.json({ error: "Supplier not found." }, { status: 404 });
      }
      if (!warehouse) {
        return NextResponse.json({ error: "Warehouse not found." }, { status: 404 });
      }

      const requisitionItems = requisition.items.map((item) => {
        const quantityOrdered = item.quantityApproved ?? item.quantityRequested;
        const unitCost = unitCostMap.get(item.id);
        if (!unitCost) {
          throw new Error("Missing unit cost for requisition item");
        }
        return {
          productVariantId: item.productVariantId,
          quantityOrdered,
          unitCost,
          description:
            item.description ||
            `${item.productVariant.product.name} (${item.productVariant.sku})`,
          lineTotal: unitCost.mul(quantityOrdered),
        };
      });
      const totals = computePurchaseOrderTotals(requisitionItems);
      const expectedAt = body.expectedAt ? new Date(String(body.expectedAt)) : requisition.neededBy;
      if (expectedAt && Number.isNaN(expectedAt.getTime())) {
        return NextResponse.json(
          { error: "Expected delivery date is invalid." },
          { status: 400 },
        );
      }

      const createdPurchaseOrder = await prisma.$transaction(async (tx) => {
        const poNumber = await generatePurchaseOrderNumber(tx);
        const purchaseOrder = await tx.purchaseOrder.create({
          data: {
            poNumber,
            supplierId,
            purchaseRequisitionId: requisition.id,
            warehouseId: requisition.warehouseId,
            approvalStage: "DRAFT",
            expectedAt: expectedAt ?? null,
            notes: toCleanText(body.notes, 500) || requisition.note || null,
            currency: supplier.currency || "BDT",
            createdById: actorUserId,
            subtotal: totals.subtotal,
            taxTotal: totals.taxTotal,
            shippingTotal: totals.shippingTotal,
            grandTotal: totals.grandTotal,
            items: {
              create: requisitionItems.map((item) => ({
                productVariantId: item.productVariantId,
                description: item.description,
                quantityOrdered: item.quantityOrdered,
                unitCost: item.unitCost,
                lineTotal: item.lineTotal,
              })),
            },
          },
          include: purchaseOrderInclude,
        });

        await tx.purchaseRequisition.update({
          where: { id: requisition.id },
          data: {
            status: "CONVERTED",
            convertedAt: new Date(),
            convertedById: actorUserId,
          },
        });

        await recordRequisitionVersion(
          tx,
          requisition.id,
          "convert_to_po",
          "FINAL_APPROVAL",
          actorUserId,
        );

        return purchaseOrder;
      });

      const updatedRequisition = await prisma.purchaseRequisition.findUnique({
        where: { id: requisition.id },
        include: purchaseRequisitionInclude,
      });
      if (!updatedRequisition) {
        throw new Error("Purchase requisition lookup failed after conversion");
      }

      await logActivity({
        action: "convert",
        entity: "purchase_requisition",
        entityId: updatedRequisition.id,
        access,
        request,
        metadata: {
          message: `Converted purchase requisition ${updatedRequisition.requisitionNumber} to ${createdPurchaseOrder.poNumber}`,
        },
        before,
        after: toPurchaseRequisitionLogSnapshot(updatedRequisition),
      });

      await logActivity({
        action: "create",
        entity: "purchase_order",
        entityId: createdPurchaseOrder.id,
        access,
        request,
        metadata: {
          message: `Created purchase order ${createdPurchaseOrder.poNumber} from requisition ${updatedRequisition.requisitionNumber}`,
        },
        after: toPurchaseOrderLogSnapshot(createdPurchaseOrder),
      });

      return NextResponse.json({
        requisition: updatedRequisition,
        purchaseOrder: createdPurchaseOrder,
      });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error: any) {
    console.error("SCM PURCHASE REQUISITION PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update purchase requisition." },
      { status: 500 },
    );
  }
}
