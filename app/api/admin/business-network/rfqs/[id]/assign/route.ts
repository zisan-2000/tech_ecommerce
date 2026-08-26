import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";
import { assignSalesRfq } from "@/lib/business-network/sales-rfq";
import { assignSalesRfqSchema } from "@/lib/business-network/sales-rfq-schemas";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireBusinessNetworkAdminPermission("business.rfq.assign");
    const { id } = await params;
    const data = assignSalesRfqSchema.parse(await readBusinessJsonBody(request));
    const rfq = await assignSalesRfq({
      id: resourceIdSchema.parse(id),
      userId: data.userId,
      actorUserId: actor.userId,
      request,
    });
    return NextResponse.json({ rfq }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
