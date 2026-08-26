import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";
import { createSalesQuotationVersion } from "@/lib/business-network/sales-quotation";
import { createSalesQuotationVersionSchema } from "@/lib/business-network/sales-quotation-schemas";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireBusinessNetworkAdminPermission("business.quotation.create");
    const { id } = await params;
    const data = createSalesQuotationVersionSchema.parse(await readBusinessJsonBody(request));
    const quotation = await createSalesQuotationVersion({ id: resourceIdSchema.parse(id), data, actorUserId: actor.userId, request });
    return NextResponse.json({ quotation }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
