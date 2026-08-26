import { NextResponse } from "next/server";
import { requireBusinessPermission, requireOrganizationCapability } from "@/lib/business-network/authorization";
import { getPortalCredit } from "@/lib/business-network/credit";
import { businessApiErrorResponse } from "@/lib/business-network/errors";

export async function GET() {
  try {
    const context = await requireBusinessPermission("credit.read");
    await requireOrganizationCapability("CORPORATE_BUYER", context);
    const account = await getPortalCredit(context);
    return NextResponse.json({ account }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
