import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/lib/rbac";
import type { PermissionKey } from "@/lib/rbac-config";

type InvestorWorkspaceTone = "default" | "warning" | "critical";

export type InvestorWorkspaceCard = {
  id: string;
  label: string;
  value: string;
  hint: string;
  href: string;
};

export type InvestorWorkspaceLink = {
  id: string;
  label: string;
  description: string;
  href: string;
};

export type InvestorWorkspaceItem = {
  id: string;
  title: string;
  description: string;
  count: number;
  href: string;
  tone: InvestorWorkspaceTone;
};

export type InvestorWorkspaceActivity = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  message: string;
  createdAt: string;
  userName: string | null;
};

export type InvestorWorkspacePayload = {
  summary: InvestorWorkspaceCard[];
  tasks: InvestorWorkspaceItem[];
  exceptions: InvestorWorkspaceItem[];
  quickLinks: InvestorWorkspaceLink[];
  recentActivity: InvestorWorkspaceActivity[];
};

export function canAccessInvestorWorkspace(access: AccessContext) {
  return (
    access.hasGlobal("investors.read") ||
    access.hasGlobal("investors.manage") ||
    access.hasGlobal("investor_ledger.read") ||
    access.hasGlobal("investor_ledger.manage") ||
    access.hasGlobal("investor_allocations.read") ||
    access.hasGlobal("investor_allocations.manage") ||
    access.hasGlobal("investor_profit.read") ||
    access.hasGlobal("investor_profit.manage") ||
    access.hasGlobal("investor_profit.approve") ||
    access.hasGlobal("investor_profit.post") ||
    access.hasGlobal("investor_payout.read") ||
    access.hasGlobal("investor_payout.manage") ||
    access.hasGlobal("investor_payout.approve") ||
    access.hasGlobal("investor_payout.pay") ||
    access.hasGlobal("investor_payout.void") ||
    access.hasGlobal("investor_statement.read")
  );
}

function hasAnyPermission(access: AccessContext, permissions: readonly PermissionKey[]) {
  return permissions.some((permission) => access.hasGlobal(permission));
}

export async function getInvestorWorkspacePayload(
  access: AccessContext,
): Promise<InvestorWorkspacePayload> {
  const [
    activeInvestorCount,
    pendingKycCount,
    pendingKycAgingCount,
    missingPortalCount,
    pendingProfitApprovalCount,
    approvedProfitPendingPostCount,
    pendingPayoutApprovalCount,
    approvedPayoutPendingPayCount,
    agedApprovedPayoutCount,
    pendingProfileRequestCount,
    dueStatementScheduleCount,
    overdueStatementScheduleCount,
    postedRunWithoutPayoutCount,
    allocationGovernanceGapCount,
    recentActivity,
  ] = await Promise.all([
    prisma.investor.count({
      where: { status: "ACTIVE" },
    }),
    prisma.investor.count({
      where: {
        status: "ACTIVE",
        kycStatus: { in: ["PENDING", "UNDER_REVIEW"] },
      },
    }),
    prisma.investor.count({
      where: {
        status: "ACTIVE",
        kycStatus: { in: ["PENDING", "UNDER_REVIEW"] },
        createdAt: {
          lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.investor.count({
      where: {
        status: "ACTIVE",
        portalAccesses: {
          none: {
            status: "ACTIVE",
          },
        },
      },
    }),
    prisma.investorProfitRun.count({
      where: { status: "PENDING_APPROVAL" },
    }),
    prisma.investorProfitRun.count({
      where: { status: "APPROVED" },
    }),
    prisma.investorProfitPayout.count({
      where: { status: "PENDING_APPROVAL" },
    }),
    prisma.investorProfitPayout.count({
      where: { status: "APPROVED" },
    }),
    prisma.investorProfitPayout.count({
      where: {
        status: "APPROVED",
        approvedAt: {
          lt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.investorProfileUpdateRequest.count({
      where: { status: "PENDING" },
    }),
    prisma.investorStatementSchedule.count({
      where: {
        status: "ACTIVE",
        nextRunAt: { lte: new Date() },
      },
    }),
    prisma.investorStatementSchedule.count({
      where: {
        status: "ACTIVE",
        nextRunAt: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.investorProfitRun.count({
      where: {
        status: "POSTED",
        payouts: {
          none: {},
        },
      },
    }),
    prisma.investorProductAllocation.count({
      where: {
        status: "ACTIVE",
        investor: {
          status: { not: "ACTIVE" },
        },
      },
    }),
    prisma.activityLog.findMany({
      where: {
        entity: {
          in: [
            "investor",
            "investor_capital_transaction",
            "investor_product_allocation",
            "investor_profit_run",
            "investor_profit_payout",
            "investor_portal_access",
          ],
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 8,
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    }),
  ]);

  const tasks: InvestorWorkspaceItem[] = [];
  const exceptions: InvestorWorkspaceItem[] = [];

  if (hasAnyPermission(access, ["investors.manage"]) && pendingKycCount > 0) {
    tasks.push({
      id: "investor-kyc-review",
      title: "KYC review queue",
      description: "Active investors still waiting on KYC review or verification.",
      count: pendingKycCount,
      href: "/admin/investors/registry",
      tone: "warning",
    });
  }

  if (hasAnyPermission(access, ["investor_profit.approve"]) && pendingProfitApprovalCount > 0) {
    tasks.push({
      id: "profit-run-approval",
      title: "Profit runs awaiting approval",
      description: "Review and approve pending investor profitability runs.",
      count: pendingProfitApprovalCount,
      href: "/admin/investors/profit-runs?status=PENDING_APPROVAL",
      tone: "default",
    });
  }

  if (hasAnyPermission(access, ["investor_profit.post"]) && approvedProfitPendingPostCount > 0) {
    tasks.push({
      id: "profit-run-post",
      title: "Approved runs awaiting posting",
      description: "Approved investor profit runs still need ledger posting.",
      count: approvedProfitPendingPostCount,
      href: "/admin/investors/profit-runs?status=APPROVED",
      tone: "warning",
    });
  }

  if (hasAnyPermission(access, ["investor_payout.approve"]) && pendingPayoutApprovalCount > 0) {
    tasks.push({
      id: "payout-approval",
      title: "Payouts awaiting approval",
      description: "Investor payout drafts are waiting for approval decision.",
      count: pendingPayoutApprovalCount,
      href: "/admin/investors/payouts?status=PENDING_APPROVAL",
      tone: "default",
    });
  }

  if (hasAnyPermission(access, ["investor_payout.pay"]) && approvedPayoutPendingPayCount > 0) {
    tasks.push({
      id: "payout-pay",
      title: "Approved payouts awaiting payment",
      description: "Approved investor payouts are ready for payment execution.",
      count: approvedPayoutPendingPayCount,
      href: "/admin/investors/payouts?status=APPROVED",
      tone: "warning",
    });
  }

  if (hasAnyPermission(access, ["investors.manage"]) && pendingProfileRequestCount > 0) {
    tasks.push({
      id: "profile-request-review",
      title: "Profile requests awaiting review",
      description: "Investor-submitted profile and bank updates are waiting for review.",
      count: pendingProfileRequestCount,
      href: "/admin/investors/profile-requests",
      tone: "default",
    });
  }

  if (hasAnyPermission(access, ["investor_statement.read", "investors.manage"]) && dueStatementScheduleCount > 0) {
    tasks.push({
      id: "statement-schedule-due",
      title: "Scheduled statements due",
      description: "Recurring investor statements are due for dispatch.",
      count: dueStatementScheduleCount,
      href: "/admin/investors/statement-schedules?dueOnly=true",
      tone: "warning",
    });
  }

  if (
    hasAnyPermission(access, ["investors.manage", "users.manage"]) &&
    missingPortalCount > 0
  ) {
    tasks.push({
      id: "portal-access-provisioning",
      title: "Portal access provisioning",
      description: "Active investors do not yet have active portal access.",
      count: missingPortalCount,
      href: "/admin/investors/portal-access",
      tone: "warning",
    });
  }

  if (pendingKycAgingCount > 0) {
    exceptions.push({
      id: "aged-kyc-review",
      title: "Aged KYC backlog",
      description: "KYC review has been open for more than seven days.",
      count: pendingKycAgingCount,
      href: "/admin/investors/registry",
      tone: "critical",
    });
  }

  if (agedApprovedPayoutCount > 0) {
    exceptions.push({
      id: "aged-approved-payouts",
      title: "Approved payouts aging",
      description: "Approved payouts have not been paid for more than three days.",
      count: agedApprovedPayoutCount,
      href: "/admin/investors/payouts?status=APPROVED",
      tone: "critical",
    });
  }

  if (postedRunWithoutPayoutCount > 0) {
    exceptions.push({
      id: "posted-without-payout",
      title: "Posted runs without payout draft",
      description: "Posted profit runs still have no payout draft created.",
      count: postedRunWithoutPayoutCount,
      href: "/admin/investors/profit-runs?status=POSTED",
      tone: "warning",
    });
  }

  if (allocationGovernanceGapCount > 0) {
    exceptions.push({
      id: "allocation-governance-gap",
      title: "Allocations tied to inactive investors",
      description: "Active allocations still point to suspended or inactive investors.",
      count: allocationGovernanceGapCount,
      href: "/admin/investors/allocations",
      tone: "critical",
    });
  }

  if (missingPortalCount > 0) {
    exceptions.push({
      id: "missing-investor-portal",
      title: "Portal access gap",
      description: "Active investors cannot use the investor portal yet.",
      count: missingPortalCount,
      href: "/admin/investors/portal-access",
      tone: "warning",
    });
  }

  if (overdueStatementScheduleCount > 0) {
    exceptions.push({
      id: "overdue-statement-schedules",
      title: "Overdue statement dispatches",
      description: "Scheduled investor statements were not dispatched within one day of due time.",
      count: overdueStatementScheduleCount,
      href: "/admin/investors/statement-schedules?dueOnly=true",
      tone: "critical",
    });
  }

  const quickLinks: InvestorWorkspaceLink[] = [
    {
      id: "new-investor",
      label: "Investor Registry",
      description: "Create or update investor master records and KYC status.",
      href: "/admin/investors/registry",
    },
    {
      id: "ledger",
      label: "Capital Ledger",
      description: "Post capital contributions, distributions, and adjustments.",
      href: "/admin/investors/ledger",
    },
    {
      id: "allocations",
      label: "Allocations",
      description: "Manage investor participation across product variants.",
      href: "/admin/investors/allocations",
    },
    {
      id: "profit-runs",
      label: "Profit Runs",
      description: "Generate, approve, and post investor profitability runs.",
      href: "/admin/investors/profit-runs",
    },
    {
      id: "payouts",
      label: "Payouts",
      description: "Approve, pay, or void investor payout batches.",
      href: "/admin/investors/payouts",
    },
    {
      id: "portal-access",
      label: "Portal Access",
      description: "Provision investor self-service access and monitor status.",
      href: "/admin/investors/portal-access",
    },
    {
      id: "statement-schedules",
      label: "Statement Schedules",
      description: "Manage recurring investor statement dispatch cadence and due queue.",
      href: "/admin/investors/statement-schedules",
    },
  ].filter((item) => {
    if (item.id === "portal-access") {
      return hasAnyPermission(access, ["investors.manage", "users.manage"]);
    }
    if (item.id === "statement-schedules") {
      return hasAnyPermission(access, ["investor_statement.read", "investors.manage"]);
    }
    return true;
  });

  const summary: InvestorWorkspaceCard[] = [
    {
      id: "active-investors",
      label: "Active Investors",
      value: String(activeInvestorCount),
      hint: "Currently active investor profiles.",
      href: "/admin/investors/registry",
    },
    {
      id: "pending-kyc",
      label: "Pending KYC",
      value: String(pendingKycCount),
      hint: "Profiles still under onboarding review.",
      href: "/admin/investors/registry",
    },
    {
      id: "open-tasks",
      label: "Open Tasks",
      value: String(tasks.reduce((sum, item) => sum + item.count, 0)),
      hint: "Actionable investor operations assigned to this workspace.",
      href: "/admin/investors/my-tasks",
    },
    {
      id: "exceptions",
      label: "Exceptions",
      value: String(exceptions.reduce((sum, item) => sum + item.count, 0)),
      hint: "Risk items needing follow-up or governance review.",
      href: "/admin/investors/exceptions",
    },
  ];

  return {
    summary,
    tasks,
    exceptions,
    quickLinks,
    recentActivity: recentActivity.map((item) => {
      const metadata =
        item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
          ? (item.metadata as Record<string, unknown>)
          : null;
      return {
        id: item.id.toString(),
        action: item.action,
        entity: item.entity,
        entityId: item.entityId,
        message:
          typeof metadata?.message === "string"
            ? metadata.message
            : `${item.action} ${item.entity.replace(/_/g, " ")}`,
        createdAt: item.createdAt.toISOString(),
        userName: item.user?.name || item.user?.email || null,
      };
    }),
  };
}
