import { NextResponse } from "next/server";
import { requireBusinessPermission, requireOrganizationCapability } from "@/lib/business-network/authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";
import { createSalesRfq, listPortalSalesRfqs } from "@/lib/business-network/sales-rfq";
import { createSalesRfqSchema, portalSalesRfqListSchema } from "@/lib/business-network/sales-rfq-schemas";

export async function GET(request: Request) {
  try {
    const context = await requireBusinessPermission("rfq.read");
    await requireOrganizationCapability("CORPORATE_BUYER", context);
    const url = new URL(request.url);
    const query = portalSalesRfqListSchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
    const result = await listPortalSalesRfqs({ context, ...query });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireBusinessPermission("rfq.create");
    await requireOrganizationCapability("CORPORATE_BUYER", context);
    const data = createSalesRfqSchema.parse(await readBusinessJsonBody(request));
    const rfq = await createSalesRfq({ context, data, request });
    return NextResponse.json({ rfq }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
