import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import {
  createPartnerSettlement,
  listAdminSettlements,
} from "@/lib/business-network/settlement";
import {
  createSettlementSchema,
  settlementListSchema,
} from "@/lib/business-network/settlement-schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireBusinessNetworkAdminPermission("partner.settlement.view");
    const query = settlementListSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json(await listAdminSettlements(query), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireBusinessNetworkAdminPermission("partner.settlement.create");
    const data = createSettlementSchema.parse(await readBusinessJsonBody(request));
    const settlement = await createPartnerSettlement({ data, actorUserId: actor.userId, request });
    return NextResponse.json({ settlement }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
