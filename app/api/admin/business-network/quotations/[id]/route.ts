import { NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { getAdminSalesQuotation } from "@/lib/business-network/sales-quotation";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAnyBusinessNetworkAdminPermission(["business.quotation.view", "business.quotation.create"]);
    const { id } = await params;
    const quotation = await getAdminSalesQuotation(resourceIdSchema.parse(id));
    return NextResponse.json({ quotation }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
