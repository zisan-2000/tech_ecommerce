import { NextResponse } from "next/server";
import { requireBusinessPermission, requireOrganizationCapability } from "@/lib/business-network/authorization";
import { validatePortalCredit } from "@/lib/business-network/credit";
import { validateCreditSchema } from "@/lib/business-network/credit-schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";

export async function POST(request: Request) {
  try {
    const context = await requireBusinessPermission("order.create");
    await requireOrganizationCapability("CORPORATE_BUYER", context);
    const data = validateCreditSchema.parse(await readBusinessJsonBody(request));
    const result = await validatePortalCredit({ context, ...data });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
