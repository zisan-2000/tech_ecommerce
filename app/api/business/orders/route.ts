import { NextResponse } from "next/server";
import { requireBusinessPermission } from "@/lib/business-network/authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { listPortalOrders } from "@/lib/business-portal/portal-read";
import { portalListQuery } from "@/lib/business-portal/query";

export async function GET(request: Request) {
  try {
    const context = await requireBusinessPermission("order.read");
    return NextResponse.json(await listPortalOrders(context, portalListQuery(request)), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return businessApiErrorResponse(error); }
}

