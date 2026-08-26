import { NextResponse } from "next/server";
import { requireBusinessPermission, requireOrganizationCapability } from "@/lib/business-network/authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { assertSameOriginBusinessMutation } from "@/lib/business-network/request";
import { cancelSalesRfq } from "@/lib/business-network/sales-rfq";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOriginBusinessMutation(request);
    const context = await requireBusinessPermission("rfq.cancel");
    await requireOrganizationCapability("CORPORATE_BUYER", context);
    const { id } = await params;
    const rfq = await cancelSalesRfq({ context, id: resourceIdSchema.parse(id), request });
    return NextResponse.json({ rfq }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
