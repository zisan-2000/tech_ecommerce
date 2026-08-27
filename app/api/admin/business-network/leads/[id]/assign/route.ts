import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { updatePartnerLeadWorkflow } from "@/lib/business-network/partner-referral";
import { assignPartnerLeadSchema } from "@/lib/business-network/partner-referral-schemas";
import { assertSameOriginBusinessMutation, readBusinessJsonBody } from "@/lib/business-network/request";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertSameOriginBusinessMutation(request);
    const actor = await requireBusinessNetworkAdminPermission("partner.lead.assign");
    const data = assignPartnerLeadSchema.parse(await readBusinessJsonBody(request));
    const lead = await updatePartnerLeadWorkflow({ id: (await params).id, action: "assign", ...data, actorUserId: actor.userId, request });
    return NextResponse.json({ lead }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

