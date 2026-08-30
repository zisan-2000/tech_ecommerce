import { NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { listBusinessRiskCases } from "@/lib/business-network/fraud";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
export async function GET(request: Request) { try { await requireAnyBusinessNetworkAdminPermission(["business.audit.view"]); return NextResponse.json(await listBusinessRiskCases(new URL(request.url)), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return businessApiErrorResponse(error); } }
