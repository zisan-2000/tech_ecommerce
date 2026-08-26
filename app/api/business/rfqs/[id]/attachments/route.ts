import { NextResponse } from "next/server";
import { requireBusinessPermission, requireOrganizationCapability } from "@/lib/business-network/authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";
import { addSalesRfqAttachment } from "@/lib/business-network/sales-rfq";
import { salesRfqAttachmentSchema } from "@/lib/business-network/sales-rfq-schemas";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireBusinessPermission("rfq.update");
    await requireOrganizationCapability("CORPORATE_BUYER", context);
    const { id } = await params;
    const data = salesRfqAttachmentSchema.parse(await readBusinessJsonBody(request));
    const attachment = await addSalesRfqAttachment({
      context,
      id: resourceIdSchema.parse(id),
      data,
      request,
    });
    return NextResponse.json({ attachment }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
