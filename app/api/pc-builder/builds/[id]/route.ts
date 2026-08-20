import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  deletePcBuilderSavedBuild,
  getOwnedPcBuilderSavedBuild,
} from "@/lib/pc-builder-saved-build-store";
import { isPcBuilderSavedBuildId } from "@/lib/pc-builder-saved-build";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

type RouteContext = { params: Promise<{ id: string }> };

async function currentUserId() {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function GET(_request: Request, context: RouteContext) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }
  const { id } = await context.params;
  if (!isPcBuilderSavedBuildId(id)) {
    return NextResponse.json({ error: "Saved build not found" }, { status: 404, headers: NO_STORE_HEADERS });
  }
  const build = await getOwnedPcBuilderSavedBuild(userId, id);
  return build
    ? NextResponse.json(build, { headers: NO_STORE_HEADERS })
    : NextResponse.json({ error: "Saved build not found" }, { status: 404, headers: NO_STORE_HEADERS });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }
  const { id } = await context.params;
  const deleted = await deletePcBuilderSavedBuild(userId, id);
  return deleted
    ? NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS })
    : NextResponse.json({ error: "Saved build not found" }, { status: 404, headers: NO_STORE_HEADERS });
}
