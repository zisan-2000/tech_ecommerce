import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";
import { rejectSalesRfq } from "@/lib/business-network/sales-rfq";
import { salesRfqReasonSchema } from "@/lib/business-network/sales-rfq-schemas";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireBusinessNetworkAdminPermission("business.rfq.manage");
    const { id } = await params;
    const data = salesRfqReasonSchema.parse(await readBusinessJsonBody(request));
    const rfq = await rejectSalesRfq({
      id: resourceIdSchema.parse(id),
      reason: data.reason,
      actorUserId: actor.userId,
      request,
    });
    return NextResponse.json({ rfq }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
