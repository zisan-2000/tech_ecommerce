import "server-only";

import nodemailer from "nodemailer";
import { db } from "@/lib/db";

function deliveryConfiguration() {
  const from = process.env.BUSINESS_NOTIFICATION_FROM_EMAIL?.trim() || process.env.RESEND_FROM_EMAIL?.trim() || process.env.SMTP_FROM_EMAIL?.trim() || process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim();
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (from && resendApiKey) return { kind: "resend" as const, from, apiKey: resendApiKey };
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || "587");
  if (!from || !host || !user || !pass || !Number.isInteger(port)) return null;
  return { kind: "smtp" as const, from, host, user, pass, port };
}

function baseUrl() {
  const value = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "http://localhost:3000";
  try { return new URL(value).origin; } catch { return "http://localhost:3000"; }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

async function sendEmail(input: { to: string; title: string; body: string; actionUrl: string | null }) {
  const configuration = deliveryConfiguration();
  if (!configuration) throw new Error("NOTIFICATION_EMAIL_NOT_CONFIGURED");
  const url = input.actionUrl ? `${baseUrl()}${input.actionUrl}` : `${baseUrl()}/business/notifications`;
  const text = `${input.body}\n\nOpen Business Portal: ${url}`;
  const html = `<p>${escapeHtml(input.body)}</p><p><a href="${escapeHtml(url)}">Open Business Portal</a></p>`;
  if (configuration.kind === "resend") {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${configuration.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: configuration.from, to: [input.to], subject: input.title, text, html }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error("NOTIFICATION_PROVIDER_REJECTED");
    return;
  }
  const transporter = nodemailer.createTransport({
    host: configuration.host,
    port: configuration.port,
    secure: configuration.port === 465,
    auth: { user: configuration.user, pass: configuration.pass },
  });
  await transporter.sendMail({ from: configuration.from, to: input.to, subject: input.title, text, html });
}

function maxAttempts() {
  const configured = Number(process.env.BUSINESS_NOTIFICATION_MAX_ATTEMPTS || "5");
  return Number.isInteger(configured) ? Math.min(5, Math.max(1, configured)) : 5;
}

export async function processBusinessNotificationOutbox(input: { limit?: number } = {}) {
  const limit = Math.min(100, Math.max(1, input.limit ?? 25));
  const attemptsLimit = maxAttempts();
  const rows = await db.businessNotificationDelivery.findMany({
    where: {
      status: { in: ["QUEUED", "FAILED"] },
      attempts: { lt: attemptsLimit },
      nextAttemptAt: { lte: new Date() },
    },
    take: limit,
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    include: { notification: { select: { title: true, body: true, actionUrl: true } } },
  });
  let delivered = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of rows) {
    const claimed = await db.businessNotificationDelivery.updateMany({
      where: { id: row.id, status: row.status, attempts: row.attempts },
      data: { status: "PROCESSING", attempts: { increment: 1 }, lastErrorCode: null },
    });
    if (claimed.count !== 1) { skipped += 1; continue; }
    try {
      await sendEmail({ to: row.recipientAddress, title: row.notification.title, body: row.notification.body, actionUrl: row.notification.actionUrl });
      await db.businessNotificationDelivery.update({ where: { id: row.id }, data: { status: "DELIVERED", deliveredAt: new Date(), lastErrorCode: null } });
      delivered += 1;
    } catch (error) {
      const code = error instanceof Error && /^[A-Z0-9_]{3,80}$/.test(error.message) ? error.message : "NOTIFICATION_DELIVERY_FAILED";
      const attempts = row.attempts + 1;
      await db.businessNotificationDelivery.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          lastErrorCode: code,
          nextAttemptAt: new Date(Date.now() + Math.min(24 * 60, 2 ** attempts * 5) * 60 * 1000),
        },
      });
      failed += 1;
    }
  }
  return { claimed: rows.length, delivered, failed, skipped };
}

