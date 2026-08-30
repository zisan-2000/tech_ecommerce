import { type NextRequest, NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { getBusinessNetworkReport } from "@/lib/business-network/reporting";

export async function GET(request: NextRequest) {
  try {
    await requireAnyBusinessNetworkAdminPermission(["business.report.view"]);
    return NextResponse.json(await getBusinessNetworkReport(request.nextUrl), {
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
