import { NextRequest, NextResponse } from "next/server";
import { processSearchIndexOutbox } from "@/lib/search/index-worker";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${secret}` || request.headers.get("x-cron-secret") === secret;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized cron request" }, { status: 401 });
  }
  const result = await processSearchIndexOutbox();
  return NextResponse.json(result, { status: result.failed ? 503 : 200 });
}
