import "server-only";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import type { PermissionKey } from "@/lib/rbac-config";
import { BusinessNetworkError } from "./business-error";

export async function requireBusinessNetworkAdminPermission(
  permission: PermissionKey,
) {
  return requireAnyBusinessNetworkAdminPermission([permission]);
}

export async function requireAnyBusinessNetworkAdminPermission(
  permissions: readonly PermissionKey[],
) {
  const session = await getServerSession(authOptions);
  const access = await getAccessContext(
    session?.user as { id?: string; role?: string } | undefined,
  );
  if (!access.userId) {
    throw new BusinessNetworkError(401, "UNAUTHENTICATED", "Authentication is required.");
  }
  if (!permissions.some((permission) => access.hasGlobal(permission))) {
    throw new BusinessNetworkError(
      403,
      "BUSINESS_ADMIN_PERMISSION_DENIED",
      "You do not have permission to perform this business administration action.",
    );
  }
  return { userId: access.userId, access };
}
