import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { assertSameOriginBusinessMutation } from "@/lib/business-network/request";
import { closeSalesRfq } from "@/lib/business-network/sales-rfq";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginBusinessMutation(request);
    const actor = await requireBusinessNetworkAdminPermission("business.rfq.manage");
    const { id } = await params;
    const rfq = await closeSalesRfq({ id: resourceIdSchema.parse(id), actorUserId: actor.userId, request });
    return NextResponse.json({ rfq }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
