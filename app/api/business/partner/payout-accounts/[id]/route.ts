import { NextResponse } from "next/server";
import { requireBusinessPermission } from "@/lib/business-network/authorization";
import {
  disablePortalPayoutAccount,
  updatePortalPayoutAccount,
} from "@/lib/business-network/settlement";
import { updatePayoutAccountSchema } from "@/lib/business-network/settlement-schemas";
import { resourceIdSchema } from "@/lib/business-network/schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { assertSameOriginBusinessMutation, readBusinessJsonBody } from "@/lib/business-network/request";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const context = await requireBusinessPermission("partner.payout_accounts.manage");
    const [{ id }, body] = await Promise.all([params, readBusinessJsonBody(request)]);
    const payoutAccount = await updatePortalPayoutAccount({
      context,
      id: resourceIdSchema.parse(id),
      data: updatePayoutAccountSchema.parse(body),
      request,
    });
    return NextResponse.json({ payoutAccount }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    assertSameOriginBusinessMutation(request);
    const context = await requireBusinessPermission("partner.payout_accounts.manage");
    const { id } = await params;
    const payoutAccount = await disablePortalPayoutAccount({
      context,
      id: resourceIdSchema.parse(id),
      request,
    });
    return NextResponse.json({ payoutAccount }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
