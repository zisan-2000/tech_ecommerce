import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { listAdminCustomerPurchaseOrders } from "@/lib/business-network/customer-po";
import { adminCustomerPurchaseOrderListSchema } from "@/lib/business-network/customer-po-schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";

export async function GET(request: Request) {
  try {
    await requireBusinessNetworkAdminPermission("business.customer_po.view");
    const url = new URL(request.url);
    const query = adminCustomerPurchaseOrderListSchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      organizationId: url.searchParams.get("organizationId") ?? undefined,
      quotationId: url.searchParams.get("quotationId") ?? undefined,
    });
    const result = await listAdminCustomerPurchaseOrders(query);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
