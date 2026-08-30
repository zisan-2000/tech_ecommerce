import { NextResponse } from "next/server";
import { requireBusinessPermission } from "@/lib/business-network/authorization";
import { BusinessNetworkError, businessApiErrorResponse } from "@/lib/business-network/errors";
import { getPortalOrder } from "@/lib/business-portal/portal-read";

export async function GET(_request: Request, { params }: RouteContext<"/api/business/orders/[id]">) {
  try {
    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) throw new BusinessNetworkError(422, "INVALID_ORDER_ID", "Order ID is invalid.");
    const context = await requireBusinessPermission("order.read");
    return NextResponse.json({ order: await getPortalOrder(context, id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return businessApiErrorResponse(error); }
}

