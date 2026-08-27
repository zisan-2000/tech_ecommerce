import { NextResponse } from "next/server";
import { requireBusinessPermission } from "@/lib/business-network/authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { createPortalPartnerLead, listPortalPartnerLeads } from "@/lib/business-network/partner-referral";
import { createPartnerLeadSchema, partnerLeadListSchema } from "@/lib/business-network/partner-referral-schemas";
import { assertSameOriginBusinessMutation, readBusinessJsonBody } from "@/lib/business-network/request";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireBusinessPermission("partner.leads.read");
    const url = new URL(request.url);
    const query = partnerLeadListSchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
    return NextResponse.json(await listPortalPartnerLeads(context, query), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOriginBusinessMutation(request);
    const context = await requireBusinessPermission("partner.leads.create");
    const data = createPartnerLeadSchema.parse(await readBusinessJsonBody(request));
    const result = await createPortalPartnerLead({ context, data, request });
    return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

