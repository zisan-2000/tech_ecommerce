import { NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { decideBusinessRiskCase } from "@/lib/business-network/fraud";
import { readBusinessJsonBody } from "@/lib/business-network/request";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAnyBusinessNetworkAdminPermission(["business.account.manage", "partner.profile.manage"]);
    const { id } = await params;
    return NextResponse.json({ riskCase: await decideBusinessRiskCase({ caseId: id.slice(0, 64), actorUserId: actor.userId, body: await readBusinessJsonBody(request), request }) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
