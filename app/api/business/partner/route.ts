import { NextResponse } from "next/server";
import { requireAnyOrganizationCapability, requireBusinessPermission } from "@/lib/business-network/authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { getPortalPartnerProfile } from "@/lib/business-network/partner";

const PARTNER_CAPABILITIES = [
  "AFFILIATE",
  "RESELLER",
  "DEALER",
  "MARKETING_PARTNER",
  "SERVICE_PARTNER",
] as const;

export async function GET(): Promise<Response> {
  try {
    const context = await requireBusinessPermission("partner.dashboard.read");
    await requireAnyOrganizationCapability(PARTNER_CAPABILITIES, context);
    const partnerProfile = await getPortalPartnerProfile(context);
    return NextResponse.json(
      { partnerProfile },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
