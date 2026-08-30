import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { verifyPayoutAccount } from "@/lib/business-network/settlement";
import { resourceIdSchema } from "@/lib/business-network/schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { assertSameOriginBusinessMutation } from "@/lib/business-network/request";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    assertSameOriginBusinessMutation(request);
    const actor = await requireBusinessNetworkAdminPermission("partner.payout_account.verify");
    const { id } = await params;
    const payoutAccount = await verifyPayoutAccount({ id: resourceIdSchema.parse(id), actorUserId: actor.userId, request });
    return NextResponse.json({ payoutAccount }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
