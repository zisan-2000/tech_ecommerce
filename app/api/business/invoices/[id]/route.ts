import { NextResponse } from "next/server";
import { requireBusinessPermission } from "@/lib/business-network/authorization";
import { BusinessNetworkError, businessApiErrorResponse } from "@/lib/business-network/errors";
import { getPortalInvoice } from "@/lib/business-portal/portal-read";

export async function GET(_request: Request, { params }: RouteContext<"/api/business/invoices/[id]">) {
  try {
    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) throw new BusinessNetworkError(422, "INVALID_INVOICE_ID", "Invoice ID is invalid.");
    const context = await requireBusinessPermission("invoice.read");
    return NextResponse.json({ invoice: await getPortalInvoice(context, id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return businessApiErrorResponse(error); }
}

