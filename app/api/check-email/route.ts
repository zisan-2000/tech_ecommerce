import { NextResponse } from "next/server";
import { rateLimitRequest } from "@/lib/request-security";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const rateLimit = rateLimitRequest(req, {
      scope: "email-check",
      limit: 10,
      windowMs: 10 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { valid: false, error: "Too many validation requests" },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } },
      );
    }

    const body = await req.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
      return NextResponse.json(
        { valid: false, error: "A valid email is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.MAILBOX_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({
        valid: true,
        reason: { formatValid: true, providerCheck: "not_configured" },
      });
    }

    const url = new URL("https://apilayer.net/api/check");
    url.searchParams.set("access_key", apiKey);
    url.searchParams.set("email", email);
    url.searchParams.set("smtp", "1");
    url.searchParams.set("format", "1");

    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.success === false) {
      return NextResponse.json(
        { valid: false, error: "Email validation service is unavailable" },
        { status: 502 },
      );
    }

    /*
      Important fields:
      data.format_valid → format OK
      data.mx_found → mail server found
      data.smtp_check → email exists (most important)
      data.disposable → temporary email?
    */

    const isValid =
      data.format_valid &&
      data.mx_found &&
      data.smtp_check &&
      !data.disposable;

    return NextResponse.json({
      valid: Boolean(isValid),
      reason: {
        formatValid: Boolean(data.format_valid),
        mxFound: Boolean(data.mx_found),
        smtpCheck: Boolean(data.smtp_check),
        disposable: Boolean(data.disposable),
      },
    });
  } catch (error) {
    console.error("Email check error:", error);
    return NextResponse.json(
      { valid: false, error: "Failed to validate" },
      { status: 500 }
    );
  }
}
