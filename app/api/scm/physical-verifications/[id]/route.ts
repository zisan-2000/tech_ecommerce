import { NextRequest, NextResponse } from "next/server";
import {
  Prisma,
  type InventoryVerificationApprovalDecision,
  type InventoryVerificationApprovalStage,
} from "@/generated/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";

function toCleanText(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

type ActionType =
  | "submit"
  | "committee_review"
  | "committee_approve"
  | "committee_reject"
  | "admin_approve"
  | "admin_reject"
  | "close";

const VERIFICATION_READ_PERMISSIONS = [
  "physical_verifications.read",
  "physical_verifications.manage",
  "physical_verifications.approve",
] as const;

function canReadVerifications(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasAny([...VERIFICATION_READ_PERMISSIONS]);
}

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
    if (!canReadVerifications(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid verification id." }, { status: 400 });
    }

    const verification = await prisma.inventoryVerification.findUnique({
      where: { id },
      include: {
        warehouse: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        committeeMembers: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        lines: {
          include: {
            productVariant: {
              select: {
                id: true,
                sku: true,
                product: { select: { id: true, name: true } },
              },
            },
            bin: { select: { id: true, code: true, name: true } },
          },
          orderBy: { id: "asc" },
        },
        approvalEvents: {
          include: {
            actedBy: { select: { id: true, name: true, email: true } },
          },
          orderBy: [{ actedAt: "asc" }, { id: "asc" }],
        },
      },
    });

    if (!verification) {
      return NextResponse.json({ error: "Verification not found." }, { status: 404 });
    }
    if (!access.canAccessWarehouse(verification.warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(verification);
  } catch (error) {
    console.error("PHYSICAL VERIFICATION GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load verification." }, { status: 500 });
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
      return NextResponse.json({ error: "Invalid verification id." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      note?: unknown;
    };
    const action = toCleanText(body.action, 40).toLowerCase() as ActionType;

    const verification = await prisma.inventoryVerification.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        warehouseId: true,
      },
    });

    if (!verification) {
      return NextResponse.json({ error: "Verification not found." }, { status: 404 });
    }
    if (!access.canAccessWarehouse(verification.warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const note = toCleanText(body.note, 500) || null;

    const requiresApprovePermission = [
      "committee_review",
      "committee_approve",
      "committee_reject",
      "admin_approve",
      "admin_reject",
      "close",
    ].includes(action);
    if (requiresApprovePermission && !access.hasAny(["physical_verifications.approve"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!requiresApprovePermission && !access.hasAny(["physical_verifications.manage"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updateData: Prisma.InventoryVerificationUpdateInput = {};
    let stage: InventoryVerificationApprovalStage | null = null;
    let decision: InventoryVerificationApprovalDecision | null = null;

    if (action === "submit") {
      if (verification.status !== "DRAFT") {
        return NextResponse.json({ error: "Only draft verifications can be submitted." }, { status: 400 });
      }
      updateData.status = "SUBMITTED";
      updateData.submittedAt = new Date();
      stage = "SUBMISSION";
      decision = "APPROVED";
    } else if (action === "committee_review") {
      if (!["SUBMITTED", "COMMITTEE_REVIEW"].includes(verification.status)) {
        return NextResponse.json({ error: "Verification is not ready for committee review." }, { status: 400 });
      }
      updateData.status = "COMMITTEE_REVIEW";
      stage = "COMMITTEE";
      decision = "APPROVED";
    } else if (action === "committee_approve") {
      if (verification.status !== "COMMITTEE_REVIEW") {
        return NextResponse.json({ error: "Verification is not in committee review." }, { status: 400 });
      }
      stage = "COMMITTEE";
      decision = "APPROVED";
    } else if (action === "committee_reject") {
      if (!["SUBMITTED", "COMMITTEE_REVIEW"].includes(verification.status)) {
        return NextResponse.json({ error: "Verification is not in committee review." }, { status: 400 });
      }
      updateData.status = "REJECTED";
      updateData.rejectedAt = new Date();
      stage = "COMMITTEE";
      decision = "REJECTED";
    } else if (action === "admin_approve") {
      if (!["SUBMITTED", "COMMITTEE_REVIEW"].includes(verification.status)) {
        return NextResponse.json({ error: "Verification is not ready for approval." }, { status: 400 });
      }
      updateData.status = "APPROVED";
      updateData.approvedAt = new Date();
      updateData.approvedBy = { connect: { id: access.userId } };
      stage = "ADMIN";
      decision = "APPROVED";
    } else if (action === "admin_reject") {
      if (!["SUBMITTED", "COMMITTEE_REVIEW"].includes(verification.status)) {
        return NextResponse.json({ error: "Verification is not ready for rejection." }, { status: 400 });
      }
      updateData.status = "REJECTED";
      updateData.rejectedAt = new Date();
      stage = "ADMIN";
      decision = "REJECTED";
    } else if (action === "close") {
      if (verification.status !== "APPROVED") {
        return NextResponse.json({ error: "Only approved verifications can be closed." }, { status: 400 });
      }
      updateData.status = "CLOSED";
      stage = "ADMIN";
      decision = "APPROVED";
    } else {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.inventoryVerification.update({
        where: { id },
        data: updateData,
      });

      if (stage && decision) {
        await tx.inventoryVerificationApprovalEvent.create({
          data: {
            verificationId: id,
            stage,
            decision,
            note,
            actedById: access.userId,
          },
        });
      }

      return record;
    });

    await logActivity({
      action: "update",
      entity: "inventory_verification",
      entityId: id,
      access,
      request,
      metadata: {
        message: `Inventory verification ${id} action: ${action}`,
      },
      after: {
        status: updated.status,
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("PHYSICAL VERIFICATION PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update verification." },
      { status: 500 },
    );
  }
}
