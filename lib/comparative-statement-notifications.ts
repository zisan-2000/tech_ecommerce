import nodemailer from "nodemailer";
import { Prisma, type ComparativeStatementApprovalStage } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

type TransactionClient = Prisma.TransactionClient;

type ComparativeNotificationRecipient = {
  userId?: string | null;
  recipientEmail?: string | null;
};

type CreateComparativeNotificationsInput = {
  tx: TransactionClient;
  comparativeStatementId: number;
  stage: ComparativeStatementApprovalStage;
  recipients: ComparativeNotificationRecipient[];
  message: string;
  metadata?: Prisma.InputJsonValue;
};

function createSmtpTransporter() {
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
    auth: { user, pass },
  });
}

export async function createComparativeStatementNotifications({
  tx,
  comparativeStatementId,
  stage,
  recipients,
  message,
  metadata,
}: CreateComparativeNotificationsInput): Promise<number[]> {
  const emailNotificationIds: number[] = [];
  const deduped = new Map<string, ComparativeNotificationRecipient>();
  for (const recipient of recipients) {
    const key = `${recipient.userId ?? ""}|${recipient.recipientEmail ?? ""}`;
    if (!key.trim()) continue;
    if (!deduped.has(key)) {
      deduped.set(key, recipient);
    }
  }

  for (const recipient of deduped.values()) {
    await tx.comparativeStatementNotification.create({
      data: {
        comparativeStatementId,
        stage,
        channel: "SYSTEM",
        status: "SENT",
        recipientUserId: recipient.userId ?? null,
        recipientEmail: recipient.recipientEmail ?? null,
        message,
        metadata: metadata ?? undefined,
        sentAt: new Date(),
      },
      select: { id: true },
    });

    if (!recipient.recipientEmail) {
      continue;
    }

    const emailRow = await tx.comparativeStatementNotification.create({
      data: {
        comparativeStatementId,
        stage,
        channel: "EMAIL",
        status: "PENDING",
        recipientUserId: recipient.userId ?? null,
        recipientEmail: recipient.recipientEmail,
        message,
        metadata: metadata ?? undefined,
      },
      select: { id: true },
    });
    emailNotificationIds.push(emailRow.id);
  }

  return emailNotificationIds;
}

export async function dispatchComparativeStatementEmailNotifications(
  notificationIds: number[],
): Promise<{ sent: number; failed: number; skipped: number }> {
  if (notificationIds.length === 0) {
    return { sent: 0, failed: 0, skipped: 0 };
  }

  const transporter = createSmtpTransporter();
  const smtpFrom =
    process.env.CS_ALERT_FROM || process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!transporter || !smtpFrom) {
    return { sent: 0, failed: 0, skipped: notificationIds.length };
  }

  const rows = await prisma.comparativeStatementNotification.findMany({
    where: {
      id: { in: notificationIds },
      channel: "EMAIL",
      status: "PENDING",
      recipientEmail: { not: null },
    },
    select: {
      id: true,
      recipientEmail: true,
      message: true,
      comparativeStatement: {
        select: {
          csNumber: true,
          rfq: {
            select: {
              rfqNumber: true,
            },
          },
        },
      },
    },
  });

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await transporter.sendMail({
        from: smtpFrom,
        to: row.recipientEmail!,
        subject: `CS Workflow: ${row.comparativeStatement.csNumber}`,
        text:
          `${row.message}\n\n` +
          `Comparative Statement: ${row.comparativeStatement.csNumber}\n` +
          `RFQ: ${row.comparativeStatement.rfq.rfqNumber}\n`,
      });

      await prisma.comparativeStatementNotification.update({
        where: { id: row.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
        },
      });
      sent += 1;
    } catch (error: any) {
      failed += 1;
      await prisma.comparativeStatementNotification.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          metadata: {
            error: String(error?.message || "Email dispatch failed"),
          },
        },
      });
    }
  }

  return {
    sent,
    failed,
    skipped: notificationIds.length - rows.length,
  };
}
