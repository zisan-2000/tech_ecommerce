import { type NextRequest, NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { exportBusinessNetworkReport } from "@/lib/business-network/reporting";

export async function GET(request: NextRequest) {
  try {
    await requireAnyBusinessNetworkAdminPermission(["business.report.view"]);
    const exported = await exportBusinessNetworkReport(request.nextUrl);
    return new NextResponse(exported.content, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exported.filename}"`,
        "X-Content-Type-Options": "nosniff",
        Vary: "Cookie",
      },
    });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
