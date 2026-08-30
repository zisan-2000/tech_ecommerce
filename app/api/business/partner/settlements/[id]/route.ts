import { NextResponse } from "next/server";
import { requireBusinessPermission } from "@/lib/business-network/authorization";
import { getPortalSettlement } from "@/lib/business-network/settlement";
import { resourceIdSchema } from "@/lib/business-network/schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const context = await requireBusinessPermission("partner.settlements.read");
    const { id } = await params;
    return NextResponse.json(
      { settlement: await getPortalSettlement(context, resourceIdSchema.parse(id)) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
