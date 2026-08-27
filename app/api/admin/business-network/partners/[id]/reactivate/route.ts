import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { reactivatePartnerProfile } from "@/lib/business-network/partner";
import { assertSameOriginBusinessMutation } from "@/lib/business-network/request";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertSameOriginBusinessMutation(request);
    const actor = await requireBusinessNetworkAdminPermission("partner.profile.suspend");
    const { id } = await params;
    const partnerProfile = await reactivatePartnerProfile({
      id: resourceIdSchema.parse(id), actorUserId: actor.userId, request,
    });
    return NextResponse.json({ partnerProfile }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
