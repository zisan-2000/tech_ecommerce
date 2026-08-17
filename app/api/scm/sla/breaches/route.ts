import {
  Prisma,
  type SupplierSlaActionStatus,
  type SupplierSlaDisputeStatus,
} from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  evaluateSupplierInvoiceApControls,
  runSupplierSlaEvaluation,
  supplierSlaBreachInclude,
} from "@/lib/supplier-sla";

const SLA_BREACH_READ_PERMISSIONS = ["sla.read", "sla.manage"] as const;

function canRead(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return SLA_BREACH_READ_PERMISSIONS.some((permission) => access.hasGlobal(permission));
}

function toDate(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date;
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
    const status = request.nextUrl.searchParams.get("status")?.trim() || "";
    const actionStatus = request.nextUrl.searchParams.get("actionStatus")?.trim() || "";
    const onlyLatest = request.nextUrl.searchParams.get("latest") === "1";
    const days = Number(request.nextUrl.searchParams.get("days") || "180");
    const lookbackDays = Number.isInteger(days) && days > 0 ? Math.min(days, 1095) : 180;

    const rows = await prisma.supplierSlaBreach.findMany({
      where: {
        evaluationDate: { gte: toDate(lookbackDays) },
        ...(Number.isInteger(supplierId) && supplierId > 0 ? { supplierId } : {}),
        ...(status ? { status: status as Prisma.EnumSupplierSlaEvaluationStatusFilter["equals"] } : {}),
        ...(actionStatus
          ? {
              actionStatus:
                actionStatus as Prisma.EnumSupplierSlaActionStatusFilter["equals"],
            }
          : {}),
      },
      orderBy: [{ evaluationDate: "desc" }, { id: "desc" }],
      include: supplierSlaBreachInclude,
      take: 300,
    });

    if (!onlyLatest) {
      return NextResponse.json(rows);
    }

    const latestByPolicy = new Map<number, (typeof rows)[number]>();
    for (const row of rows) {
      if (!latestByPolicy.has(row.supplierSlaPolicyId)) {
        latestByPolicy.set(row.supplierSlaPolicyId, row);
      }
    }
    return NextResponse.json([...latestByPolicy.values()]);
  } catch (error) {
    console.error("SCM SLA BREACHES GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load SLA breach logs." },
      { status: 500 },
    );
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
    if (!access.hasGlobal("sla.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      supplierId?: unknown;
      policyId?: unknown;
      includeInactive?: unknown;
      autoOnly?: unknown;
    };

    const supplierId = Number(body.supplierId);
    const policyId = Number(body.policyId);
    const includeInactive = body.includeInactive === true;
    const autoOnly = body.autoOnly === true;

    const result = await runSupplierSlaEvaluation({
      supplierId: Number.isInteger(supplierId) && supplierId > 0 ? supplierId : null,
      policyId: Number.isInteger(policyId) && policyId > 0 ? policyId : null,
      includeInactive,
      autoOnly,
      actorUserId: access.userId,
      access,
      request,
    });
    if (result.count === 0) {
      return NextResponse.json(
        { error: "No SLA policies found for evaluation." },
        { status: 400 },
      );
    }
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("SCM SLA BREACHES POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to run SLA evaluation." },
      { status: 500 },
    );
  }
}

function trimText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function parseActionStatus(value: unknown): SupplierSlaActionStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (
    normalized === "NOT_REQUIRED" ||
    normalized === "OPEN" ||
    normalized === "IN_PROGRESS" ||
    normalized === "RESOLVED" ||
    normalized === "DISMISSED"
  ) {
    return normalized;
  }
  return null;
}

function parseDisputeStatus(value: unknown): SupplierSlaDisputeStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (
    normalized === "NONE" ||
    normalized === "OPEN" ||
    normalized === "UNDER_REVIEW" ||
    normalized === "RESOLVED" ||
    normalized === "REJECTED"
  ) {
    return normalized;
  }
  return null;
}

function toBreachActionSnapshot(
  breach: Awaited<ReturnType<typeof prisma.supplierSlaBreach.findUnique>>,
) {
  if (!breach) return null;
  return {
    id: breach.id,
    supplierId: breach.supplierId,
    supplierSlaPolicyId: breach.supplierSlaPolicyId,
    status: breach.status,
    severity: breach.severity,
    actionStatus: breach.actionStatus,
    ownerUserId: breach.ownerUserId,
    dueDate: breach.dueDate?.toISOString() ?? null,
    startedAt: breach.startedAt?.toISOString() ?? null,
    resolvedAt: breach.resolvedAt?.toISOString() ?? null,
    resolvedById: breach.resolvedById,
    resolutionNote: breach.resolutionNote ?? null,
    alertTriggeredAt: breach.alertTriggeredAt?.toISOString() ?? null,
    alertAcknowledgedAt: breach.alertAcknowledgedAt?.toISOString() ?? null,
    disputeStatus: breach.disputeStatus,
    disputeReason: breach.disputeReason ?? null,
    disputeRaisedAt: breach.disputeRaisedAt?.toISOString() ?? null,
    disputeRaisedById: breach.disputeRaisedById ?? null,
    disputeResolutionNote: breach.disputeResolutionNote ?? null,
    disputeResolvedAt: breach.disputeResolvedAt?.toISOString() ?? null,
    disputeResolvedById: breach.disputeResolvedById ?? null,
    terminationCaseId: breach.terminationCaseId ?? null,
    terminationSuggestedAt: breach.terminationSuggestedAt?.toISOString() ?? null,
    terminationSuggestionNote: breach.terminationSuggestionNote ?? null,
  };
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
    const canManageSla = access.hasGlobal("sla.manage");
    const canResolveDisputes = access.hasGlobal("sla.dispute.resolve");
    if (!canManageSla && !canResolveDisputes) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      breachId?: unknown;
      ownerUserId?: unknown;
      dueDate?: unknown;
      actionStatus?: unknown;
      resolutionNote?: unknown;
      acknowledgeAlert?: unknown;
      disputeStatus?: unknown;
      disputeReason?: unknown;
      disputeResolutionNote?: unknown;
    };

    const breachId = Number(body.breachId);
    if (!Number.isInteger(breachId) || breachId <= 0) {
      return NextResponse.json({ error: "Invalid breach id." }, { status: 400 });
    }

    const breach = await prisma.supplierSlaBreach.findUnique({
      where: { id: breachId },
      include: supplierSlaBreachInclude,
    });
    if (!breach) {
      return NextResponse.json({ error: "SLA breach record not found." }, { status: 404 });
    }

    const requestedActionStatus = parseActionStatus(body.actionStatus);
    if (body.actionStatus !== undefined && requestedActionStatus === null) {
      return NextResponse.json({ error: "Invalid action status." }, { status: 400 });
    }
    const requestedDisputeStatus = parseDisputeStatus(body.disputeStatus);
    if (body.disputeStatus !== undefined && requestedDisputeStatus === null) {
      return NextResponse.json({ error: "Invalid dispute status." }, { status: 400 });
    }
    if (!canManageSla) {
      if (
        body.ownerUserId !== undefined ||
        body.dueDate !== undefined ||
        body.actionStatus !== undefined ||
        body.resolutionNote !== undefined ||
        body.acknowledgeAlert !== undefined ||
        body.disputeReason !== undefined
      ) {
        return NextResponse.json(
          { error: "You only have permission to resolve/reject disputes." },
          { status: 403 },
        );
      }
      if (
        requestedDisputeStatus &&
        requestedDisputeStatus !== "RESOLVED" &&
        requestedDisputeStatus !== "REJECTED"
      ) {
        return NextResponse.json(
          { error: "You can only set dispute status to RESOLVED or REJECTED." },
          { status: 403 },
        );
      }
    }
    if (
      breach.status === "OK" &&
      requestedActionStatus &&
      requestedActionStatus !== "NOT_REQUIRED"
    ) {
      return NextResponse.json(
        { error: "OK status breaches can only stay as NOT_REQUIRED." },
        { status: 400 },
      );
    }

    const updateData: Prisma.SupplierSlaBreachUpdateInput = {};
    const scalarUpdateData: Prisma.SupplierSlaBreachUncheckedUpdateInput = {};

    if (body.ownerUserId !== undefined) {
      const ownerUserId = trimText(body.ownerUserId, 191);
      if (ownerUserId) {
        const ownerUser = await prisma.user.findUnique({
          where: { id: ownerUserId },
          select: { id: true },
        });
        if (!ownerUser) {
          return NextResponse.json({ error: "Owner user not found." }, { status: 404 });
        }
        scalarUpdateData.ownerUserId = ownerUser.id;
      } else {
        scalarUpdateData.ownerUserId = null;
      }
    }

    if (body.dueDate !== undefined) {
      if (body.dueDate === null || String(body.dueDate).trim() === "") {
        scalarUpdateData.dueDate = null;
      } else {
        const dueDate = new Date(String(body.dueDate));
        if (Number.isNaN(dueDate.getTime())) {
          return NextResponse.json({ error: "Invalid due date." }, { status: 400 });
        }
        scalarUpdateData.dueDate = dueDate;
      }
    }

    const resolutionNote = trimText(body.resolutionNote, 1000);
    if (body.resolutionNote !== undefined) {
      scalarUpdateData.resolutionNote = resolutionNote;
    }
    const disputeReason = trimText(body.disputeReason, 1000);
    if (body.disputeReason !== undefined) {
      scalarUpdateData.disputeReason = disputeReason;
    }
    const disputeResolutionNote = trimText(body.disputeResolutionNote, 1000);
    if (body.disputeResolutionNote !== undefined) {
      scalarUpdateData.disputeResolutionNote = disputeResolutionNote;
    }

    if (requestedActionStatus) {
      scalarUpdateData.actionStatus = requestedActionStatus;
      if (requestedActionStatus === "NOT_REQUIRED") {
        scalarUpdateData.ownerUserId = null;
        scalarUpdateData.dueDate = null;
        scalarUpdateData.startedAt = null;
        scalarUpdateData.resolvedAt = null;
        scalarUpdateData.resolvedById = null;
        scalarUpdateData.resolutionNote = null;
      } else if (requestedActionStatus === "OPEN") {
        scalarUpdateData.resolvedAt = null;
        scalarUpdateData.resolvedById = null;
      } else if (requestedActionStatus === "IN_PROGRESS") {
        if (!breach.startedAt) {
          scalarUpdateData.startedAt = new Date();
        }
        scalarUpdateData.resolvedAt = null;
        scalarUpdateData.resolvedById = null;
      } else {
        const finalResolutionNote =
          resolutionNote ?? breach.resolutionNote ?? "";
        if (finalResolutionNote.trim().length < 3) {
          return NextResponse.json(
            {
              error:
                "Resolution note (minimum 3 chars) is required to resolve or dismiss an SLA action.",
            },
            { status: 400 },
          );
        }
        scalarUpdateData.resolutionNote = finalResolutionNote.trim().slice(0, 1000);
        scalarUpdateData.resolvedAt = new Date();
        scalarUpdateData.resolvedById = access.userId;
      }
    }

    if (body.acknowledgeAlert === true) {
      scalarUpdateData.alertAcknowledgedAt = new Date();
    }

    if (requestedDisputeStatus) {
      if (
        (requestedDisputeStatus === "RESOLVED" || requestedDisputeStatus === "REJECTED") &&
        !canResolveDisputes &&
        !canManageSla
      ) {
        return NextResponse.json(
          { error: "Missing permission: sla.dispute.resolve" },
          { status: 403 },
        );
      }
      scalarUpdateData.disputeStatus = requestedDisputeStatus;
      if (requestedDisputeStatus === "NONE") {
        scalarUpdateData.disputeReason = null;
        scalarUpdateData.disputeRaisedAt = null;
        scalarUpdateData.disputeRaisedById = null;
        scalarUpdateData.disputeResolutionNote = null;
        scalarUpdateData.disputeResolvedAt = null;
        scalarUpdateData.disputeResolvedById = null;
      } else if (requestedDisputeStatus === "OPEN" || requestedDisputeStatus === "UNDER_REVIEW") {
        const finalReason = disputeReason ?? breach.disputeReason ?? "";
        if (finalReason.trim().length < 3) {
          return NextResponse.json(
            { error: "Dispute reason (minimum 3 chars) is required for open dispute statuses." },
            { status: 400 },
          );
        }
        scalarUpdateData.disputeReason = finalReason.trim().slice(0, 1000);
        if (!breach.disputeRaisedAt) {
          scalarUpdateData.disputeRaisedAt = new Date();
        }
        if (!breach.disputeRaisedById) {
          scalarUpdateData.disputeRaisedById = access.userId;
        }
        scalarUpdateData.disputeResolvedAt = null;
        scalarUpdateData.disputeResolvedById = null;
      } else {
        const finalDisputeResolutionNote =
          disputeResolutionNote ?? breach.disputeResolutionNote ?? "";
        if (finalDisputeResolutionNote.trim().length < 3) {
          return NextResponse.json(
            { error: "Dispute resolution note (minimum 3 chars) is required." },
            { status: 400 },
          );
        }
        if (!breach.disputeRaisedAt && !breach.disputeReason) {
          return NextResponse.json(
            { error: "Dispute must be opened before resolving or rejecting it." },
            { status: 400 },
          );
        }
        scalarUpdateData.disputeResolutionNote = finalDisputeResolutionNote.trim().slice(0, 1000);
        scalarUpdateData.disputeResolvedAt = new Date();
        scalarUpdateData.disputeResolvedById = access.userId;
      }
    }

    if (Object.keys(scalarUpdateData).length === 0) {
      return NextResponse.json({ error: "No update payload provided." }, { status: 400 });
    }

    const before = toBreachActionSnapshot(breach);
    Object.assign(updateData, scalarUpdateData);

    const updated = await prisma.supplierSlaBreach.update({
      where: { id: breach.id },
      data: updateData,
      include: supplierSlaBreachInclude,
    });

    const affectedInvoices = await prisma.supplierInvoice.findMany({
      where: {
        supplierId: updated.supplierId,
        status: {
          in: ["POSTED", "PARTIALLY_PAID"],
        },
      },
      select: { id: true },
    });
    for (const invoice of affectedInvoices) {
      await evaluateSupplierInvoiceApControls(prisma, invoice.id, access.userId);
    }

    await logActivity({
      action: "update_action",
      entity: "supplier_sla_breach",
      entityId: updated.id,
      access,
      request,
      metadata: {
        message: `Updated SLA action workflow for ${updated.supplier.name} (${updated.supplier.code})`,
      },
      before,
      after: toBreachActionSnapshot(updated),
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("SCM SLA BREACHES PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update SLA breach action." },
      { status: 500 },
    );
  }
}
