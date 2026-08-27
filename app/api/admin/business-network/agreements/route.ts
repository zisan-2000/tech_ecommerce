import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { createPartnerAgreement, listPartnerAgreements } from "@/lib/business-network/partner";
import { createPartnerAgreementSchema, partnerAgreementListSchema } from "@/lib/business-network/partner-schemas";
import { assertSameOriginBusinessMutation, readBusinessJsonBody } from "@/lib/business-network/request";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireBusinessNetworkAdminPermission("partner.agreement.view");
    const url = new URL(request.url);
    const query = partnerAgreementListSchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      partnerProfileId: url.searchParams.get("partnerProfileId") ?? undefined,
    });
    const result = await listPartnerAgreements(query);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOriginBusinessMutation(request);
    const actor = await requireBusinessNetworkAdminPermission("partner.agreement.manage");
    const data = createPartnerAgreementSchema.parse(await readBusinessJsonBody(request));
    const agreement = await createPartnerAgreement({ data, actorUserId: actor.userId, request });
    return NextResponse.json(
      { agreement },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
