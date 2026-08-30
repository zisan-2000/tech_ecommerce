import { NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { listBusinessOrders } from "@/lib/business-network/admin-insights";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
export async function GET(request: Request) { try { await requireAnyBusinessNetworkAdminPermission(["business.customer_po.view", "business.account.view"]); return NextResponse.json(await listBusinessOrders(new URL(request.url)), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return businessApiErrorResponse(error); } }
