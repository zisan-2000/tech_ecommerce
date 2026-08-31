import { NextRequest, NextResponse } from "next/server";
import { evaluateCartReminderNotifications } from "@/lib/cart-reminder-notifications";

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  return bearer === secret || request.headers.get("x-cron-secret") === secret;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized cron request" }, { status: 401 });
  }

  try {
    const result = await evaluateCartReminderNotifications();
    return NextResponse.json({
      ok: true,
      processedAt: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error("Failed to evaluate cart reminders:", error);
    return NextResponse.json(
      { error: "Failed to evaluate cart reminders." },
      { status: 500 },
    );
  }
}
