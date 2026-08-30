import { NextResponse } from "next/server";
import { requireBusinessPermission } from "@/lib/business-network/authorization";
import {
  createPortalPayoutAccount,
  listPortalPayoutAccounts,
} from "@/lib/business-network/settlement";
import {
  createPayoutAccountSchema,
  payoutAccountListSchema,
} from "@/lib/business-network/settlement-schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireBusinessPermission("partner.payout_accounts.read");
    const raw = Object.fromEntries(new URL(request.url).searchParams);
    delete raw.partnerProfileId;
    const query = payoutAccountListSchema.parse(raw);
    return NextResponse.json(await listPortalPayoutAccounts(context, query), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireBusinessPermission("partner.payout_accounts.manage");
    const data = createPayoutAccountSchema.parse(await readBusinessJsonBody(request));
    const payoutAccount = await createPortalPayoutAccount({ context, data, request });
    return NextResponse.json({ payoutAccount }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
