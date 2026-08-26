import { NextResponse } from "next/server";
import { requireBusinessPermission, requireOrganizationCapability } from "@/lib/business-network/authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { assertSameOriginBusinessMutation } from "@/lib/business-network/request";
import { removeSalesRfqAttachment } from "@/lib/business-network/sales-rfq";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    assertSameOriginBusinessMutation(request);
    const context = await requireBusinessPermission("rfq.update");
    await requireOrganizationCapability("CORPORATE_BUYER", context);
    const { id, attachmentId } = await params;
    const result = await removeSalesRfqAttachment({
      context,
      id: resourceIdSchema.parse(id),
      attachmentId: resourceIdSchema.parse(attachmentId),
      request,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
