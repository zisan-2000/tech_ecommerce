import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { assertSameOriginBusinessMutation } from "@/lib/business-network/request";
import {
  approveSalesQuotation,
  getAdminSalesQuotation,
} from "@/lib/business-network/sales-quotation";
import { assertQuotationMakerCheckerSeparation } from "@/lib/business-network/sales-quotation-core";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOriginBusinessMutation(request);
    const actor = await requireBusinessNetworkAdminPermission("business.quotation.approve");
    const { id } = await params;
    const quotationId = resourceIdSchema.parse(id);

    // Maker-checker is enforced server-side before the approval mutation. A user
    // who created either the quotation shell or its current commercial version
    // cannot approve that same quotation, even if they hold approve permission.
    const existing = await getAdminSalesQuotation(quotationId);
    const currentVersion = existing.versions.find((version) => version.isCurrent) ?? existing.versions[0];
    assertQuotationMakerCheckerSeparation(
      [existing.createdById, currentVersion?.createdById],
      actor.userId,
    );

    const quotation = await approveSalesQuotation({
      id: quotationId,
      actorUserId: actor.userId,
      request,
    });
    return NextResponse.json({ quotation }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
