import { NextResponse } from "next/server";
import { requireBusinessPermission } from "@/lib/business-network/authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { disablePortalPartnerAsset, updatePortalPartnerAsset } from "@/lib/business-network/partner-referral";
import { updatePartnerAssetSchema } from "@/lib/business-network/partner-referral-schemas";
import { assertSameOriginBusinessMutation, readBusinessJsonBody } from "@/lib/business-network/request";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext): Promise<Response> {
  try {
    assertSameOriginBusinessMutation(request);
    const context = await requireBusinessPermission("partner.assets.manage");
    const data = updatePartnerAssetSchema.parse(await readBusinessJsonBody(request));
    const asset = await updatePortalPartnerAsset({ id: (await params).id, context, data, request });
    return NextResponse.json({ asset }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext): Promise<Response> {
  try {
    assertSameOriginBusinessMutation(request);
    const context = await requireBusinessPermission("partner.assets.manage");
    const asset = await disablePortalPartnerAsset({ id: (await params).id, context, request });
    return NextResponse.json({ asset }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

