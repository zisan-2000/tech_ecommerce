import { NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { cancelPartnerSettlement } from "@/lib/business-network/settlement";
import { settlementReasonSchema } from "@/lib/business-network/settlement-schemas";
import { resourceIdSchema } from "@/lib/business-network/schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const actor = await requireAnyBusinessNetworkAdminPermission([
      "partner.settlement.create",
      "partner.settlement.pay",
    ]);
    const [{ id }, body] = await Promise.all([params, readBusinessJsonBody(request)]);
    const data = settlementReasonSchema.parse(body);
    const settlement = await cancelPartnerSettlement({
      id: resourceIdSchema.parse(id),
      reason: data.reason,
      actorUserId: actor.userId,
      request,
    });
    return NextResponse.json({ settlement }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
