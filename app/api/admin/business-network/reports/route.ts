import { type NextRequest, NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { getBusinessNetworkReport } from "@/lib/business-network/reporting";
import { rateLimitRequest } from "@/lib/request-security";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAnyBusinessNetworkAdminPermission(["business.report.view"]);
    const rateLimit = await rateLimitRequest(request, {
      scope: "business-network-report",
      identifier: actor.userId,
      limit: 60,
      windowMs: 5 * 60_000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many report requests. Please try again later.", code: "RATE_LIMITED" },
        {
          status: 429,
          headers: {
            "Cache-Control": "private, no-store",
            "Retry-After": String(rateLimit.retryAfter),
            Vary: "Cookie",
          },
        },
      );
    }
    return NextResponse.json(await getBusinessNetworkReport(request.nextUrl), {
      headers: {
        "Cache-Control": "private, no-store",
        "X-RateLimit-Remaining": String(rateLimit.remaining),
        Vary: "Cookie",
      },
    });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
