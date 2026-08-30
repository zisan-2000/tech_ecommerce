import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { payoutAccountListSchema } from "@/lib/business-network/settlement-schemas";
import { listAdminPayoutAccounts } from "@/lib/business-network/settlement";
export async function GET(request: Request) { try { await requireBusinessNetworkAdminPermission("partner.payout_account.view"); const query = payoutAccountListSchema.parse(Object.fromEntries(new URL(request.url).searchParams)); return NextResponse.json(await listAdminPayoutAccounts(query), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return businessApiErrorResponse(error); } }
