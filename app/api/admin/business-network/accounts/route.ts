import { BusinessAccountStatus } from "@/generated/prisma";
import { NextResponse } from "next/server";
import { requireAnyBusinessNetworkAdminPermission, requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { createBusinessAccount, listBusinessAccounts } from "@/lib/business-network/business-accounts";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { adminListSchema, createBusinessAccountSchema } from "@/lib/business-network/pricing-schemas";
import { readBusinessJsonBody } from "@/lib/business-network/request";

const STATUSES = new Set(Object.values(BusinessAccountStatus));

export async function GET(request: Request) {
  try {
    await requireAnyBusinessNetworkAdminPermission(["business.account.view", "business.account.manage"]);
    const url = new URL(request.url);
    const query = adminListSchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
    });
    const rawStatus = url.searchParams.get("status")?.trim().toUpperCase() ?? "";
    const status = STATUSES.has(rawStatus as BusinessAccountStatus)
      ? (rawStatus as BusinessAccountStatus)
      : null;
    const result = await listBusinessAccounts({ ...query, status });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireBusinessNetworkAdminPermission("business.account.manage");
    const data = createBusinessAccountSchema.parse(await readBusinessJsonBody(request));
    const account = await createBusinessAccount({ data, actorUserId: actor.userId, request });
    return NextResponse.json({ account }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
