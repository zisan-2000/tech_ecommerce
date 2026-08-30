import { NextResponse } from "next/server";
import { isAuthorizedBusinessCron } from "@/lib/business-network/cron-authorization";
import { runBusinessFraudScan } from "@/lib/business-network/fraud";

export async function GET(request: Request) {
  if (!isAuthorizedBusinessCron(request)) return NextResponse.json({ error: "Unauthorized cron request" }, { status: 401 });
  try {
    const requested = Number(new URL(request.url).searchParams.get("maxCases") || "100");
    const maxCases = Number.isInteger(requested) ? requested : 100;
    return NextResponse.json({ ok: true, ...(await runBusinessFraudScan({ maxCases })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Business fraud scan job failed", error);
    return NextResponse.json({ error: "Business fraud scan failed." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
