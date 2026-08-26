import { NextResponse } from "next/server";
import { requireBusinessPermission, requireOrganizationCapability } from "@/lib/business-network/authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { assertSameOriginBusinessMutation } from "@/lib/business-network/request";
import { viewSalesQuotation } from "@/lib/business-network/sales-quotation";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOriginBusinessMutation(request);
    const context = await requireBusinessPermission("quotation.read");
    await requireOrganizationCapability("CORPORATE_BUYER", context);
    const { id } = await params;
    const quotation = await viewSalesQuotation({ context, id: resourceIdSchema.parse(id), request });
    return NextResponse.json({ quotation }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
