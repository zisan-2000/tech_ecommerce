import { NextResponse } from "next/server";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";
import { rateLimitRequest } from "@/lib/request-security";
import { businessApplicationSchema, createBusinessApplication } from "@/lib/business-portal/application";

export async function POST(request: Request) {
  try {
    const rateLimit = await rateLimitRequest(request, { scope: "business-application-create", limit: 5, windowMs: 60 * 60 * 1000 });
    if (!rateLimit.allowed) return NextResponse.json({ error: "Too many application attempts. Please try again later.", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter), "Cache-Control": "no-store" } });
    const data = businessApplicationSchema.parse(await readBusinessJsonBody(request));
    const application = await createBusinessApplication({ data, request });
    return NextResponse.json({ application }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return businessApiErrorResponse(error); }
}

