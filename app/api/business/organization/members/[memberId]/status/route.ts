import { NextResponse } from "next/server";
import { requireBusinessPermission } from "@/lib/business-network/authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { updateOrganizationMemberStatus } from "@/lib/business-network/membership";
import { resourceIdSchema, updateMemberStatusSchema } from "@/lib/business-network/schemas";
import { readBusinessJsonBody } from "@/lib/business-network/request";

type RouteContext = { params: Promise<{ memberId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { memberId: rawMemberId } = await params;
    const memberId = resourceIdSchema.parse(rawMemberId);
    const body = await readBusinessJsonBody(request);
    const { status } = updateMemberStatusSchema.parse(body);
    const context = await requireBusinessPermission("organization.members.manage");
    const member = await updateOrganizationMemberStatus({
      context,
      memberId,
      status,
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
