import { NextResponse } from "next/server";
import { requireAuthenticatedBusinessUser } from "@/lib/business-network/context";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { acceptOrganizationInvitation } from "@/lib/business-network/invitations";
import { invitationTokenSchema } from "@/lib/business-network/schemas";
import { rateLimitRequest } from "@/lib/request-security";
import { assertSameOriginBusinessMutation } from "@/lib/business-network/request";

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOriginBusinessMutation(request);
    const rateLimit = await rateLimitRequest(request, {
      scope: "business-invitation-accept",
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many acceptance attempts. Please try again later.", code: "RATE_LIMITED" },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter), "Cache-Control": "no-store" },
        },
      );
    }
    const { token: rawToken } = await params;
    const token = invitationTokenSchema.parse(rawToken);
    const user = await requireAuthenticatedBusinessUser();
    const result = await acceptOrganizationInvitation({ token, user, request });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
