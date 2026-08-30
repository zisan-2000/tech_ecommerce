import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { rejectPayoutAccount } from "@/lib/business-network/settlement";
import { payoutAccountRejectSchema } from "@/lib/business-network/settlement-schemas";
import { resourceIdSchema } from "@/lib/business-network/schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const actor = await requireBusinessNetworkAdminPermission("partner.payout_account.verify");
    const [{ id }, body] = await Promise.all([params, readBusinessJsonBody(request)]);
    const data = payoutAccountRejectSchema.parse(body);
    const payoutAccount = await rejectPayoutAccount({
      id: resourceIdSchema.parse(id),
      reason: data.reason,
      actorUserId: actor.userId,
      request,
    });
    return NextResponse.json({ payoutAccount }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
