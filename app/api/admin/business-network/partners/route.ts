import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { listPartnerProfiles } from "@/lib/business-network/partner";
import { partnerListSchema } from "@/lib/business-network/partner-schemas";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireBusinessNetworkAdminPermission("partner.profile.view");
    const url = new URL(request.url);
    const query = partnerListSchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      capability: url.searchParams.get("capability") ?? undefined,
    });
    const result = await listPartnerProfiles(query);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
