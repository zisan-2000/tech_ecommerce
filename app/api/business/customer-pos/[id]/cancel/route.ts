import { NextResponse } from "next/server";
import { requireBusinessPermission, requireOrganizationCapability } from "@/lib/business-network/authorization";
import { cancelCustomerPurchaseOrder } from "@/lib/business-network/customer-po";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { assertSameOriginBusinessMutation } from "@/lib/business-network/request";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginBusinessMutation(request);
    const context = await requireBusinessPermission("customer_po.cancel");
    await requireOrganizationCapability("CORPORATE_BUYER", context);
    const { id } = await params;
    const customerPurchaseOrder = await cancelCustomerPurchaseOrder({
      context,
      id: resourceIdSchema.parse(id),
      request,
    });
    return NextResponse.json(
      { customerPurchaseOrder },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
