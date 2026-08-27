import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { listAdminPartnerLeads } from "@/lib/business-network/partner-referral";
import { partnerLeadListSchema } from "@/lib/business-network/partner-referral-schemas";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireBusinessNetworkAdminPermission("partner.lead.view");
    const url = new URL(request.url);
    const query = partnerLeadListSchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      partnerProfileId: url.searchParams.get("partnerProfileId") ?? undefined,
    });
    return NextResponse.json(await listAdminPartnerLeads(query), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

