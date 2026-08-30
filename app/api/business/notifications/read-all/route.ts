import { NextResponse } from "next/server";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { markAllBusinessNotificationsRead } from "@/lib/business-network/notifications";
import { assertSameOriginBusinessMutation } from "@/lib/business-network/request";

export async function POST(request: Request) {
  try {
    assertSameOriginBusinessMutation(request);
    return NextResponse.json(await markAllBusinessNotificationsRead(request), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

