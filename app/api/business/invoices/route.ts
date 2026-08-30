import { NextResponse } from "next/server";
import { requireBusinessPermission } from "@/lib/business-network/authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { listPortalInvoices } from "@/lib/business-portal/portal-read";
import { portalListQuery } from "@/lib/business-portal/query";

export async function GET(request: Request) {
  try {
    const context = await requireBusinessPermission("invoice.read");
    return NextResponse.json(await listPortalInvoices(context, portalListQuery(request)), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return businessApiErrorResponse(error); }
}

