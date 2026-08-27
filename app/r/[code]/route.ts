import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createPartnerAttributionCookie, partnerAttributionCookieOptions, PARTNER_ATTRIBUTION_COOKIE } from "@/lib/business-network/partner-attribution-cookie";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { capturePartnerAttribution } from "@/lib/business-network/partner-referral";
import { capturePartnerAttributionSchema } from "@/lib/business-network/partner-referral-schemas";
import { rateLimitRequest } from "@/lib/request-security";

const PARTNER_VISITOR_COOKIE = "partner_visitor";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  try {
    const rateLimit = await rateLimitRequest(request, { scope: "partner-referral-redirect", limit: 30, windowMs: 10 * 60_000 });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many referral requests. Please try again later.", code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter), "Cache-Control": "no-store" } },
      );
    }
    const existingVisitor = request.cookies.get(PARTNER_VISITOR_COOKIE)?.value;
    const visitorId = existingVisitor && UUID_PATTERN.test(existingVisitor) ? existingVisitor : randomUUID();
    const data = capturePartnerAttributionSchema.parse({
      code: (await params).code,
      visitorId,
      sessionId: randomUUID(),
      landingPath: request.nextUrl.pathname,
    });
    const capture = await capturePartnerAttribution({ data, request });
    const response = NextResponse.redirect(new URL(capture.destinationPath, request.nextUrl.origin), 307);
    response.headers.set("Cache-Control", "private, no-store");
    response.cookies.set(PARTNER_VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
    });
    response.cookies.set(
      PARTNER_ATTRIBUTION_COOKIE,
      createPartnerAttributionCookie(capture.attributionId, capture.capturedAt, capture.expiresAt),
      partnerAttributionCookieOptions(capture.expiresAt),
    );
    return response;
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

