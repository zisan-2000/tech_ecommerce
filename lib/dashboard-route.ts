type DashboardUserLike =
  | {
      role?: string | null;
      permissions?: string[] | null;
      defaultAdminRoute?: "/admin" | "/admin/warehouse" | null;
    }
  | null
  | undefined;

export const USER_DASHBOARD_ROUTE = "/ecommerce/user/";
export const DELIVERY_DASHBOARD_ROUTE = "/admin/operations/delivery";
export const SUPPLIER_DASHBOARD_ROUTE = "/supplier";
export const INVESTOR_DASHBOARD_ROUTE = "/investor";
export const ADMIN_QUOTATIONS_ROUTE = "/admin/business-network/quotations";
export const ADMIN_RFQS_ROUTE = "/admin/business-network/rfqs";
export const ADMIN_BUSINESS_NETWORK_ROUTE = "/admin/business-network";
export const ADMIN_USERS_ROUTE = "/admin/operations/users";

const ADMIN_DELIVERY_ROUTE = "/admin/delivery";
const ADMIN_OPERATIONS_DELIVERY_ROUTE = "/admin/operations/delivery";
const ADMIN_PROFILE_ROUTE = "/admin/profile";
const LEGACY_DELIVERY_ENTRY_ROUTE = "/delivery";
const LEGACY_DELIVERY_DASHBOARD_ROUTE = "/delivery/dashboard";

const AUTH_ROUTES = ["/signin", "/sign-up"];

function permissionsFor(user?: DashboardUserLike) {
  return Array.isArray(user?.permissions) ? user.permissions : [];
}

function hasAnyPermission(
  user: DashboardUserLike,
  requiredPermissions: readonly string[],
) {
  const permissions = new Set(permissionsFor(user));
  return requiredPermissions.some((permission) => permissions.has(permission));
}

function isRoutePrefix(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function hasAdminDashboardAccess(user?: DashboardUserLike) {
  return permissionsFor(user).includes("admin.panel.access");
}

export function hasDeliveryDashboardAccess(user?: DashboardUserLike) {
  return permissionsFor(user).includes("delivery.dashboard.access");
}

export function hasSupplierPortalAccess(user?: DashboardUserLike) {
  return permissionsFor(user).includes("supplier.portal.access");
}

export function hasInvestorPortalAccess(user?: DashboardUserLike) {
  return permissionsFor(user).includes("investor.portal.access");
}

export function getAdminLandingRoute(user?: DashboardUserLike) {
  if (!hasAdminDashboardAccess(user)) return null;

  if (user?.defaultAdminRoute === "/admin/warehouse") {
    return "/admin/warehouse";
  }

  if (hasAnyPermission(user, ["dashboard.read"])) {
    return "/admin";
  }

  if (
    hasAnyPermission(user, [
      "business.quotation.view",
      "business.quotation.create",
      "business.quotation.approve",
      "business.quotation.send",
    ])
  ) {
    return ADMIN_QUOTATIONS_ROUTE;
  }

  if (
    hasAnyPermission(user, [
      "business.rfq.view",
      "business.rfq.manage",
      "business.rfq.assign",
    ])
  ) {
    return ADMIN_RFQS_ROUTE;
  }

  if (
    hasAnyPermission(user, [
      "business.account.view",
      "business.account.manage",
      "partner.profile.view",
      "partner.profile.manage",
    ])
  ) {
    return ADMIN_BUSINESS_NETWORK_ROUTE;
  }

  if (hasAnyPermission(user, ["users.read", "users.manage"])) {
    return ADMIN_USERS_ROUTE;
  }

  // A limited admin should never be sent to the analytics dashboard unless
  // they actually have dashboard.read. Profile is a safe admin-shell fallback.
  return ADMIN_PROFILE_ROUTE;
}

export function getDashboardRoute(user?: DashboardUserLike) {
  if (user?.role === "investor") {
    return INVESTOR_DASHBOARD_ROUTE;
  }

  const adminLandingRoute = getAdminLandingRoute(user);
  if (adminLandingRoute) {
    return adminLandingRoute;
  }

  if (hasDeliveryDashboardAccess(user)) {
    return DELIVERY_DASHBOARD_ROUTE;
  }

  if (hasSupplierPortalAccess(user)) {
    return SUPPLIER_DASHBOARD_ROUTE;
  }

  if (hasInvestorPortalAccess(user)) {
    return INVESTOR_DASHBOARD_ROUTE;
  }

  return USER_DASHBOARD_ROUTE;
}

export function isAdminDeliveryRoute(pathname: string) {
  return (
    isRoutePrefix(pathname, ADMIN_DELIVERY_ROUTE) ||
    isRoutePrefix(pathname, ADMIN_OPERATIONS_DELIVERY_ROUTE)
  );
}

export function isLegacyDeliveryDashboardRoute(pathname: string) {
  return (
    pathname === LEGACY_DELIVERY_ENTRY_ROUTE ||
    isRoutePrefix(pathname, LEGACY_DELIVERY_DASHBOARD_ROUTE)
  );
}

export function isDeliveryAdminShellRoute(pathname: string) {
  return (
    isAdminDeliveryRoute(pathname) ||
    isRoutePrefix(pathname, ADMIN_PROFILE_ROUTE)
  );
}

export function sanitizeReturnUrl(returnUrl?: string | null) {
  const value = String(returnUrl || "").trim();
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  const pathOnly = value.split("?")[0]?.split("#")[0] || value;
  if (AUTH_ROUTES.includes(pathOnly)) {
    return null;
  }

  return value;
}

export function resolvePostAuthRoute(
  user?: DashboardUserLike,
  returnUrl?: string | null,
) {
  return sanitizeReturnUrl(returnUrl) ?? getDashboardRoute(user);
}
