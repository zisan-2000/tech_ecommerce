import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { adjustCredit } from "@/lib/business-network/credit";
import { adjustCreditSchema } from "@/lib/business-network/credit-schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireBusinessNetworkAdminPermission("business.credit.adjust");
    const { id } = await params;
    const creditAccountId = resourceIdSchema.parse(id);
    const data = adjustCreditSchema.parse(await readBusinessJsonBody(request));
    const result = await adjustCredit({
      id: creditAccountId,
      data,
      actorUserId: actor.userId,
      request,
    });
    return NextResponse.json(result, {
      status: result.idempotent ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
