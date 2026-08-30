import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { markPartnerSettlementPaid } from "@/lib/business-network/settlement";
import { markSettlementPaidSchema } from "@/lib/business-network/settlement-schemas";
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
    const data = markSettlementPaidSchema.parse(body);
    const settlement = await markPartnerSettlementPaid({
      id: resourceIdSchema.parse(id),
      paymentReference: data.paymentReference,
      actorUserId: actor.userId,
      request,
    });
    return NextResponse.json({ settlement }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
