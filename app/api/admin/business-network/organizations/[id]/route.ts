import { NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission, requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { updateAdminOrganizationSchema } from "@/lib/business-network/admin-organization-schemas";
import { getAdminOrganization, updateAdminOrganization } from "@/lib/business-network/admin-organizations";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  try {
    await requireAnyBusinessNetworkAdminPermission(["business.account.view", "business.account.manage"]);
    return NextResponse.json({ organization: await getAdminOrganization((await params).id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return businessApiErrorResponse(error); }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await requireBusinessNetworkAdminPermission("business.account.manage");
    const data = updateAdminOrganizationSchema.parse(await readBusinessJsonBody(request));
    const organization = await updateAdminOrganization({ id: (await params).id, data, actorUserId: actor.userId, request });
    return NextResponse.json({ organization }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return businessApiErrorResponse(error); }
}
