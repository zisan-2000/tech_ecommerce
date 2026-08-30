import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { processPartnerSettlement } from "@/lib/business-network/settlement";
import { processSettlementSchema } from "@/lib/business-network/settlement-schemas";
import { resourceIdSchema } from "@/lib/business-network/schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const actor = await requireBusinessNetworkAdminPermission("partner.settlement.pay");
    const [{ id }, body] = await Promise.all([params, readBusinessJsonBody(request)]);
    const settlement = await processPartnerSettlement({
      id: resourceIdSchema.parse(id),
      data: processSettlementSchema.parse(body),
      actorUserId: actor.userId,
      request,
    });
    return NextResponse.json({ settlement }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
