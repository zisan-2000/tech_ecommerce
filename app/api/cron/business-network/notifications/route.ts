import { NextResponse } from "next/server";
import { isAuthorizedBusinessCron } from "@/lib/business-network/cron-authorization";
import { processBusinessNotificationOutbox } from "@/lib/business-network/notification-delivery";

export async function GET(request: Request) {
  if (!isAuthorizedBusinessCron(request)) return NextResponse.json({ error: "Unauthorized cron request" }, { status: 401 });
  try {
    const requested = Number(new URL(request.url).searchParams.get("limit") || "25");
    const limit = Number.isInteger(requested) ? requested : 25;
    return NextResponse.json({ ok: true, ...(await processBusinessNotificationOutbox({ limit })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Business notification outbox job failed", error);
    return NextResponse.json({ error: "Business notification job failed." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
