import nodemailer from "nodemailer";
import {
  Prisma,
  type SupplierSlaActionStatus,
  type SupplierSlaEvaluationStatus,
  type SupplierSlaTerminationCaseStatus,
} from "@/generated/prisma";
import { logActivity } from "@/lib/activity-log";
import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/lib/rbac";

const ACTIVE_ACTION_STATUSES: SupplierSlaActionStatus[] = ["OPEN", "IN_PROGRESS"];
const ACTIVE_BREACH_STATUSES: SupplierSlaEvaluationStatus[] = ["WARNING", "BREACH"];
const ACTIVE_TERMINATION_CASE_STATUSES: SupplierSlaTerminationCaseStatus[] = [
  "OPEN",
  "IN_REVIEW",
  "APPROVED",
];

type RunSupplierSlaNotificationsInput = {
  actorUserId?: string | null;
  access?: AccessContext | null;
  request?: Request | null;
  dryRun?: boolean;
  supplierId?: number | null;
  dueInHours?: number;
  includeTermination?: boolean;
  maxItems?: number;
};

type NotificationResultRow = {
  kind: "BREACH" | "TERMINATION";
  id: number;
  supplierId: number;
  supplierName: string;
  supplierCode: string;
  ownerEmail: string | null;
  sentEmail: boolean;
  sentWebhook: boolean;
  message: string;
};

export type RunSupplierSlaNotificationsResult = {
  triggeredAt: string;
  dryRun: boolean;
  smtpEnabled: boolean;
  webhookEnabled: boolean;
  dueInHours: number;
  candidateCount: number;
  processedCount: number;
  emailedCount: number;
  webhookCount: number;
  rows: NotificationResultRow[];
  errors: string[];
};

function clampInt(value: number, min: number, max: number, fallback: number) {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function buildSmtpTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    return null;
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });
}

async function sendWebhook(payload: Record<string, unknown>) {
  const webhookUrl = process.env.SCM_SLA_ALERT_WEBHOOK_URL;
  if (!webhookUrl) return false;
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
  }
  return true;
}

export async function runSupplierSlaNotifications({
  actorUserId = null,
  access = null,
  request = null,
  dryRun = false,
  supplierId = null,
  dueInHours = 24,
  includeTermination = true,
  maxItems = 100,
}: RunSupplierSlaNotificationsInput): Promise<RunSupplierSlaNotificationsResult> {
  const dueHours = clampInt(dueInHours, 1, 168, 24);
  const take = clampInt(maxItems, 1, 300, 100);
  const now = new Date();
  const dueBy = new Date(now.getTime() + dueHours * 60 * 60 * 1000);
  const staleAlertBefore = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  const transporter = buildSmtpTransporter();
  const smtpFrom = process.env.SLA_ALERT_FROM || process.env.SMTP_FROM || process.env.SMTP_USER;
  const smtpEnabled = Boolean(transporter && smtpFrom);
  const webhookEnabled = Boolean(process.env.SCM_SLA_ALERT_WEBHOOK_URL);
  const fallbackEmail = process.env.SLA_ALERT_FALLBACK_EMAIL?.trim() || null;
  const errors: string[] = [];
  const rows: NotificationResultRow[] = [];

  const breachCandidates = await prisma.supplierSlaBreach.findMany({
    where: {
      ...(Number.isInteger(supplierId) && (supplierId as number) > 0
        ? { supplierId: supplierId as number }
        : {}),
      status: { in: ACTIVE_BREACH_STATUSES },
      actionStatus: { in: ACTIVE_ACTION_STATUSES },
      dueDate: { lte: dueBy },
      OR: [{ alertTriggeredAt: null }, { alertTriggeredAt: { lt: staleAlertBefore } }],
    },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    take,
    select: {
      id: true,
      supplierId: true,
      status: true,
      severity: true,
      actionStatus: true,
      dueDate: true,
      ownerUserId: true,
      supplier: {
        select: { id: true, name: true, code: true },
      },
      owner: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  const terminationCandidates =
    includeTermination
      ? await prisma.supplierSlaTerminationCase.findMany({
          where: {
            ...(Number.isInteger(supplierId) && (supplierId as number) > 0
              ? { supplierId: supplierId as number }
              : {}),
            status: { in: ACTIVE_TERMINATION_CASE_STATUSES },
            resolvedAt: null,
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take,
          select: {
            id: true,
            supplierId: true,
            status: true,
            recommendedAction: true,
            reason: true,
            ownerUserId: true,
            supplier: {
              select: { id: true, name: true, code: true },
            },
            owner: {
              select: { id: true, name: true, email: true },
            },
          },
        })
      : [];

  for (const breach of breachCandidates) {
    const ownerEmail = breach.owner?.email || fallbackEmail;
    const subject = `[SLA ${breach.status}] Action due for ${breach.supplier.name} (${breach.supplier.code})`;
    const message =
      `Supplier SLA breach ${breach.id} is ${breach.status}/${breach.severity} ` +
      `with action status ${breach.actionStatus}. Due: ${breach.dueDate?.toISOString() ?? "N/A"}.`;

    let sentEmail = false;
    let sentWebhook = false;

    try {
      if (!dryRun && smtpEnabled && ownerEmail && transporter && smtpFrom) {
        await transporter.sendMail({
          from: smtpFrom,
          to: ownerEmail,
          subject,
          text: message,
        });
        sentEmail = true;
      }
      if (!dryRun && webhookEnabled) {
        sentWebhook = await sendWebhook({
          type: "sla_breach_escalation",
          breachId: breach.id,
          supplierId: breach.supplierId,
          supplierName: breach.supplier.name,
          supplierCode: breach.supplier.code,
          status: breach.status,
          severity: breach.severity,
          actionStatus: breach.actionStatus,
          dueDate: breach.dueDate?.toISOString() ?? null,
          ownerEmail: ownerEmail ?? null,
        });
      }

      if (!dryRun) {
        await prisma.supplierSlaBreach.update({
          where: { id: breach.id },
          data: {
            alertTriggeredAt: now,
            alertMessage: message.slice(0, 500),
          },
        });
      }

      rows.push({
        kind: "BREACH",
        id: breach.id,
        supplierId: breach.supplierId,
        supplierName: breach.supplier.name,
        supplierCode: breach.supplier.code,
        ownerEmail,
        sentEmail,
        sentWebhook,
        message,
      });

      await logActivity({
        action: "notify",
        entity: "supplier_sla_notification",
        entityId: breach.id,
        access,
        userId: actorUserId,
        request,
        metadata: {
          kind: "breach",
          dryRun,
          supplierId: breach.supplierId,
          supplierName: breach.supplier.name,
          supplierCode: breach.supplier.code,
          status: breach.status,
          severity: breach.severity,
          actionStatus: breach.actionStatus,
          dueDate: breach.dueDate?.toISOString() ?? null,
          ownerEmail: ownerEmail ?? null,
          sentEmail,
          sentWebhook,
        },
      });
    } catch (error: any) {
      errors.push(`Breach ${breach.id}: ${error?.message || "Notification failed"}`);
    }
  }

  for (const row of terminationCandidates) {
    const ownerEmail = row.owner?.email || fallbackEmail;
    const subject = `[SLA Termination] Case #${row.id} for ${row.supplier.name} (${row.supplier.code})`;
    const message =
      `Termination case ${row.id} is ${row.status} with recommended action ${row.recommendedAction}. ` +
      `Reason: ${row.reason}`;

    let sentEmail = false;
    let sentWebhook = false;

    try {
      if (!dryRun && smtpEnabled && ownerEmail && transporter && smtpFrom) {
        await transporter.sendMail({
          from: smtpFrom,
          to: ownerEmail,
          subject,
          text: message,
        });
        sentEmail = true;
      }
      if (!dryRun && webhookEnabled) {
        sentWebhook = await sendWebhook({
          type: "sla_termination_escalation",
          caseId: row.id,
          supplierId: row.supplierId,
          supplierName: row.supplier.name,
          supplierCode: row.supplier.code,
          status: row.status,
          recommendedAction: row.recommendedAction,
          reason: row.reason,
          ownerEmail: ownerEmail ?? null,
        });
      }

      rows.push({
        kind: "TERMINATION",
        id: row.id,
        supplierId: row.supplierId,
        supplierName: row.supplier.name,
        supplierCode: row.supplier.code,
        ownerEmail,
        sentEmail,
        sentWebhook,
        message,
      });

      await logActivity({
        action: "notify",
        entity: "supplier_sla_notification",
        entityId: row.id,
        access,
        userId: actorUserId,
        request,
        metadata: {
          kind: "termination_case",
          dryRun,
          supplierId: row.supplierId,
          supplierName: row.supplier.name,
          supplierCode: row.supplier.code,
          caseStatus: row.status,
          recommendedAction: row.recommendedAction,
          ownerEmail: ownerEmail ?? null,
          sentEmail,
          sentWebhook,
        },
      });
    } catch (error: any) {
      errors.push(`Termination case ${row.id}: ${error?.message || "Notification failed"}`);
    }
  }

  return {
    triggeredAt: now.toISOString(),
    dryRun,
    smtpEnabled,
    webhookEnabled,
    dueInHours: dueHours,
    candidateCount: breachCandidates.length + terminationCandidates.length,
    processedCount: rows.length,
    emailedCount: rows.filter((row) => row.sentEmail).length,
    webhookCount: rows.filter((row) => row.sentWebhook).length,
    rows,
    errors,
  };
}
