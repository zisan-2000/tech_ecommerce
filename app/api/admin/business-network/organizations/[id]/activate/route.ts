import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { transitionAdminOrganization } from "@/lib/business-network/admin-organizations";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { assertSameOriginBusinessMutation } from "@/lib/business-network/request";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: Context) { try { assertSameOriginBusinessMutation(request); const actor = await requireBusinessNetworkAdminPermission("business.account.manage"); const organization = await transitionAdminOrganization({ id: (await params).id, transition: "activate", actorUserId: actor.userId, request }); return NextResponse.json({ organization }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return businessApiErrorResponse(error); } }
