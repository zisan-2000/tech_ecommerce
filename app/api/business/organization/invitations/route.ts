import { NextResponse } from "next/server";
import { requireBusinessPermission } from "@/lib/business-network/authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import {
  createOrganizationInvitation,
  listOrganizationInvitations,
} from "@/lib/business-network/invitations";
import { createInvitationSchema } from "@/lib/business-network/schemas";
import { rateLimitRequest } from "@/lib/request-security";
import { readBusinessJsonBody } from "@/lib/business-network/request";

export async function GET() {
  try {
    const context = await requireBusinessPermission("organization.members.read");
    const invitations = await listOrganizationInvitations(context);
    return NextResponse.json(
      { invitations },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const rateLimit = await rateLimitRequest(request, {
      scope: "business-invitation-create",
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many invitation requests. Please try again later.", code: "RATE_LIMITED" },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter), "Cache-Control": "no-store" },
        },
      );
    }
    const body = await readBusinessJsonBody(request);
    const input = createInvitationSchema.parse(body);
    const context = await requireBusinessPermission("organization.members.invite");
    const result = await createOrganizationInvitation({
      context,
      email: input.email,
      role: input.role,
      request,
    });
    return NextResponse.json(result, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
