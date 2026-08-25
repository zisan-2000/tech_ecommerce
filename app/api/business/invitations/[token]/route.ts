import { NextResponse } from "next/server";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readOrganizationInvitation } from "@/lib/business-network/invitations";
import { invitationTokenSchema } from "@/lib/business-network/schemas";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { token: rawToken } = await params;
    const token = invitationTokenSchema.parse(rawToken);
    const result = await readOrganizationInvitation(token);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
