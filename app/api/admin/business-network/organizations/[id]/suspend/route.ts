import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { organizationReasonSchema } from "@/lib/business-network/admin-organization-schemas";
import { transitionAdminOrganization } from "@/lib/business-network/admin-organizations";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: Context) { try { const actor = await requireBusinessNetworkAdminPermission("business.account.manage"); const { reason } = organizationReasonSchema.parse(await readBusinessJsonBody(request)); const organization = await transitionAdminOrganization({ id: (await params).id, transition: "suspend", reason, actorUserId: actor.userId, request }); return NextResponse.json({ organization }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return businessApiErrorResponse(error); } }
