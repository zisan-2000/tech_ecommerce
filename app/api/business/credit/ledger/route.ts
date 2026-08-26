import { NextResponse } from "next/server";
import { requireBusinessPermission, requireOrganizationCapability } from "@/lib/business-network/authorization";
import { getPortalCreditLedger } from "@/lib/business-network/credit";
import { creditLedgerListSchema } from "@/lib/business-network/credit-schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";

export async function GET(request: Request) {
  try {
    const context = await requireBusinessPermission("credit.read");
    await requireOrganizationCapability("CORPORATE_BUYER", context);
    const url = new URL(request.url);
    const query = creditLedgerListSchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const result = await getPortalCreditLedger(context, query.page, query.limit);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
