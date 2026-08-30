import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { createOrganizationCapabilitySchema } from "@/lib/business-network/admin-organization-schemas";
import { upsertOrganizationCapability } from "@/lib/business-network/admin-organizations";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: Context) { try { const actor = await requireBusinessNetworkAdminPermission("business.account.manage"); const data = createOrganizationCapabilitySchema.parse(await readBusinessJsonBody(request)); const capability = await upsertOrganizationCapability({ organizationId: (await params).id, data, actorUserId: actor.userId, request }); return NextResponse.json({ capability }, { status: 201, headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return businessApiErrorResponse(error); } }
