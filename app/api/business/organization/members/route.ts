import { NextResponse } from "next/server";
import { requireBusinessPermission } from "@/lib/business-network/authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { listOrganizationMembers } from "@/lib/business-network/membership";

export async function GET() {
  try {
    const context = await requireBusinessPermission("organization.members.read");
    const members = await listOrganizationMembers(context);
    return NextResponse.json(
      { members },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
