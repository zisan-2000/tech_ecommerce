import { NextResponse } from "next/server";
import { requireBusinessPermission, requireOrganizationCapability } from "@/lib/business-network/authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";
import { rejectSalesQuotation } from "@/lib/business-network/sales-quotation";
import { salesQuotationReasonSchema } from "@/lib/business-network/sales-quotation-schemas";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireBusinessPermission("quotation.reject");
    await requireOrganizationCapability("CORPORATE_BUYER", context);
    const { id } = await params;
    const data = salesQuotationReasonSchema.parse(await readBusinessJsonBody(request));
    const quotation = await rejectSalesQuotation({
      context,
      id: resourceIdSchema.parse(id),
      reason: data.reason,
      request,
    });
    return NextResponse.json({ quotation }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
