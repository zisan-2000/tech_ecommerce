import { NextResponse } from "next/server";
import { requireBusinessPermission, requireOrganizationCapability } from "@/lib/business-network/authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { listPortalSalesQuotations } from "@/lib/business-network/sales-quotation";
import { portalSalesQuotationListSchema } from "@/lib/business-network/sales-quotation-schemas";

export async function GET(request: Request) {
  try {
    const context = await requireBusinessPermission("quotation.read");
    await requireOrganizationCapability("CORPORATE_BUYER", context);
    const url = new URL(request.url);
    const query = portalSalesQuotationListSchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
    const result = await listPortalSalesQuotations({ context, ...query });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
