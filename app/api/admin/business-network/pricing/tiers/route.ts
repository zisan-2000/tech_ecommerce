import { NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission, requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { createBusinessPricingTier, listBusinessPricingTiers } from "@/lib/business-network/pricing";
import { adminListSchema, createPricingTierSchema } from "@/lib/business-network/pricing-schemas";
import { readBusinessJsonBody } from "@/lib/business-network/request";

export async function GET(request: Request) {
  try {
    await requireAnyBusinessNetworkAdminPermission(["business.pricing.view", "business.pricing.manage"]);
    const query = adminListSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const result = await listBusinessPricingTiers(query);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireBusinessNetworkAdminPermission("business.pricing.manage");
    const data = createPricingTierSchema.parse(await readBusinessJsonBody(request));
    const tier = await createBusinessPricingTier({ data, actorUserId: actor.userId, request });
    return NextResponse.json({ tier }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
