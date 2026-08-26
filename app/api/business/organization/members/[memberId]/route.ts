import { NextResponse } from "next/server";
import { requireBusinessPermission } from "@/lib/business-network/authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { updateOrganizationMemberStatus } from "@/lib/business-network/membership";
import { assertSameOriginBusinessMutation } from "@/lib/business-network/request";
import { resourceIdSchema } from "@/lib/business-network/schemas";

type RouteContext = { params: Promise<{ memberId: string }> };

/**
 * Preserve membership and audit history while exposing the blueprint's DELETE
 * contract. A removed member can only be restored through the guarded status
 * workflow; this endpoint never hard-deletes the membership row.
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    assertSameOriginBusinessMutation(request);
    const { memberId: rawMemberId } = await params;
    const memberId = resourceIdSchema.parse(rawMemberId);
    const context = await requireBusinessPermission("organization.members.manage");
    const member = await updateOrganizationMemberStatus({
      context,
      memberId,
      status: "REMOVED",
      request,
    });

    return NextResponse.json(
      { member },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
