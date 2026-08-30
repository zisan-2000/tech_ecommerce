import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { organizationDocumentDecisionSchema } from "@/lib/business-network/admin-organization-schemas";
import { decideOrganizationDocument } from "@/lib/business-network/admin-organizations";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";
type Context = { params: Promise<{ id: string; documentId: string }> };
export async function POST(request: Request, { params }: Context) { try { const actor = await requireBusinessNetworkAdminPermission("business.account.manage"); const route = await params; const { reason } = organizationDocumentDecisionSchema.parse(await readBusinessJsonBody(request)); const document = await decideOrganizationDocument({ organizationId: route.id, documentId: route.documentId, decision: "reject", reason, actorUserId: actor.userId, request }); return NextResponse.json({ document }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return businessApiErrorResponse(error); } }
