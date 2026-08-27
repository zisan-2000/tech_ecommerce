import { NextResponse } from "next/server";
import { requireBusinessPermission } from "@/lib/business-network/authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { createPortalPartnerAsset, listPortalPartnerAssets } from "@/lib/business-network/partner-referral";
import { createPartnerAssetSchema, partnerAssetListSchema } from "@/lib/business-network/partner-referral-schemas";
import { assertSameOriginBusinessMutation, readBusinessJsonBody } from "@/lib/business-network/request";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireBusinessPermission("partner.assets.read");
    const url = new URL(request.url);
    const query = partnerAssetListSchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
    });
    return NextResponse.json(await listPortalPartnerAssets(context, query), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOriginBusinessMutation(request);
    const context = await requireBusinessPermission("partner.assets.manage");
    const data = createPartnerAssetSchema.parse(await readBusinessJsonBody(request));
    const asset = await createPortalPartnerAsset({ context, data, request });
    return NextResponse.json({ asset }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

