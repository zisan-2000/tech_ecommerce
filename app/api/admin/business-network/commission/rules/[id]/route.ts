import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { deleteCommissionRule, updateCommissionRule } from "@/lib/business-network/commission";
import { updateCommissionRuleSchema } from "@/lib/business-network/commission-schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { assertSameOriginBusinessMutation, readBusinessJsonBody } from "@/lib/business-network/request";
import { resourceIdSchema } from "@/lib/business-network/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const actor = await requireBusinessNetworkAdminPermission("partner.commission.calculate");
    const [{ id }, body] = await Promise.all([params, readBusinessJsonBody(request)]);
    const rule = await updateCommissionRule({ id: resourceIdSchema.parse(id), data: updateCommissionRuleSchema.parse(body), actorUserId: actor.userId, request });
    return NextResponse.json({ rule }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext): Promise<Response> {
  try {
    assertSameOriginBusinessMutation(request);
    const actor = await requireBusinessNetworkAdminPermission("partner.commission.calculate");
    const { id } = await params;
    return NextResponse.json(await deleteCommissionRule({ id: resourceIdSchema.parse(id), actorUserId: actor.userId, request }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
