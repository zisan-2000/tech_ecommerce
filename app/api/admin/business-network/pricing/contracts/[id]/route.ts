import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { updateContractPrice } from "@/lib/business-network/pricing";
import { updateContractPriceSchema } from "@/lib/business-network/pricing-schemas";
import { readBusinessJsonBody } from "@/lib/business-network/request";
import { resourceIdSchema } from "@/lib/business-network/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const actor = await requireBusinessNetworkAdminPermission("business.pricing.manage");
    const [{ id }, body] = await Promise.all([params, readBusinessJsonBody(request)]);
    const contract = await updateContractPrice({
      id: resourceIdSchema.parse(id),
      data: updateContractPriceSchema.parse(body),
      actorUserId: actor.userId,
      request,
    });
    return NextResponse.json({ contract }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
