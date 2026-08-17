import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import { goodsReceiptInclude, toGoodsReceiptLogSnapshot } from "@/lib/scm";
import { Prisma } from "@/generated/prisma";

const PROCUREMENT_EVALUATION_PERMISSIONS = [
  "purchase_orders.manage",
  "purchase_orders.approve_manager",
  "purchase_orders.approve_committee",
  "purchase_orders.approve_final",
] as const;

const GOODS_RECEIPT_ATTACHMENT_TYPES = ["CHALLAN", "BILL", "OTHER"] as const;
const GOODS_RECEIPT_EVALUATOR_ROLES = [
  "REQUESTER",
  "PROCUREMENT",
  "ADMINISTRATION",
] as const;

function toCleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseRating(value: unknown, fieldName: string, required?: true): number;
function parseRating(value: unknown, fieldName: string, required: false): number | null;
function parseRating(value: unknown, fieldName: string, required = true): number | null {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new Error(`${fieldName} is required.`);
    }
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    throw new Error(`${fieldName} must be an integer between 1 and 5.`);
  }
  return parsed;
}

type ReceiptWithRelations = Prisma.GoodsReceiptGetPayload<{
  include: typeof goodsReceiptInclude;
}>;

function resolveRequesterUserId(receipt: ReceiptWithRelations) {
  return (
    receipt.purchaseOrder.purchaseRequisition?.createdById ??
    receipt.purchaseOrder.createdById ??
    null
  );
}

function canViewReceipt(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  receipt: ReceiptWithRelations,
) {
  return (
    access.can("goods_receipts.read", receipt.warehouseId) ||
    access.can("goods_receipts.manage", receipt.warehouseId) ||
    access.can("purchase_orders.manage", receipt.warehouseId) ||
    access.can("purchase_requisitions.manage", receipt.warehouseId) ||
    access.hasGlobal("supplier.feedback.manage") ||
    access.hasGlobal("suppliers.manage")
  );
}

function canRequesterConfirmReceipt(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  receipt: ReceiptWithRelations,
) {
  if (receipt.requesterConfirmedAt) return false;
  const requesterUserId = resolveRequesterUserId(receipt);
  if (!requesterUserId) return false;
  return (
    access.userId === requesterUserId ||
    access.can("purchase_requisitions.approve", receipt.warehouseId)
  );
}

function canManageReceiptAttachments(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  receipt: ReceiptWithRelations,
) {
  const requesterUserId = resolveRequesterUserId(receipt);
  return (
    access.can("goods_receipts.manage", receipt.warehouseId) ||
    access.can("purchase_orders.manage", receipt.warehouseId) ||
    (requesterUserId !== null && requesterUserId === access.userId)
  );
}

function canEvaluateRole(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  receipt: ReceiptWithRelations,
  evaluatorRole: (typeof GOODS_RECEIPT_EVALUATOR_ROLES)[number],
) {
  const requesterUserId = resolveRequesterUserId(receipt);
  if (evaluatorRole === "REQUESTER") {
    return (
      (requesterUserId !== null && requesterUserId === access.userId) ||
      access.can("purchase_requisitions.approve", receipt.warehouseId)
    );
  }
  if (evaluatorRole === "PROCUREMENT") {
    return PROCUREMENT_EVALUATION_PERMISSIONS.some((permission) =>
      access.can(permission, receipt.warehouseId),
    );
  }
  return (
    access.hasGlobal("supplier.feedback.manage") ||
    access.hasGlobal("suppliers.manage") ||
    access.hasGlobal("users.manage")
  );
}

function resolveAllowedEvaluationRoles(
  access: Awaited<ReturnType<typeof getAccessContext>>,
  receipt: ReceiptWithRelations,
) {
  const requesterUserId = resolveRequesterUserId(receipt);
  const isRequester = requesterUserId !== null && requesterUserId === access.userId;

  const roles = new Set<"REQUESTER" | "PROCUREMENT" | "ADMINISTRATION">();
  if (isRequester || access.can("purchase_requisitions.approve", receipt.warehouseId)) {
    roles.add("REQUESTER");
  }
  if (
    PROCUREMENT_EVALUATION_PERMISSIONS.some((permission) =>
      access.can(permission, receipt.warehouseId),
    )
  ) {
    roles.add("PROCUREMENT");
  }
  if (
    access.hasGlobal("supplier.feedback.manage") ||
    access.hasGlobal("suppliers.manage") ||
    access.hasGlobal("users.manage")
  ) {
    roles.add("ADMINISTRATION");
  }
  return [...roles];
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const receiptId = Number(id);
    if (!Number.isInteger(receiptId) || receiptId <= 0) {
      return NextResponse.json({ error: "Invalid goods receipt id." }, { status: 400 });
    }

    const receipt = await prisma.goodsReceipt.findUnique({
      where: { id: receiptId },
      include: goodsReceiptInclude,
    });
    if (!receipt) {
      return NextResponse.json({ error: "Goods receipt not found." }, { status: 404 });
    }
    if (!canViewReceipt(access, receipt)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const invoiceRows = await prisma.supplierInvoice.findMany({
      where: {
        purchaseOrderId: receipt.purchaseOrderId,
        status: { not: "CANCELLED" },
      },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        total: true,
        items: {
          select: { quantityInvoiced: true },
        },
      },
      orderBy: [{ postedAt: "desc" }, { id: "desc" }],
    });

    const invoiceCount = invoiceRows.length;
    const invoicedQuantity = invoiceRows.reduce(
      (sum, row) =>
        sum +
        row.items.reduce((lineSum, item) => lineSum + item.quantityInvoiced, 0),
      0,
    );
    const matchedRows = await prisma.supplierInvoice.findMany({
      where: {
        purchaseOrderId: receipt.purchaseOrderId,
        status: { not: "CANCELLED" },
      },
      select: {
        matchStatus: true,
      },
    });
    const hasMatchVariance = matchedRows.some((row) => row.matchStatus === "VARIANCE");
    const allMatched =
      matchedRows.length > 0 && matchedRows.every((row) => row.matchStatus === "MATCHED");

    const poOrderedQty = receipt.purchaseOrder.items.reduce(
      (sum, item) => sum + item.quantityOrdered,
      0,
    );
    const poReceivedQty = receipt.purchaseOrder.items.reduce(
      (sum, item) => sum + item.quantityReceived,
      0,
    );
    const requiredRoles = ["REQUESTER", "PROCUREMENT", "ADMINISTRATION"] as const;
    const submittedRoles = new Set(
      receipt.vendorEvaluations.map((evaluation) => evaluation.evaluatorRole),
    );

    return NextResponse.json({
      ...receipt,
      workflow: {
        requesterUserId: resolveRequesterUserId(receipt),
        requesterConfirmed: Boolean(receipt.requesterConfirmedAt),
        canRequesterConfirm: canRequesterConfirmReceipt(access, receipt),
        canManageAttachments: canManageReceiptAttachments(access, receipt),
        allowedEvaluationRoles: resolveAllowedEvaluationRoles(access, receipt),
        submittedEvaluationRoles: [...submittedRoles],
        missingEvaluationRoles: requiredRoles.filter((role) => !submittedRoles.has(role)),
        evaluationCompleted: requiredRoles.every((role) => submittedRoles.has(role)),
      },
      invoices: invoiceRows,
      matchSummary: {
        orderedQuantity: poOrderedQty,
        receivedQuantity: poReceivedQty,
        invoicedQuantity,
        invoiceCount,
        status:
          invoiceCount === 0
            ? "PENDING"
            : hasMatchVariance
              ? "VARIANCE"
              : allMatched
                ? "MATCHED"
                : "PENDING",
      },
    });
  } catch (error) {
    console.error("SCM GOODS RECEIPT GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load goods receipt." }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const receiptId = Number(id);
    if (!Number.isInteger(receiptId) || receiptId <= 0) {
      return NextResponse.json({ error: "Invalid goods receipt id." }, { status: 400 });
    }

    const receipt = await prisma.goodsReceipt.findUnique({
      where: { id: receiptId },
      include: goodsReceiptInclude,
    });
    if (!receipt) {
      return NextResponse.json({ error: "Goods receipt not found." }, { status: 404 });
    }
    if (!canViewReceipt(access, receipt)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const before = toGoodsReceiptLogSnapshot(receipt);

    if (action === "requester_confirm") {
      if (!canRequesterConfirmReceipt(access, receipt)) {
        return NextResponse.json({ error: "Requester confirmation not allowed." }, { status: 403 });
      }
      const updated = await prisma.goodsReceipt.update({
        where: { id: receipt.id },
        data: {
          requesterConfirmedAt: new Date(),
          requesterConfirmedById: access.userId,
          requesterConfirmationNote: toCleanText(body.note, 1000) || null,
        },
        include: goodsReceiptInclude,
      });

      await logActivity({
        action: "requester_confirm",
        entity: "goods_receipt",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Requester confirmed goods receipt ${updated.receiptNumber}`,
        },
        before,
        after: toGoodsReceiptLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "add_attachment") {
      if (!canManageReceiptAttachments(access, receipt)) {
        return NextResponse.json({ error: "Attachment upload is not allowed." }, { status: 403 });
      }

      const fileUrl = toCleanText(body.fileUrl, 2000);
      if (!fileUrl || !fileUrl.startsWith("/api/upload/scm-grn/")) {
        return NextResponse.json(
          { error: "Attachment file URL is invalid for GRN scope." },
          { status: 400 },
        );
      }

      const attachmentType = toCleanText(body.type, 40).toUpperCase();
      if (
        !GOODS_RECEIPT_ATTACHMENT_TYPES.includes(
          attachmentType as (typeof GOODS_RECEIPT_ATTACHMENT_TYPES)[number],
        )
      ) {
        return NextResponse.json({ error: "Attachment type is invalid." }, { status: 400 });
      }

      const fileNameInput = toCleanText(body.fileName, 255);
      const fileName =
        fileNameInput ||
        decodeURIComponent(fileUrl.split("/").filter(Boolean).at(-1) || "").slice(0, 255) ||
        null;
      const mimeType = toCleanText(body.mimeType, 120) || null;
      const fileSizeRaw = Number(body.fileSize);
      const fileSize =
        Number.isInteger(fileSizeRaw) && fileSizeRaw >= 0 ? fileSizeRaw : null;
      const note = toCleanText(body.note, 800) || null;

      const updated = await prisma.$transaction(async (tx) => {
        await tx.goodsReceiptAttachment.create({
          data: {
            goodsReceiptId: receipt.id,
            type: attachmentType as (typeof GOODS_RECEIPT_ATTACHMENT_TYPES)[number],
            fileUrl,
            fileName,
            mimeType,
            fileSize,
            note,
            uploadedById: access.userId,
          },
        });

        return tx.goodsReceipt.findUniqueOrThrow({
          where: { id: receipt.id },
          include: goodsReceiptInclude,
        });
      });

      await logActivity({
        action: "add_attachment",
        entity: "goods_receipt",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Added ${attachmentType.toLowerCase()} attachment to ${updated.receiptNumber}`,
          fileUrl,
          fileName,
          attachmentType,
        },
        before,
        after: toGoodsReceiptLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    if (action === "submit_evaluation") {
      const evaluatorRole = toCleanText(body.evaluatorRole, 40).toUpperCase();
      if (
        !GOODS_RECEIPT_EVALUATOR_ROLES.includes(
          evaluatorRole as (typeof GOODS_RECEIPT_EVALUATOR_ROLES)[number],
        )
      ) {
        return NextResponse.json({ error: "Evaluator role is invalid." }, { status: 400 });
      }
      const typedRole = evaluatorRole as (typeof GOODS_RECEIPT_EVALUATOR_ROLES)[number];
      if (!canEvaluateRole(access, receipt, typedRole)) {
        return NextResponse.json({ error: "You cannot evaluate under this role." }, { status: 403 });
      }
      if (typedRole !== "REQUESTER" && !receipt.requesterConfirmedAt) {
        return NextResponse.json(
          { error: "Requester confirmation is required before procurement/admin evaluation." },
          { status: 400 },
        );
      }

      const overallRating = parseRating(body.overallRating, "Overall rating", true);
      const serviceQualityRating = parseRating(
        body.serviceQualityRating,
        "Service quality rating",
        false,
      );
      const deliveryRating = parseRating(body.deliveryRating, "Delivery rating", false);
      const complianceRating = parseRating(
        body.complianceRating,
        "Compliance rating",
        false,
      );
      const comment = toCleanText(body.comment, 1500) || null;

      const updated = await prisma.$transaction(async (tx) => {
        if (
          typedRole === "REQUESTER" &&
          !receipt.requesterConfirmedAt &&
          canRequesterConfirmReceipt(access, receipt)
        ) {
          await tx.goodsReceipt.update({
            where: { id: receipt.id },
            data: {
              requesterConfirmedAt: new Date(),
              requesterConfirmedById: access.userId,
              requesterConfirmationNote: toCleanText(body.confirmationNote, 1000) || null,
            },
          });
        }

        await tx.goodsReceiptVendorEvaluation.upsert({
          where: {
            goodsReceiptId_evaluatorRole: {
              goodsReceiptId: receipt.id,
              evaluatorRole: typedRole,
            },
          },
          create: {
            goodsReceiptId: receipt.id,
            evaluatorRole: typedRole,
            overallRating,
            serviceQualityRating,
            deliveryRating,
            complianceRating,
            comment,
            createdById: access.userId,
          },
          update: {
            overallRating,
            serviceQualityRating,
            deliveryRating,
            complianceRating,
            comment,
            createdById: access.userId,
          },
        });

        const feedbackReference = `GRN:${receipt.receiptNumber}:${typedRole}`;
        const existingFeedback = await tx.supplierFeedback.findFirst({
          where: {
            supplierId: receipt.purchaseOrder.supplierId,
            sourceReference: feedbackReference,
            createdById: access.userId,
          },
          select: { id: true },
        });

        if (existingFeedback) {
          await tx.supplierFeedback.update({
            where: { id: existingFeedback.id },
            data: {
              sourceType: "INTERNAL",
              sourceReference: feedbackReference,
              rating: overallRating,
              serviceQualityRating,
              deliveryRating,
              complianceRating,
              comment,
            },
          });
        } else {
          await tx.supplierFeedback.create({
            data: {
              supplierId: receipt.purchaseOrder.supplierId,
              sourceType: "INTERNAL",
              sourceReference: feedbackReference,
              rating: overallRating,
              serviceQualityRating,
              deliveryRating,
              complianceRating,
              comment,
              createdById: access.userId,
            },
          });
        }

        return tx.goodsReceipt.findUniqueOrThrow({
          where: { id: receipt.id },
          include: goodsReceiptInclude,
        });
      });

      await logActivity({
        action: "submit_vendor_evaluation",
        entity: "goods_receipt",
        entityId: updated.id,
        access,
        request,
        metadata: {
          message: `Submitted ${typedRole.toLowerCase()} vendor evaluation for ${updated.receiptNumber}`,
          evaluatorRole: typedRole,
          overallRating,
        },
        before,
        after: toGoodsReceiptLogSnapshot(updated),
      });

      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error: any) {
    console.error("SCM GOODS RECEIPT PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update goods receipt." },
      { status: 500 },
    );
  }
}
