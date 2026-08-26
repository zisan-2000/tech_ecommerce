import { NextResponse } from "next/server";
import { requireBusinessNetworkAdminPermission } from "@/lib/business-network/admin-authorization";
import { setCreditLimit } from "@/lib/business-network/credit";
import { setCreditLimitSchema } from "@/lib/business-network/credit-schemas";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { readBusinessJsonBody } from "@/lib/business-network/request";
import { resourceIdSchema } from "@/lib/business-network/schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireBusinessNetworkAdminPermission("business.credit.manage");
    const { id } = await params;
    const creditAccountId = resourceIdSchema.parse(id);
    const data = setCreditLimitSchema.parse(await readBusinessJsonBody(request));
    const account = await setCreditLimit({
      id: creditAccountId,
      data,
      actorUserId: actor.userId,
      request,
    });
    return NextResponse.json({ account }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
