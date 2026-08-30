import { NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { verifyBusinessAuditLogIntegrity } from "@/lib/business-network/audit-integrity";
import { BusinessNetworkError, businessApiErrorResponse } from "@/lib/business-network/errors";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAnyBusinessNetworkAdminPermission(["business.audit.view"]);
    const { id } = await params;
    if (!/^\d{1,20}$/.test(id)) throw new BusinessNetworkError(422, "INVALID_AUDIT_ID", "Audit ID is invalid.");
    return NextResponse.json({ integrity: await verifyBusinessAuditLogIntegrity(BigInt(id)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

