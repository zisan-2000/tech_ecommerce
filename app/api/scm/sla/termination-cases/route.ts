import {
  Prisma,
  type SupplierSlaTerminationAction,
  type SupplierSlaTerminationCaseStatus,
} from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import { supplierSlaTerminationCaseInclude } from "@/lib/supplier-sla";

const SLA_TERMINATION_READ_PERMISSIONS = ["sla.read", "sla.manage"] as const;

function canRead(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return SLA_TERMINATION_READ_PERMISSIONS.some((permission) => access.hasGlobal(permission));
}

function trimText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function parseCaseStatus(value: unknown): SupplierSlaTerminationCaseStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (
    normalized === "OPEN" ||
    normalized === "IN_REVIEW" ||
    normalized === "APPROVED" ||
    normalized === "REJECTED" ||
    normalized === "EXECUTED"
  ) {
    return normalized;
  }
  return null;
}

function parseTerminationAction(value: unknown): SupplierSlaTerminationAction | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (
    normalized === "WATCHLIST" ||
    normalized === "SUSPEND_NEW_PO" ||
    normalized === "REVIEW_CONTRACT" ||
    normalized === "TERMINATE_RELATIONSHIP"
  ) {
    return normalized;
  }
  return null;
}

function toTerminationSnapshot(
  row: Awaited<ReturnType<typeof prisma.supplierSlaTerminationCase.findUnique>>,
) {
  if (!row) return null;
  return {
    id: row.id,
    supplierId: row.supplierId,
    supplierSlaPolicyId: row.supplierSlaPolicyId,
    triggerBreachId: row.triggerBreachId ?? null,
    status: row.status,
    recommendedAction: row.recommendedAction,
    openBreachCount: row.openBreachCount,
    criticalBreachCount: row.criticalBreachCount,
    lookbackDays: row.lookbackDays,
    reason: row.reason,
    ownerUserId: row.ownerUserId ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedById: row.resolvedById ?? null,
    resolutionNote: row.resolutionNote ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canRead(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supplierId = Number(request.nextUrl.searchParams.get("supplierId") || "");
    const status = parseCaseStatus(request.nextUrl.searchParams.get("status"));
    const limit = Number(request.nextUrl.searchParams.get("limit") || "200");

    const rows = await prisma.supplierSlaTerminationCase.findMany({
      where: {
        ...(Number.isInteger(supplierId) && supplierId > 0 ? { supplierId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: supplierSlaTerminationCaseInclude,
      take: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 200,
    });
    return NextResponse.json(rows);
  } catch (error) {
    console.error("SCM SLA TERMINATION CASES GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load SLA termination cases." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const canManage = access.hasGlobal("sla.manage");
    const canApproveTermination = access.hasGlobal("sla.termination.approve");
    if (!canManage && !canApproveTermination) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      caseId?: unknown;
      status?: unknown;
      ownerUserId?: unknown;
      recommendedAction?: unknown;
      resolutionNote?: unknown;
      markReviewed?: unknown;
    };

    const caseId = Number(body.caseId);
    if (!Number.isInteger(caseId) || caseId <= 0) {
      return NextResponse.json({ error: "Invalid termination case id." }, { status: 400 });
    }

    const current = await prisma.supplierSlaTerminationCase.findUnique({
      where: { id: caseId },
    });
    if (!current) {
      return NextResponse.json({ error: "Termination case not found." }, { status: 404 });
    }

    const requestedStatus = parseCaseStatus(body.status);
    if (body.status !== undefined && requestedStatus === null) {
      return NextResponse.json({ error: "Invalid termination case status." }, { status: 400 });
    }

    const requestedAction = parseTerminationAction(body.recommendedAction);
    if (body.recommendedAction !== undefined && requestedAction === null) {
      return NextResponse.json({ error: "Invalid termination recommended action." }, { status: 400 });
    }

    if (
      requestedStatus &&
      (requestedStatus === "APPROVED" ||
        requestedStatus === "REJECTED" ||
        requestedStatus === "EXECUTED") &&
      !canApproveTermination
    ) {
      return NextResponse.json(
        { error: "You do not have permission to approve/reject/execute termination cases." },
        { status: 403 },
      );
    }
    if (requestedStatus && (requestedStatus === "OPEN" || requestedStatus === "IN_REVIEW") && !canManage) {
      return NextResponse.json(
        { error: "Only SLA managers can move termination cases into OPEN/IN_REVIEW workflow." },
        { status: 403 },
      );
    }

    const updateData: Prisma.SupplierSlaTerminationCaseUncheckedUpdateInput = {};

    if (body.ownerUserId !== undefined) {
      if (!canManage) {
        return NextResponse.json(
          { error: "Only SLA managers can reassign termination case owner." },
          { status: 403 },
        );
      }
      const ownerUserId = trimText(body.ownerUserId, 191);
      if (ownerUserId) {
        const user = await prisma.user.findUnique({
          where: { id: ownerUserId },
          select: { id: true },
        });
        if (!user) {
          return NextResponse.json({ error: "Owner user not found." }, { status: 404 });
        }
        updateData.ownerUserId = user.id;
      } else {
        updateData.ownerUserId = null;
      }
    }

    if (requestedAction) {
      if (!canManage) {
        return NextResponse.json(
          { error: "Only SLA managers can change recommended action." },
          { status: 403 },
        );
      }
      updateData.recommendedAction = requestedAction;
    }

    const resolutionNote = trimText(body.resolutionNote, 1000);
    if (body.resolutionNote !== undefined) {
      updateData.resolutionNote = resolutionNote;
    }

    if (body.markReviewed === true) {
      if (!canManage) {
        return NextResponse.json(
          { error: "Only SLA managers can mark termination case as reviewed." },
          { status: 403 },
        );
      }
      updateData.reviewedAt = new Date();
    }

    if (requestedStatus) {
      updateData.status = requestedStatus;
      if (requestedStatus === "OPEN") {
        updateData.reviewedAt = null;
        updateData.resolvedAt = null;
        updateData.resolvedById = null;
        updateData.resolutionNote = null;
      } else if (requestedStatus === "IN_REVIEW") {
        if (!current.reviewedAt) {
          updateData.reviewedAt = new Date();
        }
        updateData.resolvedAt = null;
        updateData.resolvedById = null;
      } else {
        const finalResolutionNote = resolutionNote ?? current.resolutionNote ?? "";
        if (finalResolutionNote.trim().length < 3) {
          return NextResponse.json(
            {
              error:
                "Resolution note (minimum 3 chars) is required for APPROVED/REJECTED/EXECUTED status.",
            },
            { status: 400 },
          );
        }
        updateData.resolutionNote = finalResolutionNote.trim().slice(0, 1000);
        updateData.resolvedAt = new Date();
        updateData.resolvedById = access.userId;
        if (!current.reviewedAt) {
          updateData.reviewedAt = new Date();
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No update payload provided." }, { status: 400 });
    }

    const before = toTerminationSnapshot(current);
    const updated = await prisma.supplierSlaTerminationCase.update({
      where: { id: caseId },
      data: updateData,
      include: supplierSlaTerminationCaseInclude,
    });

    await logActivity({
      action: "update_case",
      entity: "supplier_sla_termination",
      entityId: updated.id,
      access,
      request,
      metadata: {
        message: `Updated SLA termination case ${updated.id} for ${updated.supplier.name} (${updated.supplier.code})`,
      },
      before,
      after: toTerminationSnapshot(updated),
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("SCM SLA TERMINATION CASES PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update SLA termination case." },
      { status: 500 },
    );
  }
}
