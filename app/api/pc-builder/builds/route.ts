import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  listPcBuilderSavedBuilds,
  PcBuilderSavedBuildError,
  savePcBuilderBuild,
} from "@/lib/pc-builder-saved-build-store";
import { rateLimitRequest } from "@/lib/request-security";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

async function currentUserId() {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }
  const builds = await listPcBuilderSavedBuilds(userId);
  return NextResponse.json({ builds }, { headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const rateLimit = await rateLimitRequest(request, {
      scope: "pc-builder-save",
      limit: 30,
      windowMs: 60 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many saved-build requests. Please try again later." },
        { status: 429, headers: { ...NO_STORE_HEADERS, "Retry-After": String(rateLimit.retryAfter) } },
      );
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 4096) {
      return NextResponse.json({ error: "Request is too large" }, { status: 413, headers: NO_STORE_HEADERS });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
    const source = body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
    const mode = source.mode === "share" ? "share" : "save";
    const result = await savePcBuilderBuild({
      userId,
      name: source.name,
      selections: source.selections,
      mode,
    });
    return NextResponse.json(result, { status: 201, headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof PcBuilderSavedBuildError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: NO_STORE_HEADERS },
      );
    }
    console.error("PC Builder save failed", error);
    return NextResponse.json(
      { error: "The PC build could not be saved safely" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
