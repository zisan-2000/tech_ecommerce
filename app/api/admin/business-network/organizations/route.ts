import { NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission, requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { adminOrganizationListSchema, createAdminOrganizationSchema } from "@/lib/business-network/admin-organization-schemas";
import { createAdminOrganization, listAdminOrganizations } from "@/lib/business-network/admin-organizations";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";

export async function GET(request: Request) {
  try {
    await requireAnyBusinessNetworkAdminPermission(["business.account.view", "business.account.manage", "business.quotation.create", "partner.profile.view"]);
    const query = adminOrganizationListSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json(await listAdminOrganizations(query), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return businessApiErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireBusinessNetworkAdminPermission("business.account.manage");
    const data = createAdminOrganizationSchema.parse(await readBusinessJsonBody(request));
    const organization = await createAdminOrganization({ data, actorUserId: actor.userId, request });
    return NextResponse.json({ organization }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return businessApiErrorResponse(error); }
}
