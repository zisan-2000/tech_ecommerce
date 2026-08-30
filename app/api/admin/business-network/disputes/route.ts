import { NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { getBusinessGovernance } from "@/lib/business-network/admin-insights";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
export async function GET() { try { await requireAnyBusinessNetworkAdminPermission(["business.account.view", "partner.profile.view"]); return NextResponse.json(await getBusinessGovernance("disputes"), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return businessApiErrorResponse(error); } }
