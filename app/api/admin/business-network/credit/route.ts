import { NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { listCreditAccounts } from "@/lib/business-network/credit";
import { creditListSchema } from "@/lib/business-network/credit-schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";

export async function GET(request: Request) {
  try {
    await requireAnyBusinessNetworkAdminPermission(["business.credit.view", "business.credit.manage"]);
    const url = new URL(request.url);
    const query = creditListSchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      active: url.searchParams.get("active") ?? undefined,
    });
    const result = await listCreditAccounts({
      ...query,
      active: query.active === undefined ? undefined : query.active === "true",
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
