import "server-only";

import nodemailer from "nodemailer";
import { BusinessNetworkError } from "./errors";

type InvitationDeliveryInput = {
  email: string;
  organizationName: string;
  role: string;
  token: string;
};

export type InvitationDeliveryResult = {
  delivered: boolean;
  debugInviteUrl?: string;
};

function getBaseUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_URL;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new BusinessNetworkError(
      503,
      "INVITATION_DELIVERY_NOT_CONFIGURED",
      "Business invitation delivery is not configured.",
    );
  }
  try {
    const url = new URL(configured || "http://localhost:3000");
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return url.origin;
  } catch {
    throw new BusinessNetworkError(
      503,
      "INVITATION_DELIVERY_NOT_CONFIGURED",
      "Business invitation delivery is not configured.",
    );
  }
}

function getDeliveryConfiguration() {
  const businessFrom = process.env.BUSINESS_INVITATION_FROM_EMAIL?.trim();
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const resendFrom = businessFrom || process.env.RESEND_FROM_EMAIL?.trim();
  if (resendApiKey && resendFrom) {
    return { kind: "resend" as const, apiKey: resendApiKey, from: resendFrom };
  }
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const from =
    businessFrom ||
    process.env.SMTP_FROM_EMAIL?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    user;
  const port = Number(process.env.SMTP_PORT || "587");
  if (!host || !user || !pass || !from || !Number.isInteger(port)) return null;
  return { kind: "smtp" as const, host, user, pass, from, port };
}

export function assertInvitationDeliveryReady(): void {
  if (process.env.NODE_ENV !== "production") return;
  getBaseUrl();
  if (!getDeliveryConfiguration()) {
    throw new BusinessNetworkError(
      503,
      "INVITATION_DELIVERY_NOT_CONFIGURED",
      "Business invitation delivery is temporarily unavailable.",
    );
  }
}

export async function deliverOrganizationInvitation(
  input: InvitationDeliveryInput,
): Promise<InvitationDeliveryResult> {
  const inviteUrl = `${getBaseUrl()}/api/business/invitations/${encodeURIComponent(input.token)}`;
  const configuration = getDeliveryConfiguration();
  if (!configuration) {
    if (process.env.NODE_ENV === "production") {
      throw new BusinessNetworkError(
        503,
        "INVITATION_DELIVERY_NOT_CONFIGURED",
        "Business invitation delivery is temporarily unavailable.",
      );
    }
    return { delivered: false, debugInviteUrl: inviteUrl };
  }

  const subject = `Invitation to join ${input.organizationName}`;
  const text =
    `You were invited to join ${input.organizationName} as ${input.role}.\n\n` +
    `Review the invitation: ${inviteUrl}\n\n` +
    "If you did not expect this invitation, you can ignore this email.";
  const html =
    `<p>You were invited to join <strong>${escapeHtml(input.organizationName)}</strong> ` +
    `as <strong>${escapeHtml(input.role)}</strong>.</p>` +
    `<p><a href="${escapeHtml(inviteUrl)}">Review invitation</a></p>` +
    "<p>If you did not expect this invitation, you can ignore this email.</p>";
  try {
    if (configuration.kind === "resend") {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${configuration.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: configuration.from,
          to: [input.email],
          subject,
          text,
          html,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error("Invitation email provider rejected request.");
    } else {
      const transporter = nodemailer.createTransport({
        host: configuration.host,
        port: configuration.port,
        secure: configuration.port === 465,
        auth: { user: configuration.user, pass: configuration.pass },
      });
      await transporter.sendMail({
        from: configuration.from,
        to: input.email,
        subject,
        text,
        html,
      });
    }
    return { delivered: true };
  } catch {
    throw new BusinessNetworkError(
      502,
      "INVITATION_DELIVERY_FAILED",
      "The invitation could not be delivered. Please try again later.",
    );
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}
