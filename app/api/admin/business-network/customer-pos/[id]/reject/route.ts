import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { rejectCustomerPurchaseOrder } from "@/lib/business-network/customer-po";
import { rejectCustomerPurchaseOrderSchema } from "@/lib/business-network/customer-po-schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { assertSameOriginBusinessMutation, readBusinessJsonBody } from "@/lib/business-network/request";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginBusinessMutation(request);
    const actor = await requireBusinessNetworkAdminPermission("business.customer_po.verify");
    const { id } = await params;
    const data = rejectCustomerPurchaseOrderSchema.parse(await readBusinessJsonBody(request));
    const customerPurchaseOrder = await rejectCustomerPurchaseOrder({
      id: resourceIdSchema.parse(id),
      reason: data.reason,
      actorUserId: actor.userId,
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
