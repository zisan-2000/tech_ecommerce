import { NextResponse } from "next/server";
import { requireSearchAdmin } from "@/lib/search/admin-access";
import { enqueueFullSearchReindex } from "@/lib/search/index-worker";

export async function POST() {
  const auth = await requireSearchAdmin(false);
  if (auth.response) return auth.response;
  try {
    const queued = await enqueueFullSearchReindex();
    return NextResponse.json({ ok: true, queued });
  } catch (error) {
    console.error("Full search reindex enqueue failed", error);
    return NextResponse.json({ error: "Search reindex could not be queued." }, { status: 500 });
  }
}
