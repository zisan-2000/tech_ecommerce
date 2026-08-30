import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { listAdminCommissionEntries } from "@/lib/business-network/commission";
import { commissionEntryListSchema } from "@/lib/business-network/commission-schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireBusinessNetworkAdminPermission("partner.commission.view");
    const query = commissionEntryListSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json(await listAdminCommissionEntries(query), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
