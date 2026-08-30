import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { decideOrganizationDocument } from "@/lib/business-network/admin-organizations";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { assertSameOriginBusinessMutation } from "@/lib/business-network/request";
type Context = { params: Promise<{ id: string; documentId: string }> };
export async function POST(request: Request, { params }: Context) { try { assertSameOriginBusinessMutation(request); const actor = await requireBusinessNetworkAdminPermission("business.account.manage"); const route = await params; const document = await decideOrganizationDocument({ organizationId: route.id, documentId: route.documentId, decision: "verify", actorUserId: actor.userId, request }); return NextResponse.json({ document }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return businessApiErrorResponse(error); } }
