import { NextResponse } from "next/server";
import { rateLimitRequest } from "@/lib/request-security";
import { getSiteSettingsForSeo } from "@/lib/seo";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\0/g, "").trim().slice(0, maxLength);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function configuredRecipients(fallbackEmail: string | null) {
  const configured = (process.env.CONTACT_RECIPIENT_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => EMAIL_PATTERN.test(email));

  if (configured.length > 0) return Array.from(new Set(configured));
  if (fallbackEmail && EMAIL_PATTERN.test(fallbackEmail)) return [fallbackEmail];
  return [];
}

export async function POST(request: Request) {
  try {
    const rateLimit = await rateLimitRequest(request, {
      scope: "contact-form",
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many messages. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        },
      );
    }

    const body = await request.json().catch(() => null);
    const name = cleanText(body?.name, 100);
    const email = cleanText(body?.email, 254).toLowerCase();
    const subject = cleanText(body?.subject, 120).replace(/[\r\n]+/g, " ");
    const message = cleanText(body?.message, 3000);

    if (name.length < 2 || subject.length < 3 || message.length < 10) {
      return NextResponse.json(
        { error: "Please complete every field with enough detail." },
        { status: 400 },
      );
    }
    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 },
      );
    }

    const [settings, apiKey, fromEmail] = await Promise.all([
      getSiteSettingsForSeo(),
      Promise.resolve(process.env.RESEND_API_KEY?.trim()),
      Promise.resolve(process.env.RESEND_FROM_EMAIL?.trim()),
    ]);
    const recipients = configuredRecipients(settings.contactEmail);

    if (!apiKey || !fromEmail || recipients.length === 0) {
      console.error("Contact email is not configured", {
        hasApiKey: Boolean(apiKey),
        hasFromEmail: Boolean(fromEmail),
        hasRecipient: recipients.length > 0,
      });
      return NextResponse.json(
        { error: "Contact service is temporarily unavailable. Please use phone or email support." },
        { status: 503 },
      );
    }

    const safeSiteTitle = escapeHtml(settings.siteTitle);
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message).replace(/\n/g, "<br />");
    const submittedAt = new Date().toLocaleString("en-BD", {
      timeZone: "Asia/Dhaka",
      dateStyle: "medium",
      timeStyle: "short",
    });

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: recipients,
        reply_to: email,
        subject: `[${settings.siteTitle}] ${subject}`,
        html: `
          <main style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#172033">
            <header style="background:#142033;color:#fff;padding:24px;border-radius:12px 12px 0 0">
              <h1 style="font-size:20px;margin:0">${safeSiteTitle}</h1>
              <p style="margin:8px 0 0;color:#dbe4f0">New customer enquiry</p>
            </header>
            <section style="border:1px solid #d9e0e8;border-top:0;padding:24px;border-radius:0 0 12px 12px">
              <p><strong>Name:</strong> ${safeName}</p>
              <p><strong>Email:</strong> ${safeEmail}</p>
              <p><strong>Subject:</strong> ${safeSubject}</p>
              <p><strong>Submitted:</strong> ${escapeHtml(submittedAt)}</p>
              <hr style="border:0;border-top:1px solid #d9e0e8;margin:20px 0" />
              <p style="line-height:1.65">${safeMessage}</p>
            </section>
          </main>
        `,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      const providerError = await response.text().catch(() => "");
      console.error("Contact email provider rejected the request", {
        status: response.status,
        providerError: providerError.slice(0, 500),
      });
      return NextResponse.json(
        { error: "We could not send your message. Please try again later." },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Contact form submission failed", error);
    return NextResponse.json(
      { error: "We could not send your message. Please try again later." },
      { status: 500 },
    );
  }
}
