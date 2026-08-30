import { NextResponse } from "next/server";
import { requireBusinessPermission } from "@/lib/business-network/authorization";
import { listPortalSettlements } from "@/lib/business-network/settlement";
import { settlementListSchema } from "@/lib/business-network/settlement-schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireBusinessPermission("partner.settlements.read");
    const raw = Object.fromEntries(new URL(request.url).searchParams);
    delete raw.partnerProfileId;
    const query = settlementListSchema.parse(raw);
    return NextResponse.json(await listPortalSettlements(context, query), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
