import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getDashboardRoute,
  sanitizeReturnUrl,
  USER_DASHBOARD_ROUTE,
} from "@/lib/dashboard-route";
import {
  getBusinessContext,
  isPortalAccessibleOrganizationStatus,
} from "@/lib/business-network/context";

type PostLoginSearchParams = {
  returnUrl?: string | string[];
  callbackUrl?: string | string[];
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PostLoginPage({
  searchParams,
}: {
  searchParams: Promise<PostLoginSearchParams>;
}) {
  const params = await searchParams;
  const requestedReturnUrl =
    firstValue(params.returnUrl) || firstValue(params.callbackUrl) || null;
  const safeReturnUrl = sanitizeReturnUrl(requestedReturnUrl);

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    const signInUrl = safeReturnUrl
      ? `/signin?returnUrl=${encodeURIComponent(safeReturnUrl)}`
      : "/signin";
    redirect(signInUrl);
  }

  // Explicit internal return destinations, such as a secure business
  // invitation, always take priority over default dashboard routing.
  if (safeReturnUrl) {
    redirect(safeReturnUrl);
  }

  const defaultRoute = getDashboardRoute(session.user);

  // Preserve dedicated dashboards for privileged/global account types.
  if (defaultRoute !== USER_DASHBOARD_ROUTE) {
    redirect(defaultRoute);
  }

  let businessPortalRoute: string | null = null;
  try {
    const businessContext = await getBusinessContext();
    const activeMembership = businessContext.activeMembership;
    if (
      activeMembership &&
      isPortalAccessibleOrganizationStatus(activeMembership.organization.status)
    ) {
      businessPortalRoute = "/business";
    }
  } catch {
    // A business-context lookup must never break a successful login.
    // Users without an available business context fall back to the normal
    // ecommerce dashboard below.
  }

  redirect(businessPortalRoute || USER_DASHBOARD_ROUTE);
}
