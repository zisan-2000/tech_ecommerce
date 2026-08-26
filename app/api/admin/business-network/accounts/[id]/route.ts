import { NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission, requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { getBusinessAccount, updateBusinessAccount } from "@/lib/business-network/business-accounts";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { updateBusinessAccountSchema } from "@/lib/business-network/pricing-schemas";
import { readBusinessJsonBody } from "@/lib/business-network/request";
import { resourceIdSchema } from "@/lib/business-network/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    await requireAnyBusinessNetworkAdminPermission(["business.account.view", "business.account.manage"]);
    const { id: rawId } = await params;
    const account = await getBusinessAccount(resourceIdSchema.parse(rawId));
    return NextResponse.json({ account }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const actor = await requireBusinessNetworkAdminPermission("business.account.manage");
    const [{ id: rawId }, body] = await Promise.all([params, readBusinessJsonBody(request)]);
    const account = await updateBusinessAccount({
      id: resourceIdSchema.parse(rawId),
      data: updateBusinessAccountSchema.parse(body),
      actorUserId: actor.userId,
      request,
    });
    return NextResponse.json({ account }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
