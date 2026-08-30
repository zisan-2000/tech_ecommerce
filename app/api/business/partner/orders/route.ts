import { NextResponse } from "next/server";
import { requireBusinessPermission } from "@/lib/business-network/authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { listPortalReferredOrders } from "@/lib/business-portal/portal-read";
import { portalListQuery } from "@/lib/business-portal/query";

export async function GET(request: Request) {
  try {
    const context = await requireBusinessPermission("partner.orders.read");
    return NextResponse.json(await listPortalReferredOrders(context, portalListQuery(request)), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return businessApiErrorResponse(error); }
}

