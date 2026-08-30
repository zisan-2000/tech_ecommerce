import { NextResponse } from "next/server";
import { requireBusinessPermission } from "@/lib/business-network/authorization";
import { listPortalCommissionEntries } from "@/lib/business-network/commission";
import { commissionEntryListSchema } from "@/lib/business-network/commission-schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireBusinessPermission("partner.commissions.read");
    const raw = Object.fromEntries(new URL(request.url).searchParams);
    delete raw.partnerProfileId;
    const query = commissionEntryListSchema.parse(raw);
    return NextResponse.json(await listPortalCommissionEntries(context, query), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
