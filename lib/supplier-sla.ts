import {
  Prisma,
  type SupplierInvoicePaymentHoldStatus,
  type SupplierInvoiceSlaCreditStatus,
  type SupplierSlaActionStatus,
  type SupplierSlaDisputeStatus,
  type SupplierSlaEvaluationStatus,
  type SupplierSlaSeverity,
  type SupplierSlaTerminationCaseStatus,
  type ThreeWayMatchStatus,
} from "@/generated/prisma";
import { logActivity } from "@/lib/activity-log";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/lib/rbac";
import { syncSupplierInvoicePaymentStatus } from "@/lib/scm";
import {
  buildSupplierLeadTimeIntelligence,
  supplierLeadTimeInclude,
  type SupplierLeadTimeIntelligence,
} from "@/lib/supplier-intelligence";

const ACTIVE_ACTION_STATUSES: SupplierSlaActionStatus[] = ["OPEN", "IN_PROGRESS"];
const ACTIVE_BREACH_STATUSES: SupplierSlaEvaluationStatus[] = ["WARNING", "BREACH"];
const ACTIVE_DISPUTE_STATUSES: SupplierSlaDisputeStatus[] = ["OPEN", "UNDER_REVIEW"];
const ACTIVE_TERMINATION_CASE_STATUSES: SupplierSlaTerminationCaseStatus[] = [
  "OPEN",
  "IN_REVIEW",
  "APPROVED",
];

type DbClient = Prisma.TransactionClient | typeof prisma;

function roundToTwo(value: number | null) {
  if (value === null || Number.isNaN(value)) return null;
  return Math.round(value * 100) / 100;
}

function addDays(baseDate: Date, days: number) {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + days);
  return next;
}

function clampDueDays(value: number, fallback: number) {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(60, Math.max(1, value));
}

function clampPercent(value: number | null | undefined, fallback: number) {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return Math.min(100, Math.max(0, value));
}

function toDate(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date;
}

export const supplierSlaPolicyInclude = Prisma.validator<Prisma.SupplierSlaPolicyInclude>()({
  supplier: {
    select: {
      id: true,
      name: true,
      code: true,
      isActive: true,
      leadTimeDays: true,
      paymentTermsDays: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  updatedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  financialRule: {
    select: {
      id: true,
      isActive: true,
      holdPaymentsOnThreeWayVariance: true,
      holdPaymentsOnOpenSlaAction: true,
      allowPaymentHoldOverride: true,
      autoCreditRecommendationEnabled: true,
      autoApplyRecommendedCredit: true,
      autoApplyRequireMatchedInvoice: true,
      autoApplyBlockOnOpenDispute: true,
      warningPenaltyRatePercent: true,
      breachPenaltyRatePercent: true,
      criticalPenaltyRatePercent: true,
      minBreachCountForCredit: true,
      autoApplyMaxAmount: true,
      maxCreditCapAmount: true,
      note: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  breaches: {
    orderBy: [{ evaluationDate: "desc" }, { id: "desc" }],
    take: 5,
    select: {
      id: true,
      evaluationDate: true,
      status: true,
      severity: true,
      breachCount: true,
      trackedPoCount: true,
      completedPoCount: true,
      openLatePoCount: true,
      observedLeadTimeDays: true,
      onTimeRatePercent: true,
      fillRatePercent: true,
      actionStatus: true,
      ownerUserId: true,
      dueDate: true,
      startedAt: true,
      resolvedAt: true,
      resolvedById: true,
      resolutionNote: true,
      alertTriggeredAt: true,
      alertAcknowledgedAt: true,
      disputeStatus: true,
      disputeReason: true,
      disputeRaisedAt: true,
      disputeRaisedById: true,
      disputeResolutionNote: true,
      disputeResolvedAt: true,
      disputeResolvedById: true,
      terminationCaseId: true,
      terminationSuggestedAt: true,
      terminationSuggestionNote: true,
      issues: true,
      periodStart: true,
      periodEnd: true,
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      resolvedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      disputeRaisedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      disputeResolvedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      terminationCase: {
        select: {
          id: true,
          status: true,
          recommendedAction: true,
          ownerUserId: true,
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          resolvedAt: true,
        },
      },
    },
  },
});

export const supplierSlaBreachInclude = Prisma.validator<Prisma.SupplierSlaBreachInclude>()({
  supplier: {
    select: { id: true, name: true, code: true },
  },
  policy: {
    select: {
      id: true,
      targetLeadTimeDays: true,
      minimumOnTimeRate: true,
      minimumFillRate: true,
      maxOpenLatePoCount: true,
      minTrackedPoCount: true,
      evaluationWindowDays: true,
      autoEvaluationEnabled: true,
      warningActionDueDays: true,
      breachActionDueDays: true,
      financialRule: {
        select: {
          id: true,
          isActive: true,
          holdPaymentsOnThreeWayVariance: true,
          holdPaymentsOnOpenSlaAction: true,
          allowPaymentHoldOverride: true,
          autoCreditRecommendationEnabled: true,
          autoApplyRecommendedCredit: true,
          autoApplyRequireMatchedInvoice: true,
          autoApplyBlockOnOpenDispute: true,
          warningPenaltyRatePercent: true,
          breachPenaltyRatePercent: true,
          criticalPenaltyRatePercent: true,
          minBreachCountForCredit: true,
          autoApplyMaxAmount: true,
          maxCreditCapAmount: true,
        },
      },
      isActive: true,
      terminationClauseEnabled: true,
      terminationLookbackDays: true,
      terminationMinBreachCount: true,
      terminationMinCriticalCount: true,
      terminationRecommendedAction: true,
    },
  },
  owner: {
    select: { id: true, name: true, email: true },
  },
  resolvedBy: {
    select: { id: true, name: true, email: true },
  },
  disputeRaisedBy: {
    select: { id: true, name: true, email: true },
  },
  disputeResolvedBy: {
    select: { id: true, name: true, email: true },
  },
  evaluatedBy: {
    select: { id: true, name: true, email: true },
  },
  terminationCase: {
    select: {
      id: true,
      status: true,
      recommendedAction: true,
      openBreachCount: true,
      criticalBreachCount: true,
      lookbackDays: true,
      reason: true,
      ownerUserId: true,
      owner: {
        select: { id: true, name: true, email: true },
      },
      reviewedAt: true,
      resolvedAt: true,
      resolvedById: true,
      resolutionNote: true,
    },
  },
});

export const supplierSlaTerminationCaseInclude =
  Prisma.validator<Prisma.SupplierSlaTerminationCaseInclude>()({
    supplier: {
      select: { id: true, name: true, code: true },
    },
    policy: {
      select: {
        id: true,
        isActive: true,
        terminationClauseEnabled: true,
        terminationLookbackDays: true,
        terminationMinBreachCount: true,
        terminationMinCriticalCount: true,
        terminationRecommendedAction: true,
      },
    },
    triggerBreach: {
      select: {
        id: true,
        evaluationDate: true,
        status: true,
        severity: true,
        breachCount: true,
        disputeStatus: true,
      },
    },
    owner: {
      select: { id: true, name: true, email: true },
    },
    resolvedBy: {
      select: { id: true, name: true, email: true },
    },
    createdBy: {
      select: { id: true, name: true, email: true },
    },
  });

export type SupplierSlaPolicyWithRelations = Prisma.SupplierSlaPolicyGetPayload<{
  include: typeof supplierSlaPolicyInclude;
}>;

export type SupplierSlaBreachWithRelations = Prisma.SupplierSlaBreachGetPayload<{
  include: typeof supplierSlaBreachInclude;
}>;

export type SupplierSlaTerminationCaseWithRelations = Prisma.SupplierSlaTerminationCaseGetPayload<{
  include: typeof supplierSlaTerminationCaseInclude;
}>;

export type SupplierSlaEvaluationResult = {
  status: "OK" | "WARNING" | "BREACH";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  breachCount: number;
  issues: string[];
  observedLeadTimeDays: number | null;
  onTimeRatePercent: number | null;
  fillRatePercent: number | null;
  trackedPoCount: number;
  completedPoCount: number;
  openLatePoCount: number;
};

export type RunSupplierSlaEvaluationInput = {
  supplierId?: number | null;
  policyId?: number | null;
  includeInactive?: boolean;
  autoOnly?: boolean;
  actorUserId?: string | null;
  access?: AccessContext | null;
  request?: Request | null;
};

export type RunSupplierSlaEvaluationResult = {
  generatedAt: string;
  count: number;
  rows: SupplierSlaBreachWithRelations[];
};

export function evaluateSupplierSlaPolicy(
  policy: {
    minTrackedPoCount: number;
    targetLeadTimeDays: number;
    minimumOnTimeRate: Prisma.Decimal | number | string;
    minimumFillRate: Prisma.Decimal | number | string;
    maxOpenLatePoCount: number;
  },
  intelligence: SupplierLeadTimeIntelligence,
): SupplierSlaEvaluationResult {
  const issues: string[] = [];
  let breachCount = 0;

  const trackedPoCount = intelligence.metrics.trackedPoCount;
  const completedPoCount = intelligence.metrics.completedPoCount;
  const openLatePoCount = intelligence.metrics.openLatePoCount;
  const observedLeadTimeDays = roundToTwo(intelligence.metrics.averageFinalReceiptLeadTimeDays);
  const onTimeRatePercent = roundToTwo(intelligence.metrics.onTimeRatePercent);
  const fillRatePercent = roundToTwo(intelligence.metrics.averageFillRatePercent);

  if (trackedPoCount < policy.minTrackedPoCount) {
    issues.push(
      `Insufficient sample size (${trackedPoCount}) for reliable SLA scoring. Minimum required is ${policy.minTrackedPoCount}.`,
    );
  }

  if (observedLeadTimeDays !== null && observedLeadTimeDays > policy.targetLeadTimeDays) {
    breachCount += 1;
    issues.push(
      `Observed lead time ${observedLeadTimeDays}d exceeded SLA target ${policy.targetLeadTimeDays}d.`,
    );
  }

  const minimumOnTimeRate = Number(policy.minimumOnTimeRate);
  if (onTimeRatePercent !== null && onTimeRatePercent < minimumOnTimeRate) {
    breachCount += 1;
    issues.push(
      `On-time rate ${onTimeRatePercent}% is below SLA minimum ${minimumOnTimeRate}%.`,
    );
  }

  const minimumFillRate = Number(policy.minimumFillRate);
  if (fillRatePercent !== null && fillRatePercent < minimumFillRate) {
    breachCount += 1;
    issues.push(`Fill rate ${fillRatePercent}% is below SLA minimum ${minimumFillRate}%.`);
  }

  if (openLatePoCount > policy.maxOpenLatePoCount) {
    breachCount += 1;
    issues.push(
      `Open late PO count ${openLatePoCount} exceeded SLA threshold ${policy.maxOpenLatePoCount}.`,
    );
  }

  let status: SupplierSlaEvaluationResult["status"] = "OK";
  if (breachCount >= 2) {
    status = "BREACH";
  } else if (breachCount === 1 || trackedPoCount < policy.minTrackedPoCount) {
    status = "WARNING";
  }

  let severity: SupplierSlaEvaluationResult["severity"] = "LOW";
  if (status === "WARNING") {
    severity = breachCount === 0 ? "LOW" : "MEDIUM";
  } else if (status === "BREACH") {
    severity = breachCount >= 3 ? "CRITICAL" : "HIGH";
  }

  return {
    status,
    severity,
    breachCount,
    issues,
    observedLeadTimeDays,
    onTimeRatePercent,
    fillRatePercent,
    trackedPoCount,
    completedPoCount,
    openLatePoCount,
  };
}

function buildAlertMessage(
  supplierName: string,
  status: SupplierSlaEvaluationResult["status"],
  severity: SupplierSlaEvaluationResult["severity"],
  issues: string[],
) {
  if (status === "OK") return null;
  const topIssue = issues[0] ?? "SLA threshold exceeded.";
  return `[${severity}] ${supplierName} SLA ${status}: ${topIssue}`.slice(0, 500);
}

type SupplierSlaFinancialRuleSnapshot = {
  isActive: boolean;
  holdPaymentsOnThreeWayVariance: boolean;
  holdPaymentsOnOpenSlaAction: boolean;
  allowPaymentHoldOverride: boolean;
  autoCreditRecommendationEnabled: boolean;
  autoApplyRecommendedCredit: boolean;
  autoApplyRequireMatchedInvoice: boolean;
  autoApplyBlockOnOpenDispute: boolean;
  warningPenaltyRatePercent: Prisma.Decimal;
  breachPenaltyRatePercent: Prisma.Decimal;
  criticalPenaltyRatePercent: Prisma.Decimal;
  minBreachCountForCredit: number;
  autoApplyMaxAmount: Prisma.Decimal | null;
  maxCreditCapAmount: Prisma.Decimal | null;
};

function getDefaultFinancialRuleSnapshot(): SupplierSlaFinancialRuleSnapshot {
  return {
    isActive: true,
    holdPaymentsOnThreeWayVariance: true,
    holdPaymentsOnOpenSlaAction: true,
    allowPaymentHoldOverride: true,
    autoCreditRecommendationEnabled: true,
    autoApplyRecommendedCredit: false,
    autoApplyRequireMatchedInvoice: true,
    autoApplyBlockOnOpenDispute: true,
    warningPenaltyRatePercent: new Prisma.Decimal(0),
    breachPenaltyRatePercent: new Prisma.Decimal(2),
    criticalPenaltyRatePercent: new Prisma.Decimal(5),
    minBreachCountForCredit: 1,
    autoApplyMaxAmount: null,
    maxCreditCapAmount: null,
  };
}

async function getSupplierSlaFinancialContext(
  tx: DbClient,
  supplierId: number,
) {
  const [policy, latestOpenBreach, latestOpenDisputeBreach] = await Promise.all([
    tx.supplierSlaPolicy.findFirst({
      where: {
        supplierId,
        isActive: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: {
        financialRule: true,
      },
    }),
    tx.supplierSlaBreach.findFirst({
      where: {
        supplierId,
        status: { in: ACTIVE_BREACH_STATUSES },
        actionStatus: { in: ACTIVE_ACTION_STATUSES },
      },
      orderBy: [{ evaluationDate: "desc" }, { id: "desc" }],
      select: {
        id: true,
        status: true,
        severity: true,
        breachCount: true,
        issues: true,
        evaluationDate: true,
      },
    }),
    tx.supplierSlaBreach.findFirst({
      where: {
        supplierId,
        disputeStatus: { in: ACTIVE_DISPUTE_STATUSES },
      },
      orderBy: [{ evaluationDate: "desc" }, { id: "desc" }],
      select: {
        id: true,
        disputeStatus: true,
        actionStatus: true,
        evaluationDate: true,
      },
    }),
  ]);

  const rule = policy?.financialRule;
  const effectiveRule: SupplierSlaFinancialRuleSnapshot = rule
    ? {
        isActive: rule.isActive,
        holdPaymentsOnThreeWayVariance: rule.holdPaymentsOnThreeWayVariance,
        holdPaymentsOnOpenSlaAction: rule.holdPaymentsOnOpenSlaAction,
        allowPaymentHoldOverride: rule.allowPaymentHoldOverride,
        autoCreditRecommendationEnabled: rule.autoCreditRecommendationEnabled,
        autoApplyRecommendedCredit: rule.autoApplyRecommendedCredit,
        autoApplyRequireMatchedInvoice: rule.autoApplyRequireMatchedInvoice,
        autoApplyBlockOnOpenDispute: rule.autoApplyBlockOnOpenDispute,
        warningPenaltyRatePercent: rule.warningPenaltyRatePercent,
        breachPenaltyRatePercent: rule.breachPenaltyRatePercent,
        criticalPenaltyRatePercent: rule.criticalPenaltyRatePercent,
        minBreachCountForCredit: Math.max(1, rule.minBreachCountForCredit),
        autoApplyMaxAmount: rule.autoApplyMaxAmount,
        maxCreditCapAmount: rule.maxCreditCapAmount,
      }
    : getDefaultFinancialRuleSnapshot();

  return {
    policyId: policy?.id ?? null,
    financialRuleId: rule?.id ?? null,
    effectiveRule,
    latestOpenBreach,
    latestOpenDisputeBreach,
    hasOpenDispute: Boolean(latestOpenDisputeBreach),
    policy,
  };
}

function getSeverityPenaltyRate(
  rule: SupplierSlaFinancialRuleSnapshot,
  status: SupplierSlaEvaluationStatus,
  severity: SupplierSlaSeverity,
) {
  if (status === "WARNING") {
    return clampPercent(Number(rule.warningPenaltyRatePercent), 0);
  }
  if (severity === "CRITICAL") {
    return clampPercent(Number(rule.criticalPenaltyRatePercent), 0);
  }
  return clampPercent(Number(rule.breachPenaltyRatePercent), 0);
}

type SupplierInvoiceApDecision = {
  holdStatus: SupplierInvoicePaymentHoldStatus;
  holdReason: string | null;
  recommendedCreditAmount: Prisma.Decimal;
  creditStatus: SupplierInvoiceSlaCreditStatus;
  creditReason: string | null;
  shouldUpdateHoldAt: boolean;
  shouldUpdateReleasedAt: boolean;
  shouldClearOverrideNote: boolean;
};

function decideInvoiceApControls(input: {
  invoice: {
    total: Prisma.Decimal;
    matchStatus: ThreeWayMatchStatus;
    paymentHoldStatus: SupplierInvoicePaymentHoldStatus;
    paymentHoldAt: Date | null;
    paymentHoldReleasedAt: Date | null;
    paymentHoldOverrideNote: string | null;
    slaCreditStatus: SupplierInvoiceSlaCreditStatus;
    slaRecommendedCredit: Prisma.Decimal;
  };
  rule: SupplierSlaFinancialRuleSnapshot;
  latestOpenBreach: {
    id: number;
    status: SupplierSlaEvaluationStatus;
    severity: SupplierSlaSeverity;
    breachCount: number;
    issues: Prisma.JsonValue | null;
  } | null;
}): SupplierInvoiceApDecision {
  const { invoice, rule, latestOpenBreach } = input;
  const holdReasons: string[] = [];

  if (rule.isActive && rule.holdPaymentsOnThreeWayVariance && invoice.matchStatus !== "MATCHED") {
    holdReasons.push("Payment held because invoice is not MATCHED in 3-way match.");
  }
  if (rule.isActive && rule.holdPaymentsOnOpenSlaAction && latestOpenBreach) {
    holdReasons.push(
      `Payment held due to open supplier SLA action (breach id ${latestOpenBreach.id}).`,
    );
  }

  const hasHoldReasons = holdReasons.length > 0;
  let holdStatus: SupplierInvoicePaymentHoldStatus = invoice.paymentHoldStatus;
  if (!hasHoldReasons) {
    holdStatus = "CLEAR";
  } else if (invoice.paymentHoldStatus === "OVERRIDDEN") {
    holdStatus = "OVERRIDDEN";
  } else {
    holdStatus = "HELD";
  }

  let recommendedCreditAmount = new Prisma.Decimal(0);
  let creditReason: string | null = null;
  let creditStatus: SupplierInvoiceSlaCreditStatus = invoice.slaCreditStatus;

  if (
    rule.isActive &&
    rule.autoCreditRecommendationEnabled &&
    latestOpenBreach &&
    latestOpenBreach.breachCount >= rule.minBreachCountForCredit
  ) {
    const penaltyRate = getSeverityPenaltyRate(
      rule,
      latestOpenBreach.status,
      latestOpenBreach.severity,
    );
    if (penaltyRate > 0) {
      recommendedCreditAmount = invoice.total.mul(penaltyRate).div(100);
      if (rule.maxCreditCapAmount && recommendedCreditAmount.gt(rule.maxCreditCapAmount)) {
        recommendedCreditAmount = new Prisma.Decimal(rule.maxCreditCapAmount);
      }
      if (recommendedCreditAmount.gt(0)) {
        creditReason = `Recommended ${penaltyRate}% SLA credit based on ${latestOpenBreach.status}/${latestOpenBreach.severity} breach.`;
      }
    }
  }

  if (invoice.slaCreditStatus !== "APPLIED" && invoice.slaCreditStatus !== "WAIVED") {
    creditStatus = recommendedCreditAmount.gt(0) ? "RECOMMENDED" : "NONE";
  }
  if (!recommendedCreditAmount.gt(0) && creditStatus === "NONE") {
    creditReason = null;
  }

  return {
    holdStatus,
    holdReason: hasHoldReasons ? holdReasons.join(" ") : null,
    recommendedCreditAmount,
    creditStatus,
    creditReason,
    shouldUpdateHoldAt: holdStatus === "HELD" && !invoice.paymentHoldAt,
    shouldUpdateReleasedAt:
      holdStatus === "CLEAR" &&
      (invoice.paymentHoldStatus === "HELD" || invoice.paymentHoldStatus === "OVERRIDDEN"),
    shouldClearOverrideNote: holdStatus === "CLEAR",
  };
}

export async function evaluateSupplierInvoiceApControls(
  tx: DbClient,
  supplierInvoiceId: number,
  actorUserId: string | null = null,
) {
  const invoice = await tx.supplierInvoice.findUnique({
    where: { id: supplierInvoiceId },
    select: {
      id: true,
      invoiceNumber: true,
      supplierId: true,
      status: true,
      currency: true,
      total: true,
      matchStatus: true,
      paymentHoldStatus: true,
      paymentHoldReason: true,
      paymentHoldAt: true,
      paymentHoldReleasedAt: true,
      paymentHoldReleasedById: true,
      paymentHoldOverrideNote: true,
      slaRecommendedCredit: true,
      slaCreditStatus: true,
      slaCreditReason: true,
      slaCreditUpdatedAt: true,
    },
  });
  if (!invoice) {
    throw new Error("Supplier invoice not found.");
  }

  const financialContext = await getSupplierSlaFinancialContext(tx, invoice.supplierId);
  const decision = decideInvoiceApControls({
    invoice,
    rule: financialContext.effectiveRule,
    latestOpenBreach: financialContext.latestOpenBreach,
  });

  const now = new Date();
  let updated = await tx.supplierInvoice.update({
    where: { id: invoice.id },
    data: {
      paymentHoldStatus: decision.holdStatus,
      paymentHoldReason: decision.holdReason,
      paymentHoldAt: decision.shouldUpdateHoldAt ? now : decision.holdStatus === "CLEAR" ? null : invoice.paymentHoldAt,
      paymentHoldReleasedAt: decision.shouldUpdateReleasedAt
        ? now
        : decision.holdStatus === "HELD"
          ? null
          : invoice.paymentHoldReleasedAt,
      paymentHoldReleasedById: decision.shouldUpdateReleasedAt
        ? actorUserId
        : decision.holdStatus === "HELD"
          ? null
          : invoice.paymentHoldReleasedById,
      paymentHoldOverrideNote: decision.shouldClearOverrideNote
        ? null
        : invoice.paymentHoldOverrideNote,
      slaRecommendedCredit: decision.recommendedCreditAmount,
      slaCreditStatus: decision.creditStatus,
      slaCreditReason: decision.creditReason,
      slaCreditUpdatedAt: now,
    },
    include: {
      supplier: {
        select: { id: true, name: true, code: true },
      },
      paymentHoldReleasedBy: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  const rule = financialContext.effectiveRule;
  const autoApplyAmountCap = rule.autoApplyMaxAmount;
  const canAutoApplyRecommendedCredit =
    rule.isActive &&
    rule.autoApplyRecommendedCredit &&
    decision.creditStatus === "RECOMMENDED" &&
    decision.recommendedCreditAmount.gt(0) &&
    invoice.status !== "CANCELLED" &&
    (invoice.status === "POSTED" || invoice.status === "PARTIALLY_PAID") &&
    (invoice.slaCreditStatus === "NONE" || invoice.slaCreditStatus === "RECOMMENDED") &&
    (!rule.autoApplyRequireMatchedInvoice || invoice.matchStatus === "MATCHED") &&
    (!rule.autoApplyBlockOnOpenDispute || !financialContext.hasOpenDispute) &&
    (!autoApplyAmountCap || decision.recommendedCreditAmount.lte(autoApplyAmountCap));

  if (canAutoApplyRecommendedCredit) {
    await tx.supplierLedgerEntry.create({
      data: {
        supplierId: invoice.supplierId,
        entryDate: now,
        entryType: "ADJUSTMENT",
        direction: "CREDIT",
        amount: decision.recommendedCreditAmount,
        currency: invoice.currency || "BDT",
        note: `Auto-applied SLA credit for invoice ${invoice.invoiceNumber}.`,
        referenceType: "SLA_AUTO_CREDIT",
        referenceNumber: invoice.invoiceNumber,
        supplierInvoiceId: invoice.id,
        createdById: actorUserId,
      },
    });

    await syncSupplierInvoicePaymentStatus(tx as Prisma.TransactionClient, invoice.id);
    updated = await tx.supplierInvoice.update({
      where: { id: invoice.id },
      data: {
        slaCreditStatus: "APPLIED",
        slaCreditUpdatedAt: now,
        slaCreditReason: `Auto-applied SLA credit (${decision.recommendedCreditAmount.toString()}) by policy rule.`,
      },
      include: {
        supplier: {
          select: { id: true, name: true, code: true },
        },
        paymentHoldReleasedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  return updated;
}

function clampInt(value: number, min: number, max: number, fallback: number) {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

async function evaluateSupplierTerminationClause(input: {
  tx: DbClient;
  policy: SupplierSlaPolicyWithRelations;
  createdBreachId: number;
  ownerUserId: string | null;
  actorUserId: string | null;
  access: AccessContext | null;
  request: Request | null;
}) {
  const { tx, policy, createdBreachId, ownerUserId, actorUserId, access, request } = input;
  if (!policy.terminationClauseEnabled) return null;

  const lookbackDays = clampInt(policy.terminationLookbackDays, 30, 730, 180);
  const minBreachCount = clampInt(policy.terminationMinBreachCount, 1, 20, 3);
  const minCriticalCount = clampInt(policy.terminationMinCriticalCount, 0, 20, 1);
  const lookbackFrom = toDate(lookbackDays);

  const recentBreaches = await tx.supplierSlaBreach.findMany({
    where: {
      supplierSlaPolicyId: policy.id,
      evaluationDate: { gte: lookbackFrom },
      status: "BREACH",
    },
    select: {
      id: true,
      severity: true,
    },
  });

  const openBreachCount = recentBreaches.length;
  const criticalBreachCount = recentBreaches.filter((row) => row.severity === "CRITICAL").length;
  const thresholdReached =
    openBreachCount >= minBreachCount && criticalBreachCount >= minCriticalCount;

  if (!thresholdReached) {
    return null;
  }

  const reason =
    `Termination clause threshold reached in last ${lookbackDays} days: ` +
    `${openBreachCount} breaches (${criticalBreachCount} critical).`;
  const now = new Date();

  const existingCase = await tx.supplierSlaTerminationCase.findFirst({
    where: {
      supplierSlaPolicyId: policy.id,
      status: { in: ACTIVE_TERMINATION_CASE_STATUSES },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });

  const terminationCase = existingCase
    ? await tx.supplierSlaTerminationCase.update({
        where: { id: existingCase.id },
        data: {
          triggerBreachId: createdBreachId,
          openBreachCount,
          criticalBreachCount,
          lookbackDays,
          recommendedAction: policy.terminationRecommendedAction,
          reason,
          ownerUserId: existingCase.ownerUserId ?? ownerUserId,
        },
      })
    : await tx.supplierSlaTerminationCase.create({
        data: {
          supplierId: policy.supplierId,
          supplierSlaPolicyId: policy.id,
          triggerBreachId: createdBreachId,
          status: "OPEN",
          recommendedAction: policy.terminationRecommendedAction,
          openBreachCount,
          criticalBreachCount,
          lookbackDays,
          reason,
          ownerUserId,
          createdById: actorUserId,
        },
      });

  await tx.supplierSlaBreach.update({
    where: { id: createdBreachId },
    data: {
      terminationCaseId: terminationCase.id,
      terminationSuggestedAt: now,
      terminationSuggestionNote: reason,
    },
  });

  await logActivity({
    action: existingCase ? "refresh_case" : "open_case",
    entity: "supplier_sla_termination",
    entityId: terminationCase.id,
    access,
    userId: actorUserId,
    request,
    metadata: {
      message: `${existingCase ? "Updated" : "Opened"} SLA termination case for ${policy.supplier.name} (${policy.supplier.code})`,
      recommendedAction: terminationCase.recommendedAction,
      openBreachCount,
      criticalBreachCount,
      lookbackDays,
    },
  });

  return terminationCase;
}

export async function runSupplierSlaEvaluation({
  supplierId = null,
  policyId = null,
  includeInactive = false,
  autoOnly = false,
  actorUserId = null,
  access = null,
  request = null,
}: RunSupplierSlaEvaluationInput): Promise<RunSupplierSlaEvaluationResult> {
  const policies = await prisma.supplierSlaPolicy.findMany({
    where: {
      ...(Number.isInteger(policyId) && (policyId as number) > 0 ? { id: policyId as number } : {}),
      ...(Number.isInteger(supplierId) && (supplierId as number) > 0
        ? { supplierId: supplierId as number }
        : {}),
      ...(includeInactive ? {} : { isActive: true }),
      ...(autoOnly ? { autoEvaluationEnabled: true } : {}),
    },
    orderBy: [{ supplier: { name: "asc" } }, { id: "asc" }],
    include: supplierSlaPolicyInclude,
  });

  if (policies.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      count: 0,
      rows: [],
    };
  }

  const createdRows: SupplierSlaBreachWithRelations[] = [];

  for (const policy of policies) {
    const periodEnd = new Date();
    const periodStart = toDate(policy.evaluationWindowDays);

    const supplier = await prisma.supplier.findUnique({
      where: { id: policy.supplierId },
      include: supplierLeadTimeInclude,
    });
    if (!supplier) {
      continue;
    }

    const intelligence = buildSupplierLeadTimeIntelligence(
      {
        ...supplier,
        purchaseOrders: supplier.purchaseOrders.filter(
          (purchaseOrder) => purchaseOrder.orderDate >= periodStart,
        ),
      },
      periodEnd,
    );

    const evaluation = evaluateSupplierSlaPolicy(policy, intelligence);
    const dueDays =
      evaluation.status === "BREACH"
        ? clampDueDays(policy.breachActionDueDays, 3)
        : clampDueDays(policy.warningActionDueDays, 7);

    const previousOpenBreach = await prisma.supplierSlaBreach.findFirst({
      where: {
        supplierSlaPolicyId: policy.id,
        actionStatus: { in: ACTIVE_ACTION_STATUSES },
      },
      orderBy: [{ evaluationDate: "desc" }, { id: "desc" }],
      select: { ownerUserId: true },
    });

    const actionStatus: SupplierSlaActionStatus =
      evaluation.status === "OK" ? "NOT_REQUIRED" : "OPEN";
    const ownerUserId = actionStatus === "NOT_REQUIRED" ? null : previousOpenBreach?.ownerUserId ?? null;
    const dueDate = actionStatus === "NOT_REQUIRED" ? null : addDays(periodEnd, dueDays);
    const alertMessage = buildAlertMessage(
      supplier.name,
      evaluation.status,
      evaluation.severity,
      evaluation.issues,
    );

    const created = await prisma.supplierSlaBreach.create({
      data: {
        supplierSlaPolicyId: policy.id,
        supplierId: policy.supplierId,
        periodStart,
        periodEnd,
        trackedPoCount: evaluation.trackedPoCount,
        completedPoCount: evaluation.completedPoCount,
        openLatePoCount: evaluation.openLatePoCount,
        breachCount: evaluation.breachCount,
        status: evaluation.status,
        severity: evaluation.severity,
        observedLeadTimeDays:
          evaluation.observedLeadTimeDays === null
            ? null
            : new Prisma.Decimal(evaluation.observedLeadTimeDays),
        onTimeRatePercent:
          evaluation.onTimeRatePercent === null
            ? null
            : new Prisma.Decimal(evaluation.onTimeRatePercent),
        fillRatePercent:
          evaluation.fillRatePercent === null
            ? null
            : new Prisma.Decimal(evaluation.fillRatePercent),
        actionStatus,
        ownerUserId,
        dueDate,
        alertTriggeredAt: alertMessage ? periodEnd : null,
        alertMessage,
        issues: evaluation.issues,
        evaluatedById: actorUserId,
      },
      include: supplierSlaBreachInclude,
    });

    await evaluateSupplierTerminationClause({
      tx: prisma,
      policy,
      createdBreachId: created.id,
      ownerUserId,
      actorUserId,
      access,
      request,
    });

    const createdRow = await prisma.supplierSlaBreach.findUnique({
      where: { id: created.id },
      include: supplierSlaBreachInclude,
    });
    createdRows.push(createdRow ?? created);

    await logActivity({
      action: "evaluate",
      entity: "supplier_sla_breach",
      entityId: created.id,
      access,
      userId: actorUserId,
      request,
      metadata: {
        message: `Evaluated SLA policy for supplier ${created.supplier.name} (${created.supplier.code})`,
        status: created.status,
        severity: created.severity,
        breachCount: created.breachCount,
      },
    });

    if (created.alertTriggeredAt) {
      await logActivity({
        action: "alert",
        entity: "supplier_sla_alert",
        entityId: created.id,
        access,
        userId: actorUserId,
        request,
        metadata: {
          message: created.alertMessage || "Supplier SLA alert generated.",
          status: created.status,
          severity: created.severity,
          dueDate: created.dueDate?.toISOString() ?? null,
        },
      });
    }

    const candidateInvoices = await prisma.supplierInvoice.findMany({
      where: {
        supplierId: policy.supplierId,
        status: {
          in: ["POSTED", "PARTIALLY_PAID"],
        },
      },
      select: { id: true },
    });
    for (const invoice of candidateInvoices) {
      await evaluateSupplierInvoiceApControls(prisma, invoice.id, actorUserId);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    count: createdRows.length,
    rows: createdRows,
  };
}

export function toSupplierSlaPolicyLogSnapshot(policy: SupplierSlaPolicyWithRelations) {
  return {
    id: policy.id,
    supplierId: policy.supplierId,
    supplierCode: policy.supplier.code,
    supplierName: policy.supplier.name,
    isActive: policy.isActive,
    effectiveFrom: policy.effectiveFrom.toISOString(),
    effectiveTo: policy.effectiveTo?.toISOString() ?? null,
    evaluationWindowDays: policy.evaluationWindowDays,
    minTrackedPoCount: policy.minTrackedPoCount,
    targetLeadTimeDays: policy.targetLeadTimeDays,
    minimumOnTimeRate: policy.minimumOnTimeRate.toString(),
    minimumFillRate: policy.minimumFillRate.toString(),
    maxOpenLatePoCount: policy.maxOpenLatePoCount,
    autoEvaluationEnabled: policy.autoEvaluationEnabled,
    warningActionDueDays: policy.warningActionDueDays,
    breachActionDueDays: policy.breachActionDueDays,
    terminationClauseEnabled: policy.terminationClauseEnabled,
    terminationLookbackDays: policy.terminationLookbackDays,
    terminationMinBreachCount: policy.terminationMinBreachCount,
    terminationMinCriticalCount: policy.terminationMinCriticalCount,
    terminationRecommendedAction: policy.terminationRecommendedAction,
    terminationNote: policy.terminationNote ?? null,
    financialRule: policy.financialRule
      ? {
          id: policy.financialRule.id,
          isActive: policy.financialRule.isActive,
          holdPaymentsOnThreeWayVariance: policy.financialRule.holdPaymentsOnThreeWayVariance,
          holdPaymentsOnOpenSlaAction: policy.financialRule.holdPaymentsOnOpenSlaAction,
          allowPaymentHoldOverride: policy.financialRule.allowPaymentHoldOverride,
          autoCreditRecommendationEnabled: policy.financialRule.autoCreditRecommendationEnabled,
          autoApplyRecommendedCredit: policy.financialRule.autoApplyRecommendedCredit,
          autoApplyRequireMatchedInvoice: policy.financialRule.autoApplyRequireMatchedInvoice,
          autoApplyBlockOnOpenDispute: policy.financialRule.autoApplyBlockOnOpenDispute,
          warningPenaltyRatePercent: policy.financialRule.warningPenaltyRatePercent.toString(),
          breachPenaltyRatePercent: policy.financialRule.breachPenaltyRatePercent.toString(),
          criticalPenaltyRatePercent: policy.financialRule.criticalPenaltyRatePercent.toString(),
          minBreachCountForCredit: policy.financialRule.minBreachCountForCredit,
          autoApplyMaxAmount: policy.financialRule.autoApplyMaxAmount?.toString() ?? null,
          maxCreditCapAmount: policy.financialRule.maxCreditCapAmount?.toString() ?? null,
          note: policy.financialRule.note ?? null,
        }
      : null,
    note: policy.note ?? null,
  };
}
