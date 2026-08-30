import { NextResponse } from "next/server";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import {
  getBusinessNotificationPreferences,
  updateBusinessNotificationPreferences,
} from "@/lib/business-network/notifications";
import { readBusinessJsonBody } from "@/lib/business-network/request";

export async function GET() {
  try {
    return NextResponse.json({ preferences: await getBusinessNotificationPreferences() }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    return NextResponse.json({
      preferences: await updateBusinessNotificationPreferences({
        body: await readBusinessJsonBody(request),
        request,
      }),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}
