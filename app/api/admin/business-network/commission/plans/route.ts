import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { createCommissionPlan, listCommissionPlans } from "@/lib/business-network/commission";
import { commissionPlanListSchema, createCommissionPlanSchema } from "@/lib/business-network/commission-schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireBusinessNetworkAdminPermission("partner.commission.view");
    const query = commissionPlanListSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json(await listCommissionPlans(query), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireBusinessNetworkAdminPermission("partner.commission.calculate");
    const data = createCommissionPlanSchema.parse(await readBusinessJsonBody(request));
    const plan = await createCommissionPlan({ data, actorUserId: actor.userId, request });
    return NextResponse.json({ plan }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
