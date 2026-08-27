import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { createPartnerAgreementVersion } from "@/lib/business-network/partner";
import { createPartnerAgreementVersionSchema } from "@/lib/business-network/partner-schemas";
import { assertSameOriginBusinessMutation, readBusinessJsonBody } from "@/lib/business-network/request";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    assertSameOriginBusinessMutation(request);
    const actor = await requireBusinessNetworkAdminPermission("partner.agreement.manage");
    const { id } = await params;
    const data = createPartnerAgreementVersionSchema.parse(await readBusinessJsonBody(request));
    const agreement = await createPartnerAgreementVersion({
      id: resourceIdSchema.parse(id), data, actorUserId: actor.userId, request,
    });
    return NextResponse.json(
      { agreement },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
