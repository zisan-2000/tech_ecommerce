import { NextResponse } from "next/server";
import { requireBusinessPermission } from "@/lib/business-network/authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { getPortalPartnerLead } from "@/lib/business-network/partner-referral";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const context = await requireBusinessPermission("partner.leads.read");
    const lead = await getPortalPartnerLead(context, (await params).id);
    return NextResponse.json({ lead }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

