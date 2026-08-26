import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { createBusinessPricingRule } from "@/lib/business-network/pricing";
import { createPricingRuleSchema } from "@/lib/business-network/pricing-schemas";
import { readBusinessJsonBody } from "@/lib/business-network/request";
import { resourceIdSchema } from "@/lib/business-network/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const actor = await requireBusinessNetworkAdminPermission("business.pricing.manage");
    const [{ id }, body] = await Promise.all([params, readBusinessJsonBody(request)]);
    const rule = await createBusinessPricingRule({
      pricingTierId: resourceIdSchema.parse(id),
      data: createPricingRuleSchema.parse(body),
      actorUserId: actor.userId,
      request,
    });
    return NextResponse.json({ rule }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
