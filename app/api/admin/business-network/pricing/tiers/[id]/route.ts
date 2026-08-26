import { NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission, requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { getBusinessPricingTier, updateBusinessPricingTier } from "@/lib/business-network/pricing";
import { updatePricingTierSchema } from "@/lib/business-network/pricing-schemas";
import { readBusinessJsonBody } from "@/lib/business-network/request";
import { resourceIdSchema } from "@/lib/business-network/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    await requireAnyBusinessNetworkAdminPermission(["business.pricing.view", "business.pricing.manage"]);
    const { id } = await params;
    const tier = await getBusinessPricingTier(resourceIdSchema.parse(id));
    return NextResponse.json({ tier }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const actor = await requireBusinessNetworkAdminPermission("business.pricing.manage");
    const [{ id }, body] = await Promise.all([params, readBusinessJsonBody(request)]);
    const tier = await updateBusinessPricingTier({
      id: resourceIdSchema.parse(id),
      data: updatePricingTierSchema.parse(body),
      actorUserId: actor.userId,
      request,
    });
    return NextResponse.json({ tier }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
