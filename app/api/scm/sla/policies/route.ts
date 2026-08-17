import { NextRequest, NextResponse } from "next/server";
import { Prisma, type SupplierSlaTerminationAction } from "@/generated/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import { toDecimalAmount } from "@/lib/scm";
import {
  supplierSlaPolicyInclude,
  toSupplierSlaPolicyLogSnapshot,
} from "@/lib/supplier-sla";

const SLA_POLICY_READ_PERMISSIONS = ["sla.read", "sla.manage"] as const;

function canRead(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return SLA_POLICY_READ_PERMISSIONS.some((permission) => access.hasGlobal(permission));
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
    const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "1";

    const policies = await prisma.supplierSlaPolicy.findMany({
      where: {
        ...(Number.isInteger(supplierId) && supplierId > 0 ? { supplierId } : {}),
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ supplier: { name: "asc" } }, { id: "asc" }],
      include: supplierSlaPolicyInclude,
    });

    return NextResponse.json(policies);
  } catch (error) {
    console.error("SCM SLA POLICIES GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load SLA policies." },
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
      isActive?: unknown;
      effectiveFrom?: unknown;
      effectiveTo?: unknown;
      evaluationWindowDays?: unknown;
      minTrackedPoCount?: unknown;
      targetLeadTimeDays?: unknown;
      minimumOnTimeRate?: unknown;
      minimumFillRate?: unknown;
      maxOpenLatePoCount?: unknown;
      autoEvaluationEnabled?: unknown;
      warningActionDueDays?: unknown;
      breachActionDueDays?: unknown;
      terminationClauseEnabled?: unknown;
      terminationLookbackDays?: unknown;
      terminationMinBreachCount?: unknown;
      terminationMinCriticalCount?: unknown;
      terminationRecommendedAction?: unknown;
      terminationNote?: unknown;
      financialRuleActive?: unknown;
      holdPaymentsOnThreeWayVariance?: unknown;
      holdPaymentsOnOpenSlaAction?: unknown;
      allowPaymentHoldOverride?: unknown;
      autoCreditRecommendationEnabled?: unknown;
      autoApplyRecommendedCredit?: unknown;
      autoApplyRequireMatchedInvoice?: unknown;
      autoApplyBlockOnOpenDispute?: unknown;
      warningPenaltyRatePercent?: unknown;
      breachPenaltyRatePercent?: unknown;
      criticalPenaltyRatePercent?: unknown;
      minBreachCountForCredit?: unknown;
      autoApplyMaxAmount?: unknown;
      maxCreditCapAmount?: unknown;
      financialRuleNote?: unknown;
      note?: unknown;
    };

    const supplierId = Number(body.supplierId);
    if (!Number.isInteger(supplierId) || supplierId <= 0) {
      return NextResponse.json({ error: "Supplier is required." }, { status: 400 });
    }

    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, name: true, code: true },
    });
    if (!supplier) {
      return NextResponse.json({ error: "Supplier not found." }, { status: 404 });
    }

    const evaluationWindowDays = Number(body.evaluationWindowDays ?? 90);
    const minTrackedPoCount = Number(body.minTrackedPoCount ?? 3);
    const targetLeadTimeDays = Number(body.targetLeadTimeDays ?? 0);
    const maxOpenLatePoCount = Number(body.maxOpenLatePoCount ?? 0);
    const warningActionDueDays = Number(body.warningActionDueDays ?? 7);
    const breachActionDueDays = Number(body.breachActionDueDays ?? 3);
    const terminationLookbackDays = Number(body.terminationLookbackDays ?? 180);
    const terminationMinBreachCount = Number(body.terminationMinBreachCount ?? 3);
    const terminationMinCriticalCount = Number(body.terminationMinCriticalCount ?? 1);
    const minBreachCountForCredit = Number(body.minBreachCountForCredit ?? 1);
    const terminationRecommendedAction =
      body.terminationRecommendedAction === undefined
        ? "REVIEW_CONTRACT"
        : parseTerminationAction(body.terminationRecommendedAction);

    if (!Number.isInteger(evaluationWindowDays) || evaluationWindowDays < 7 || evaluationWindowDays > 730) {
      return NextResponse.json(
        { error: "Evaluation window must be between 7 and 730 days." },
        { status: 400 },
      );
    }
    if (!Number.isInteger(minTrackedPoCount) || minTrackedPoCount < 1 || minTrackedPoCount > 100) {
      return NextResponse.json(
        { error: "Minimum tracked PO count must be between 1 and 100." },
        { status: 400 },
      );
    }
    if (!Number.isInteger(targetLeadTimeDays) || targetLeadTimeDays < 1 || targetLeadTimeDays > 365) {
      return NextResponse.json(
        { error: "Target lead time must be between 1 and 365 days." },
        { status: 400 },
      );
    }
    if (!Number.isInteger(maxOpenLatePoCount) || maxOpenLatePoCount < 0 || maxOpenLatePoCount > 999) {
      return NextResponse.json(
        { error: "Maximum open late PO count must be between 0 and 999." },
        { status: 400 },
      );
    }
    if (!Number.isInteger(warningActionDueDays) || warningActionDueDays < 1 || warningActionDueDays > 60) {
      return NextResponse.json(
        { error: "Warning action due days must be between 1 and 60." },
        { status: 400 },
      );
    }
    if (!Number.isInteger(breachActionDueDays) || breachActionDueDays < 1 || breachActionDueDays > 60) {
      return NextResponse.json(
        { error: "Breach action due days must be between 1 and 60." },
        { status: 400 },
      );
    }
    if (!Number.isInteger(terminationLookbackDays) || terminationLookbackDays < 30 || terminationLookbackDays > 730) {
      return NextResponse.json(
        { error: "Termination lookback window must be between 30 and 730 days." },
        { status: 400 },
      );
    }
    if (
      !Number.isInteger(terminationMinBreachCount) ||
      terminationMinBreachCount < 1 ||
      terminationMinBreachCount > 20
    ) {
      return NextResponse.json(
        { error: "Termination minimum breach count must be between 1 and 20." },
        { status: 400 },
      );
    }
    if (
      !Number.isInteger(terminationMinCriticalCount) ||
      terminationMinCriticalCount < 0 ||
      terminationMinCriticalCount > 20
    ) {
      return NextResponse.json(
        { error: "Termination minimum critical count must be between 0 and 20." },
        { status: 400 },
      );
    }
    if (!Number.isInteger(minBreachCountForCredit) || minBreachCountForCredit < 1 || minBreachCountForCredit > 20) {
      return NextResponse.json(
        { error: "Minimum breach count for credit must be between 1 and 20." },
        { status: 400 },
      );
    }
    if (!terminationRecommendedAction) {
      return NextResponse.json(
        { error: "Invalid termination recommended action." },
        { status: 400 },
      );
    }

    const minimumOnTimeRate = toDecimalAmount(body.minimumOnTimeRate ?? 90, "Minimum on-time rate");
    const minimumFillRate = toDecimalAmount(body.minimumFillRate ?? 95, "Minimum fill rate");
    const warningPenaltyRatePercent = toDecimalAmount(
      body.warningPenaltyRatePercent ?? 0,
      "Warning penalty rate",
    );
    const breachPenaltyRatePercent = toDecimalAmount(
      body.breachPenaltyRatePercent ?? 2,
      "Breach penalty rate",
    );
    const criticalPenaltyRatePercent = toDecimalAmount(
      body.criticalPenaltyRatePercent ?? 5,
      "Critical penalty rate",
    );
    const maxCreditCapAmount =
      body.maxCreditCapAmount === null || body.maxCreditCapAmount === undefined || body.maxCreditCapAmount === ""
        ? null
        : toDecimalAmount(body.maxCreditCapAmount, "Max credit cap amount");
    const autoApplyMaxAmount =
      body.autoApplyMaxAmount === null || body.autoApplyMaxAmount === undefined || body.autoApplyMaxAmount === ""
        ? null
        : toDecimalAmount(body.autoApplyMaxAmount, "Auto-apply max amount");

    if (
      minimumOnTimeRate.gt(100) ||
      minimumFillRate.gt(100) ||
      warningPenaltyRatePercent.gt(100) ||
      breachPenaltyRatePercent.gt(100) ||
      criticalPenaltyRatePercent.gt(100)
    ) {
      return NextResponse.json(
        { error: "SLA percentage thresholds cannot exceed 100." },
        { status: 400 },
      );
    }

    const effectiveFrom = body.effectiveFrom ? new Date(String(body.effectiveFrom)) : new Date();
    const effectiveTo = body.effectiveTo ? new Date(String(body.effectiveTo)) : null;
    if (Number.isNaN(effectiveFrom.getTime())) {
      return NextResponse.json({ error: "Effective from date is invalid." }, { status: 400 });
    }
    if (effectiveTo && Number.isNaN(effectiveTo.getTime())) {
      return NextResponse.json({ error: "Effective to date is invalid." }, { status: 400 });
    }
    if (effectiveTo && effectiveTo.getTime() < effectiveFrom.getTime()) {
      return NextResponse.json(
        { error: "Effective to date cannot be before effective from date." },
        { status: 400 },
      );
    }

    const existing = await prisma.supplierSlaPolicy.findUnique({
      where: { supplierId },
      include: supplierSlaPolicyInclude,
    });

    const saved = await prisma.supplierSlaPolicy.upsert({
      where: { supplierId },
      create: {
        supplierId,
        isActive: body.isActive !== false,
        effectiveFrom,
        effectiveTo,
        evaluationWindowDays,
        minTrackedPoCount,
        targetLeadTimeDays,
        minimumOnTimeRate,
        minimumFillRate,
        maxOpenLatePoCount,
        autoEvaluationEnabled: body.autoEvaluationEnabled !== false,
        warningActionDueDays,
        breachActionDueDays,
        terminationClauseEnabled: body.terminationClauseEnabled === true,
        terminationLookbackDays,
        terminationMinBreachCount,
        terminationMinCriticalCount,
        terminationRecommendedAction,
        terminationNote:
          typeof body.terminationNote === "string" && body.terminationNote.trim().length > 0
            ? body.terminationNote.trim().slice(0, 500)
            : null,
        financialRule: {
          create: {
            isActive: body.financialRuleActive !== false,
            holdPaymentsOnThreeWayVariance: body.holdPaymentsOnThreeWayVariance !== false,
            holdPaymentsOnOpenSlaAction: body.holdPaymentsOnOpenSlaAction !== false,
            allowPaymentHoldOverride: body.allowPaymentHoldOverride !== false,
            autoCreditRecommendationEnabled: body.autoCreditRecommendationEnabled !== false,
            autoApplyRecommendedCredit: body.autoApplyRecommendedCredit === true,
            autoApplyRequireMatchedInvoice: body.autoApplyRequireMatchedInvoice !== false,
            autoApplyBlockOnOpenDispute: body.autoApplyBlockOnOpenDispute !== false,
            warningPenaltyRatePercent,
            breachPenaltyRatePercent,
            criticalPenaltyRatePercent,
            minBreachCountForCredit,
            autoApplyMaxAmount,
            maxCreditCapAmount,
            note:
              typeof body.financialRuleNote === "string" && body.financialRuleNote.trim().length > 0
                ? body.financialRuleNote.trim().slice(0, 500)
                : null,
            createdById: access.userId,
            updatedById: access.userId,
          },
        },
        note:
          typeof body.note === "string" && body.note.trim().length > 0
            ? body.note.trim().slice(0, 500)
            : null,
        createdById: access.userId,
        updatedById: access.userId,
      },
      update: {
        isActive: body.isActive !== false,
        effectiveFrom,
        effectiveTo,
        evaluationWindowDays,
        minTrackedPoCount,
        targetLeadTimeDays,
        minimumOnTimeRate,
        minimumFillRate,
        maxOpenLatePoCount,
        autoEvaluationEnabled: body.autoEvaluationEnabled !== false,
        warningActionDueDays,
        breachActionDueDays,
        terminationClauseEnabled: body.terminationClauseEnabled === true,
        terminationLookbackDays,
        terminationMinBreachCount,
        terminationMinCriticalCount,
        terminationRecommendedAction,
        terminationNote:
          typeof body.terminationNote === "string" && body.terminationNote.trim().length > 0
            ? body.terminationNote.trim().slice(0, 500)
            : null,
        financialRule: {
          upsert: {
            create: {
              isActive: body.financialRuleActive !== false,
              holdPaymentsOnThreeWayVariance: body.holdPaymentsOnThreeWayVariance !== false,
              holdPaymentsOnOpenSlaAction: body.holdPaymentsOnOpenSlaAction !== false,
              allowPaymentHoldOverride: body.allowPaymentHoldOverride !== false,
              autoCreditRecommendationEnabled: body.autoCreditRecommendationEnabled !== false,
              autoApplyRecommendedCredit: body.autoApplyRecommendedCredit === true,
              autoApplyRequireMatchedInvoice: body.autoApplyRequireMatchedInvoice !== false,
              autoApplyBlockOnOpenDispute: body.autoApplyBlockOnOpenDispute !== false,
              warningPenaltyRatePercent,
              breachPenaltyRatePercent,
              criticalPenaltyRatePercent,
              minBreachCountForCredit,
              autoApplyMaxAmount,
              maxCreditCapAmount,
              note:
                typeof body.financialRuleNote === "string" && body.financialRuleNote.trim().length > 0
                  ? body.financialRuleNote.trim().slice(0, 500)
                  : null,
              createdById: access.userId,
              updatedById: access.userId,
            },
            update: {
              isActive: body.financialRuleActive !== false,
              holdPaymentsOnThreeWayVariance: body.holdPaymentsOnThreeWayVariance !== false,
              holdPaymentsOnOpenSlaAction: body.holdPaymentsOnOpenSlaAction !== false,
              allowPaymentHoldOverride: body.allowPaymentHoldOverride !== false,
              autoCreditRecommendationEnabled: body.autoCreditRecommendationEnabled !== false,
              autoApplyRecommendedCredit: body.autoApplyRecommendedCredit === true,
              autoApplyRequireMatchedInvoice: body.autoApplyRequireMatchedInvoice !== false,
              autoApplyBlockOnOpenDispute: body.autoApplyBlockOnOpenDispute !== false,
              warningPenaltyRatePercent,
              breachPenaltyRatePercent,
              criticalPenaltyRatePercent,
              minBreachCountForCredit,
              autoApplyMaxAmount,
              maxCreditCapAmount,
              note:
                typeof body.financialRuleNote === "string" && body.financialRuleNote.trim().length > 0
                  ? body.financialRuleNote.trim().slice(0, 500)
                  : null,
              updatedById: access.userId,
            },
          },
        },
        note:
          typeof body.note === "string" && body.note.trim().length > 0
            ? body.note.trim().slice(0, 500)
            : null,
        updatedById: access.userId,
      },
      include: supplierSlaPolicyInclude,
    });

    await logActivity({
      action: existing ? "update" : "create",
      entity: "supplier_sla_policy",
      entityId: saved.id,
      access,
      request,
      metadata: {
        message: `${existing ? "Updated" : "Created"} SLA policy for supplier ${saved.supplier.name} (${saved.supplier.code})`,
      },
      before: existing ? toSupplierSlaPolicyLogSnapshot(existing) : null,
      after: toSupplierSlaPolicyLogSnapshot(saved),
    });

    return NextResponse.json(saved);
  } catch (error: any) {
    console.error("SCM SLA POLICIES POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to save SLA policy." },
      { status: 500 },
    );
  }
}
