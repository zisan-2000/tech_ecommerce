import { NextResponse } from "next/server";
import { requireBusinessPermission } from "@/lib/business-network/authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { getOrganizationPortalData } from "@/lib/business-portal/portal-read";

export async function GET() {
  try {
    const context = await requireBusinessPermission("organization.documents.read");
    return NextResponse.json(await getOrganizationPortalData(context, "documents"), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return businessApiErrorResponse(error); }
}
