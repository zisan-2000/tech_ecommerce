import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { updateOrganizationCapabilitySchema } from "@/lib/business-network/admin-organization-schemas";
import { updateOrganizationCapability } from "@/lib/business-network/admin-organizations";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";
type Context = { params: Promise<{ id: string; capabilityId: string }> };
export async function PATCH(request: Request, { params }: Context) { try { const actor = await requireBusinessNetworkAdminPermission("business.account.manage"); const route = await params; const data = updateOrganizationCapabilitySchema.parse(await readBusinessJsonBody(request)); const capability = await updateOrganizationCapability({ organizationId: route.id, capabilityId: route.capabilityId, data, actorUserId: actor.userId, request }); return NextResponse.json({ capability }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return businessApiErrorResponse(error); } }
