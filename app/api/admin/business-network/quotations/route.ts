import { NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission, requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";
import { createSalesQuotation, listAdminSalesQuotations } from "@/lib/business-network/sales-quotation";
import { adminSalesQuotationListSchema, createSalesQuotationSchema } from "@/lib/business-network/sales-quotation-schemas";

export async function GET(request: Request) {
  try {
    await requireAnyBusinessNetworkAdminPermission(["business.quotation.view", "business.quotation.create"]);
    const url = new URL(request.url);
    const query = adminSalesQuotationListSchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      organizationId: url.searchParams.get("organizationId") ?? undefined,
      salesRfqId: url.searchParams.get("salesRfqId") ?? undefined,
    });
    const result = await listAdminSalesQuotations(query);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireBusinessNetworkAdminPermission("business.quotation.create");
    const data = createSalesQuotationSchema.parse(await readBusinessJsonBody(request));
    const quotation = await createSalesQuotation({ data, actorUserId: actor.userId, request });
    return NextResponse.json({ quotation }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
