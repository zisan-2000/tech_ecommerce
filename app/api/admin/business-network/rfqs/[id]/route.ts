import { NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { getAdminSalesRfq } from "@/lib/business-network/sales-rfq";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAnyBusinessNetworkAdminPermission(["business.rfq.view", "business.rfq.manage"]);
    const { id } = await params;
    const rfq = await getAdminSalesRfq(resourceIdSchema.parse(id));
    return NextResponse.json({ rfq }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
