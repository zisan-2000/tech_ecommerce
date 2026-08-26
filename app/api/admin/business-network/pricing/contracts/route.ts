import { NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission, requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { createContractPrice, listContractPrices } from "@/lib/business-network/pricing";
import { adminListSchema, createContractPriceSchema } from "@/lib/business-network/pricing-schemas";
import { readBusinessJsonBody } from "@/lib/business-network/request";

export async function GET(request: Request) {
  try {
    await requireAnyBusinessNetworkAdminPermission(["business.pricing.view", "business.pricing.manage"]);
    const url = new URL(request.url);
    const query = adminListSchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
    });
    const businessAccountId = url.searchParams.get("businessAccountId")?.trim().slice(0, 64) || null;
    const result = await listContractPrices({ ...query, businessAccountId });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireBusinessNetworkAdminPermission("business.pricing.manage");
    const data = createContractPriceSchema.parse(await readBusinessJsonBody(request));
    const contract = await createContractPrice({ data, actorUserId: actor.userId, request });
    return NextResponse.json({ contract }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
