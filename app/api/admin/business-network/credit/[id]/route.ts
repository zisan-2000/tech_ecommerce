import { NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { getCreditAccount } from "@/lib/business-network/credit";
import { creditLedgerListSchema } from "@/lib/business-network/credit-schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAnyBusinessNetworkAdminPermission(["business.credit.view", "business.credit.manage"]);
    const { id } = await params;
    const creditAccountId = resourceIdSchema.parse(id);
    const url = new URL(request.url);
    const query = creditLedgerListSchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const result = await getCreditAccount(creditAccountId, query.page, query.limit);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
