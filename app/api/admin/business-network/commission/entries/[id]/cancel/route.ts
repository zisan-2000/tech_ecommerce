import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { cancelCommissionEntry } from "@/lib/business-network/commission";
import { commissionReasonSchema } from "@/lib/business-network/commission-schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const actor = await requireBusinessNetworkAdminPermission("partner.commission.adjust");
    const [{ id }, body] = await Promise.all([params, readBusinessJsonBody(request)]);
    const data = commissionReasonSchema.parse(body);
    const entry = await cancelCommissionEntry({ id: resourceIdSchema.parse(id), reason: data.reason, actorUserId: actor.userId, request });
    return NextResponse.json({ entry }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
