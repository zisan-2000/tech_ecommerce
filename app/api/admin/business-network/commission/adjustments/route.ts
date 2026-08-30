import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { createCommissionAdjustment } from "@/lib/business-network/commission";
import { createCommissionAdjustmentSchema } from "@/lib/business-network/commission-schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireBusinessNetworkAdminPermission("partner.commission.adjust");
    const data = createCommissionAdjustmentSchema.parse(await readBusinessJsonBody(request));
    const entry = await createCommissionAdjustment({ data, actorUserId: actor.userId, request });
    return NextResponse.json({ entry }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
