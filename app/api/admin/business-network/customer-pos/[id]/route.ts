import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { getAdminCustomerPurchaseOrder } from "@/lib/business-network/customer-po";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireBusinessNetworkAdminPermission("business.customer_po.view");
    const { id } = await params;
    const customerPurchaseOrder = await getAdminCustomerPurchaseOrder(resourceIdSchema.parse(id));
    return NextResponse.json(
      { customerPurchaseOrder },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
