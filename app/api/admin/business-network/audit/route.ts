import { NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { listBusinessAuditLogs } from "@/lib/business-network/admin-insights";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
export async function GET(request: Request) { try { await requireAnyBusinessNetworkAdminPermission(["business.audit.view"]); return NextResponse.json(await listBusinessAuditLogs(new URL(request.url)), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return businessApiErrorResponse(error); } }
