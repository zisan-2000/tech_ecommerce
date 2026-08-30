import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { createCommissionRule } from "@/lib/business-network/commission";
import { createCommissionRuleSchema } from "@/lib/business-network/commission-schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";
import { resourceIdSchema } from "@/lib/business-network/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const actor = await requireBusinessNetworkAdminPermission("partner.commission.calculate");
    const [{ id }, body] = await Promise.all([params, readBusinessJsonBody(request)]);
    const rule = await createCommissionRule({ commissionPlanId: resourceIdSchema.parse(id), data: createCommissionRuleSchema.parse(body), actorUserId: actor.userId, request });
    return NextResponse.json({ rule }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
