import { NextResponse } from "next/server";
import { createPartnerAttributionCookie, partnerAttributionCookieOptions, PARTNER_ATTRIBUTION_COOKIE } from "@/lib/business-network/partner-attribution-cookie";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { capturePartnerAttribution } from "@/lib/business-network/partner-referral";
import { capturePartnerAttributionSchema } from "@/lib/business-network/partner-referral-schemas";
import { BusinessNetworkError } from "@/lib/business-network/business-error";
import { assertSameOriginBusinessMutation } from "@/lib/business-network/request";
import { rateLimitRequest } from "@/lib/request-security";

const MAX_BODY_BYTES = 4 * 1_024;

async function readPublicJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new BusinessNetworkError(422, "JSON_CONTENT_TYPE_REQUIRED", "Content-Type must be application/json.");
  }
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new BusinessNetworkError(422, "REQUEST_TOO_LARGE", "Request body is too large.");
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    throw new BusinessNetworkError(422, "REQUEST_TOO_LARGE", "Request body is too large.");
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new BusinessNetworkError(422, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOriginBusinessMutation(request);
    const rateLimit = await rateLimitRequest(request, { scope: "partner-attribution-capture", limit: 30, windowMs: 10 * 60_000 });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many referral requests. Please try again later.", code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter), "Cache-Control": "no-store" } },
      );
    }
    const data = capturePartnerAttributionSchema.parse(await readPublicJson(request));
    const capture = await capturePartnerAttribution({ data, request });
    const response = NextResponse.json(
      { captured: true, expiresAt: capture.expiresAt.toISOString() },
      { status: 201, headers: { "Cache-Control": "no-store", "X-RateLimit-Remaining": String(rateLimit.remaining) } },
    );
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
