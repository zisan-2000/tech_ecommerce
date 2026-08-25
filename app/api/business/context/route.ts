import { NextResponse } from "next/server";
import { getBusinessContext } from "@/lib/business-network/context";
import { businessApiErrorResponse } from "@/lib/business-network/errors";

export async function GET() {
  try {
    const context = await getBusinessContext();
    const active = context.activeMembership;
    return NextResponse.json(
      {
        organizations: context.organizations,
        activeOrganization: active?.organization ?? null,
        activeMemberId: active?.memberId ?? null,
        roles: active?.roles ?? [],
        permissions: active?.permissions ?? [],
        activeCapabilities: active?.activeCapabilities ?? [],
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
