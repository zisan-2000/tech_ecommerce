import { NextResponse } from "next/server";
import { requireBusinessPermission } from "@/lib/business-network/authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { revokeOrganizationInvitation } from "@/lib/business-network/invitations";
import { resourceIdSchema } from "@/lib/business-network/schemas";
import { assertSameOriginBusinessMutation } from "@/lib/business-network/request";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOriginBusinessMutation(request);
    const { id } = await params;
    const invitationId = resourceIdSchema.parse(id);
    const context = await requireBusinessPermission("organization.members.invite");
    const invitation = await revokeOrganizationInvitation({
      context,
      invitationId,
      request,
    });
    return NextResponse.json(
      { invitation },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
