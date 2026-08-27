import { NextResponse } from "next/server";
import { requireBusinessPermission, requireOrganizationCapability } from "@/lib/business-network/authorization";
import { getPortalCustomerPurchaseOrder } from "@/lib/business-network/customer-po";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireBusinessPermission("customer_po.read");
    await requireOrganizationCapability("CORPORATE_BUYER", context);
    const { id } = await params;
    const customerPurchaseOrder = await getPortalCustomerPurchaseOrder(
      context,
      resourceIdSchema.parse(id),
    );
    return NextResponse.json(
      { customerPurchaseOrder },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
