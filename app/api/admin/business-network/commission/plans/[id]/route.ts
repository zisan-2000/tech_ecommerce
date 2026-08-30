import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { getCommissionPlan, updateCommissionPlan } from "@/lib/business-network/commission";
import { updateCommissionPlanSchema } from "@/lib/business-network/commission-schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";
import { resourceIdSchema } from "@/lib/business-network/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  try {
    await requireBusinessNetworkAdminPermission("partner.commission.view");
    const { id } = await params;
    return NextResponse.json({ plan: await getCommissionPlan(resourceIdSchema.parse(id)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const actor = await requireBusinessNetworkAdminPermission("partner.commission.calculate");
    const [{ id }, body] = await Promise.all([params, readBusinessJsonBody(request)]);
    const plan = await updateCommissionPlan({ id: resourceIdSchema.parse(id), data: updateCommissionPlanSchema.parse(body), actorUserId: actor.userId, request });
    return NextResponse.json({ plan }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
