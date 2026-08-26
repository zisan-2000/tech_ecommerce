import { NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { listAdminSalesRfqs } from "@/lib/business-network/sales-rfq";
import { adminSalesRfqListSchema } from "@/lib/business-network/sales-rfq-schemas";

export async function GET(request: Request) {
  try {
    await requireAnyBusinessNetworkAdminPermission(["business.rfq.view", "business.rfq.manage"]);
    const url = new URL(request.url);
    const query = adminSalesRfqListSchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      organizationId: url.searchParams.get("organizationId") ?? undefined,
      assignedToUserId: url.searchParams.get("assignedToUserId") ?? undefined,
    });
    const result = await listAdminSalesRfqs(query);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
