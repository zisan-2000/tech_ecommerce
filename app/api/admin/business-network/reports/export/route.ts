import { type NextRequest, NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { exportBusinessNetworkReport } from "@/lib/business-network/reporting";
import { rateLimitRequest } from "@/lib/request-security";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAnyBusinessNetworkAdminPermission(["business.report.view"]);
    const rateLimit = await rateLimitRequest(request, {
      scope: "business-network-report-export",
      identifier: actor.userId,
      limit: 10,
      windowMs: 10 * 60_000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many report exports. Please try again later.", code: "RATE_LIMITED" },
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
    const exported = await exportBusinessNetworkReport(request.nextUrl);
    return new NextResponse(exported.content, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exported.filename}"`,
        "X-Content-Type-Options": "nosniff",
        "X-RateLimit-Remaining": String(rateLimit.remaining),
        Vary: "Cookie",
      },
    });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
