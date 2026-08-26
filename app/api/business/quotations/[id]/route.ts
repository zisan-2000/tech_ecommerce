import { NextResponse } from "next/server";
import { requireBusinessPermission, requireOrganizationCapability } from "@/lib/business-network/authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { getPortalSalesQuotation } from "@/lib/business-network/sales-quotation";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireBusinessPermission("quotation.read");
    await requireOrganizationCapability("CORPORATE_BUYER", context);
    const { id } = await params;
    const quotation = await getPortalSalesQuotation(context, resourceIdSchema.parse(id));
    return NextResponse.json({ quotation }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
