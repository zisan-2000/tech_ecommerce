import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { getAdminSettlement } from "@/lib/business-network/settlement";
import { resourceIdSchema } from "@/lib/business-network/schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireBusinessNetworkAdminPermission("partner.settlement.view");
    const { id } = await params;
    return NextResponse.json(
      { settlement: await getAdminSettlement(resourceIdSchema.parse(id)) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
