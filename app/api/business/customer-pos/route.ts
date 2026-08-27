import { NextResponse } from "next/server";
import { requireBusinessPermission, requireOrganizationCapability } from "@/lib/business-network/authorization";
import { createCustomerPurchaseOrder, listPortalCustomerPurchaseOrders } from "@/lib/business-network/customer-po";
import { createCustomerPurchaseOrderSchema, customerPurchaseOrderListSchema } from "@/lib/business-network/customer-po-schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { assertSameOriginBusinessMutation, readBusinessJsonBody } from "@/lib/business-network/request";

export async function GET(request: Request) {
  try {
    const context = await requireBusinessPermission("customer_po.read");
    await requireOrganizationCapability("CORPORATE_BUYER", context);
    const url = new URL(request.url);
    const query = customerPurchaseOrderListSchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
    const result = await listPortalCustomerPurchaseOrders({ context, ...query });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginBusinessMutation(request);
    const context = await requireBusinessPermission("customer_po.create");
    await requireOrganizationCapability("CORPORATE_BUYER", context);
    const data = createCustomerPurchaseOrderSchema.parse(await readBusinessJsonBody(request));
    const customerPurchaseOrder = await createCustomerPurchaseOrder({ context, data, request });
    return NextResponse.json(
      { customerPurchaseOrder },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
