import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { getAdminPartnerProfile } from "@/lib/business-network/partner";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireBusinessNetworkAdminPermission("partner.profile.view");
    const { id } = await params;
    const partnerProfile = await getAdminPartnerProfile(resourceIdSchema.parse(id));
    return NextResponse.json(
      { partnerProfile },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
