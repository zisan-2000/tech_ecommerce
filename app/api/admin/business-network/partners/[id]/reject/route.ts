import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { rejectPartnerProfile } from "@/lib/business-network/partner";
import { partnerReasonSchema } from "@/lib/business-network/partner-schemas";
import { assertSameOriginBusinessMutation, readBusinessJsonBody } from "@/lib/business-network/request";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertSameOriginBusinessMutation(request);
    const actor = await requireBusinessNetworkAdminPermission("partner.profile.approve");
    const { id } = await params;
    const data = partnerReasonSchema.parse(await readBusinessJsonBody(request));
    const partnerProfile = await rejectPartnerProfile({
      id: resourceIdSchema.parse(id), reason: data.reason, actorUserId: actor.userId, request,
    });
    return NextResponse.json({ partnerProfile }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
