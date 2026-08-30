import { NextResponse } from "next/server";
import { businessApiErrorResponse } from "@/lib/business-network/errors";
import { listBusinessNotifications } from "@/lib/business-network/notifications";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await listBusinessNotifications(new URL(request.url)), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return businessApiErrorResponse(error);
  }
}

