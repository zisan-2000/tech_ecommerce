"use client";

import { SidebarProvider, useSidebar } from "@/providers/sidebar-provider";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import Sidebar from "@/components/admin/Sidebar";
import Header from "@/components/admin/Header";
import {
  getDashboardRoute,
  isDeliveryAdminShellRoute,
} from "@/lib/dashboard-route";

function AdminLoadingShell() {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden lg:block lg:w-60 bg-card border-r border-border">
        <div className="p-6 space-y-6">
          <div className="h-10 bg-muted rounded-lg animate-pulse" />
          <div className="space-y-2">
            {[...Array(8)].map((_, index) => (
              <div key={index} className="flex items-center gap-3 p-3">
                <div className="h-5 w-5 bg-muted rounded animate-pulse" />
                <div className="h-4 bg-muted rounded flex-1 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-16 bg-card border-b border-border px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-8 w-8 bg-muted rounded animate-pulse" />
            <div className="h-6 bg-muted rounded w-32 animate-pulse" />
          </div>
          <div className="flex items-center gap-4">
            <div className="h-8 w-8 bg-muted rounded-full animate-pulse" />
            <div className="h-8 w-8 bg-muted rounded-full animate-pulse" />
            <div className="h-8 w-20 bg-muted rounded-full animate-pulse" />
          </div>
        </div>

        <div className="flex-1 p-6">
          <div className="mx-auto space-y-6">
            <div className="space-y-2">
              <div className="h-8 bg-muted rounded w-64 animate-pulse" />
              <div className="h-4 bg-muted rounded w-96 animate-pulse" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="bg-card border border-border rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-8 w-8 bg-muted rounded-lg animate-pulse" />
                    <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                  </div>
                  <div className="h-6 bg-muted rounded w-24 animate-pulse mb-2" />
                  <div className="h-4 bg-muted rounded w-32 animate-pulse" />
                </div>
              ))}
            </div>
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="h-6 bg-muted rounded w-48 animate-pulse mb-4" />
              <div className="space-y-3">
                {[...Array(5)].map((_, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 bg-muted rounded-full animate-pulse" />
                      <div className="space-y-1">
                        <div className="h-4 bg-muted rounded w-32 animate-pulse" />
                        <div className="h-3 bg-muted rounded w-24 animate-pulse" />
                      </div>
                    </div>
                    <div className="h-4 bg-muted rounded w-20 animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const { openMobile, toggleSidebar, setOpenMobile } = useSidebar();
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const permissionKeys = Array.isArray((session?.user as any)?.permissions)
    ? (((session?.user as any).permissions as string[]) ?? [])
    : [];
  const hasAdminPanelAccess = permissionKeys.includes("admin.panel.access");
  const hasDashboardRead = permissionKeys.includes("dashboard.read");
  const hasReportsRead = permissionKeys.includes("reports.read");
  const hasDeliveryDashboardAccess = permissionKeys.includes(
    "delivery.dashboard.access",
  );
  const canUseAdminLayout =
    hasAdminPanelAccess ||
    (hasDeliveryDashboardAccess && isDeliveryAdminShellRoute(pathname));
  const dashboardRoute = getDashboardRoute(
    (session?.user ?? null) as {
      role?: string | null;
      permissions?: string[];
      defaultAdminRoute?: "/admin" | "/admin/warehouse";
    } | null,
  );
  const shouldRedirectAdminRoot =
    status === "authenticated" &&
    pathname === "/admin" &&
    dashboardRoute !== "/admin" &&
    hasAdminPanelAccess;

  const limitedOverviewClass = !hasDashboardRead
    ? hasReportsRead
      ? "rbac-hide-dashboard-links"
      : "rbac-hide-overview-section"
    : "";

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/signin");
    } else if (status === "authenticated" && !canUseAdminLayout) {
      router.replace(dashboardRoute);
    } else if (shouldRedirectAdminRoot) {
      router.replace(dashboardRoute);
    }
  }, [
    canUseAdminLayout,
    dashboardRoute,
    pathname,
    router,
    shouldRedirectAdminRoot,
    status,
  ]);

  // Do not mount an unauthorized admin child while navigation is in flight.
  // This prevents pages such as /admin from firing API calls the role cannot use.
  if (
    status === "loading" ||
    status === "unauthenticated" ||
    (status === "authenticated" && (!canUseAdminLayout || shouldRedirectAdminRoot))
  ) {
    return <AdminLoadingShell />;
  }

  return (
    <div className="flex min-h-screen bg-background relative">
      <style>{`
        .rbac-hide-dashboard-links a[href="/admin"],
        .rbac-hide-dashboard-links a[href="/admin/analytics"] {
          display: none !important;
        }

        .rbac-hide-overview-section nav > div:first-child {
          display: none !important;
        }
      `}</style>

      {openMobile && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 lg:hidden transition-opacity duration-300"
          onClick={() => setOpenMobile(false)}
        />
      )}

      <div className={`fixed inset-y-0 left-0 transform ${openMobile ? "translate-x-0" : "-translate-x-full"} transition-transform duration-300 ease-in-out z-30 lg:hidden ${limitedOverviewClass}`}>
        <Sidebar isMobile onClose={() => setOpenMobile(false)} />
      </div>

      <div className={`hidden lg:block lg:w-60 ${limitedOverviewClass}`}>
        <Sidebar />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden lg:ml-0">
        <Header onMenuClick={toggleSidebar} />
        <main className="flex-1 overflow-y-auto bg-background">
          <div>{children}</div>
        </main>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </SidebarProvider>
  );
}
