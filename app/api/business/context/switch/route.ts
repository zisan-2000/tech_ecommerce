import { NextResponse } from "next/server";
import {
  BUSINESS_ACTIVE_ORGANIZATION_COOKIE,
  BUSINESS_ACTIVE_ORGANIZATION_MAX_AGE,
  getBusinessContext,
} from "@/lib/business-network/context";
import { BusinessNetworkError, businessApiErrorResponse } from "@/lib/business-network/errors";
import { organizationSwitchSchema } from "@/lib/business-network/schemas";
import { readBusinessJsonBody } from "@/lib/business-network/request";

export async function POST(request: Request) {
  try {
    const body = await readBusinessJsonBody(request);
    const { organizationId } = organizationSwitchSchema.parse(body);
    const context = await getBusinessContext();
    const membership = context.organizations.find(
      (item) => item.organization.id === organizationId,
    );
    if (!membership) {
      throw new BusinessNetworkError(
        404,
        "ORGANIZATION_MEMBERSHIP_NOT_FOUND",
        "An active organization membership was not found.",
      );
    }

    const response = NextResponse.json(
      { activeOrganization: membership.organization },
      { headers: { "Cache-Control": "private, no-store" } },
    );
    response.cookies.set(BUSINESS_ACTIVE_ORGANIZATION_COOKIE, organizationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: BUSINESS_ACTIVE_ORGANIZATION_MAX_AGE,
      priority: "high",
    });
    return response;
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
