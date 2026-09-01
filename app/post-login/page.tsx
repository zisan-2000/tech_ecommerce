import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getDashboardRoute,
  sanitizeReturnUrl,
  USER_DASHBOARD_ROUTE,
} from "@/lib/dashboard-route";
import { hasPortalAccessibleBusinessMembership } from "@/lib/business-network/context";

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
  const sessionUser = session?.user;
  const userId = typeof sessionUser?.id === "string" ? sessionUser.id : null;

  if (!sessionUser || !userId) {
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

  const defaultRoute = getDashboardRoute(sessionUser);

  // Preserve dedicated dashboards for privileged/global account types.
  if (defaultRoute !== USER_DASHBOARD_ROUTE) {
    redirect(defaultRoute);
  }

  // Ordinary accounts with an active, portal-accessible Business Network
  // membership always land in the Business Portal. This is a direct database
  // check keyed by the authenticated user ID, so it does not depend on an
  // active-organization cookie or a second session lookup.
  if (await hasPortalAccessibleBusinessMembership(userId)) {
    redirect("/business");
  }

  redirect(USER_DASHBOARD_ROUTE);
}
