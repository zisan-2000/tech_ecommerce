import nodemailer from "nodemailer";
import { Prisma, type PaymentRequestApprovalStage } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

type TransactionClient = Prisma.TransactionClient;

type PaymentRequestNotificationRecipient = {
  userId?: string | null;
  recipientEmail?: string | null;
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

export async function createPaymentRequestWorkflowNotifications(params: {
  tx: TransactionClient;
  paymentRequestId: number;
  stage: PaymentRequestApprovalStage;
  recipients: PaymentRequestNotificationRecipient[];
  message: string;
  metadata?: Prisma.InputJsonValue;
  createdById?: string | null;
}): Promise<number[]> {
  const emailNotificationIds: number[] = [];
  const deduped = new Map<string, PaymentRequestNotificationRecipient>();

  for (const recipient of params.recipients) {
    const key = `${recipient.userId ?? ""}|${recipient.recipientEmail ?? ""}`;
    if (!key.trim()) continue;
    if (!deduped.has(key)) deduped.set(key, recipient);
  }

  for (const recipient of deduped.values()) {
    await params.tx.paymentRequestNotification.create({
      data: {
        paymentRequestId: params.paymentRequestId,
        stage: params.stage,
        channel: "SYSTEM",
        status: "SENT",
        recipientUserId: recipient.userId ?? null,
        recipientEmail: recipient.recipientEmail ?? null,
        message: params.message,
        metadata: params.metadata ?? undefined,
        sentAt: new Date(),
        createdById: params.createdById ?? null,
      },
      select: { id: true },
    });

    if (!recipient.recipientEmail) continue;

    const emailNotification = await params.tx.paymentRequestNotification.create({
      data: {
        paymentRequestId: params.paymentRequestId,
        stage: params.stage,
        channel: "EMAIL",
        status: "PENDING",
        recipientUserId: recipient.userId ?? null,
        recipientEmail: recipient.recipientEmail,
        message: params.message,
        metadata: params.metadata ?? undefined,
        createdById: params.createdById ?? null,
      },
      select: { id: true },
    });
    emailNotificationIds.push(emailNotification.id);
  }

  return emailNotificationIds;
}

export async function dispatchPaymentRequestEmailNotifications(
  notificationIds: number[],
): Promise<{ sent: number; failed: number; skipped: number }> {
  if (notificationIds.length === 0) {
    return { sent: 0, failed: 0, skipped: 0 };
  }

  const transporter = createSmtpTransporter();
  const smtpFrom =
    process.env.PRF_WORKFLOW_ALERT_FROM || process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!transporter || !smtpFrom) {
    return { sent: 0, failed: 0, skipped: notificationIds.length };
  }

  const rows = await prisma.paymentRequestNotification.findMany({
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
      paymentRequest: {
        select: {
          prfNumber: true,
          amount: true,
          currency: true,
          supplier: {
            select: { name: true, code: true },
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
        subject: `PRF Workflow: ${row.paymentRequest.prfNumber}`,
        text:
          `${row.message}\n\n` +
          `PRF: ${row.paymentRequest.prfNumber}\n` +
          `Supplier: ${row.paymentRequest.supplier.name} (${row.paymentRequest.supplier.code})\n` +
          `Amount: ${row.paymentRequest.amount.toString()} ${row.paymentRequest.currency}\n`,
      });

      await prisma.paymentRequestNotification.update({
        where: { id: row.id },
        data: { status: "SENT", sentAt: new Date() },
      });
      sent += 1;
    } catch (error: any) {
      failed += 1;
      await prisma.paymentRequestNotification.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          metadata: { error: String(error?.message || "Email dispatch failed") },
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
