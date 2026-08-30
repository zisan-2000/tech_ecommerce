import { NextResponse } from "next/server";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { markBusinessNotificationRead } from "@/lib/business-network/notifications";
import { assertSameOriginBusinessMutation } from "@/lib/business-network/request";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOriginBusinessMutation(request);
    const { id } = await params;
    return NextResponse.json({ notification: await markBusinessNotificationRead({ notificationId: id.slice(0, 64), request }) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

