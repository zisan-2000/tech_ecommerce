import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanupExpiredInventoryReservations } from "@/lib/inventory";

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
    const result = await prisma.$transaction((tx) =>
      cleanupExpiredInventoryReservations({ tx, batchSize: 100 }),
    );
    return NextResponse.json({
      ok: true,
      processedAt: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error("Failed to release expired inventory reservations:", error);
    return NextResponse.json(
      { error: "Failed to release expired inventory reservations" },
      { status: 500 },
    );
  }
}

