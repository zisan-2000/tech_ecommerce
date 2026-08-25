import "server-only";

import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";

export async function requireSearchAdmin(readOnly = false) {
  const session = await getServerSession(authOptions);
  const access = await getAccessContext(
    session?.user as { id?: string; role?: string } | undefined,
  );
  if (!access.userId) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      access: null,
    };
  }
  const allowed = readOnly
    ? access.hasAny(["settings.manage", "products.manage", "reports.read"])
    : access.hasAny(["settings.manage", "products.manage"]);
  if (!allowed) {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      access: null,
    };
  }
  return { response: null, access };
}
