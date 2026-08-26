import { NextResponse } from "next/server";
import { requireBusinessPermission, requireOrganizationCapability } from "@/lib/business-network/authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";
import { getPortalSalesRfq, updateSalesRfq } from "@/lib/business-network/sales-rfq";
import { updateSalesRfqSchema } from "@/lib/business-network/sales-rfq-schemas";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireBusinessPermission("rfq.read");
    await requireOrganizationCapability("CORPORATE_BUYER", context);
    const { id } = await params;
    const rfq = await getPortalSalesRfq(context, resourceIdSchema.parse(id));
    return NextResponse.json({ rfq }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireBusinessPermission("rfq.update");
    await requireOrganizationCapability("CORPORATE_BUYER", context);
    const { id } = await params;
    const data = updateSalesRfqSchema.parse(await readBusinessJsonBody(request));
    const rfq = await updateSalesRfq({ context, id: resourceIdSchema.parse(id), data, request });
    return NextResponse.json({ rfq }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
