import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { removeBusinessPricingRule, updateBusinessPricingRule } from "@/lib/business-network/pricing";
import { updatePricingRuleSchema } from "@/lib/business-network/pricing-schemas";
import { assertSameOriginBusinessMutation, readBusinessJsonBody } from "@/lib/business-network/request";
import { resourceIdSchema } from "@/lib/business-network/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const actor = await requireBusinessNetworkAdminPermission("business.pricing.manage");
    const [{ id }, body] = await Promise.all([params, readBusinessJsonBody(request)]);
    const rule = await updateBusinessPricingRule({
      id: resourceIdSchema.parse(id),
      data: updatePricingRuleSchema.parse(body),
      actorUserId: actor.userId,
      request,
    });
    return NextResponse.json({ rule }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    assertSameOriginBusinessMutation(request);
    const actor = await requireBusinessNetworkAdminPermission("business.pricing.manage");
    const { id } = await params;
    const rule = await removeBusinessPricingRule({
      id: resourceIdSchema.parse(id),
      actorUserId: actor.userId,
      request,
    });
    return NextResponse.json({ rule }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
