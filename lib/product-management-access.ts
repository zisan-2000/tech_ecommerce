import "server-only";

import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import type { PermissionKey } from "@/lib/rbac-config";

export async function requireProductAccess(permissions: PermissionKey[]) {
  const session = await getServerSession(authOptions);
  const access = await getAccessContext(
    session?.user as { id?: string; role?: string } | undefined,
  );
  if (!access.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!access.hasAny(permissions)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export function requireProductManager() {
  return requireProductAccess(["products.manage"]);
}
