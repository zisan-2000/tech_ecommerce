"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Building2,
  ChevronDown,
  LogOut,
  Menu,
  PanelLeftClose,
  X,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  isPortalNavigationItemVisible,
  PORTAL_NAVIGATION,
} from "@/lib/business-portal/navigation";
import type { PortalContextValue } from "@/lib/business-portal/types";
import { PortalContextProvider } from "./PortalContext";

function matchesPath(pathname: string, href: string) {
  if (href === "/business") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function PortalSidebar({
  context,
  onNavigate,
  compact,
  unreadNotifications,
}: {
  context: PortalContextValue;
  onNavigate?: () => void;
  compact: boolean;
  unreadNotifications: number;
}) {
  const pathname = usePathname();
  const { permissions, activeCapabilities } = context.activeMembership;
  return (
    <aside className="flex h-full flex-col bg-slate-950 text-slate-200 dark:bg-slate-950">
      <div className={cn("flex h-16 items-center border-b border-white/10 px-4", compact ? "justify-center" : "gap-3")}>
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-950/30">
          <Building2 className="size-5" aria-hidden="true" />
        </div>
        {!compact && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">Business Portal</p>
            <p className="truncate text-xs text-slate-400">{context.activeMembership.organization.code}</p>
          </div>
        )}
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5" aria-label="Business portal navigation">
        {PORTAL_NAVIGATION.map((group, groupIndex) => {
          const items = group.items.filter((item) =>
            isPortalNavigationItemVisible({ item, permissions, capabilities: activeCapabilities }),
          );
          if (!items.length) return null;
          return (
            <section key={group.label ?? `primary-${groupIndex}`}>
              {group.label && !compact && (
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {group.label}
                </p>
              )}
              <div className="space-y-1">
                {items.map((item) => {
                  const active = matchesPath(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      title={compact ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex min-h-10 items-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
                        compact ? "justify-center px-2" : "gap-3 px-3",
                        active
                          ? "bg-blue-600 text-white shadow-sm"
                          : "text-slate-300 hover:bg-white/8 hover:text-white",
                      )}
                    >
                      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                      {!compact && <span className="truncate">{item.label}</span>}
                      {item.href === "/business/notifications" && unreadNotifications > 0 && <span className={cn("grid min-w-5 place-items-center rounded-full bg-blue-500 px-1.5 text-[10px] font-bold leading-5 text-white", compact ? "absolute right-1 top-1" : "ml-auto")}>{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <Link
          href="/ecommerce"
          className={cn(
            "flex min-h-10 items-center rounded-lg text-sm font-medium text-slate-300 hover:bg-white/8 hover:text-white",
            compact ? "justify-center px-2" : "gap-3 px-3",
          )}
        >
          <StorefrontIcon />
          {!compact && "Back to storefront"}
        </Link>
      </div>
    </aside>
  );
}

function StorefrontIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-[18px]" aria-hidden="true">
      <path d="M3 9h18l-2-5H5L3 9Z" /><path d="M5 9v11h14V9M9 20v-6h6v6" />
    </svg>
  );
}

export default function PortalShell({
  context,
  children,
}: {
  context: PortalContextValue;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [switching, startSwitch] = useTransition();
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const active = context.activeMembership;
  const orgName = active.organization.displayName || active.organization.legalName;
  const initials = useMemo(
    () => orgName.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase(),
    [orgName],
  );

  useEffect(() => {
    let activeRequest = true;
    const loadUnread = async () => {
      try {
        const response = await fetch("/api/business/notifications?state=unread&limit=1", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (activeRequest && response.ok) setUnreadNotifications(Number(payload?.unread || 0));
      } catch { /* The navigation remains usable while notification status is unavailable. */ }
    };
    const handleChange = () => { void loadUnread(); };
    void loadUnread();
    const interval = window.setInterval(loadUnread, 60_000);
    window.addEventListener("business-notifications-changed", handleChange);
    return () => { activeRequest = false; window.clearInterval(interval); window.removeEventListener("business-notifications-changed", handleChange); };
  }, [active.organization.id]);

  function switchOrganization(organizationId: string) {
    if (organizationId === active.organization.id) return;
    startSwitch(async () => {
      const response = await fetch("/api/business/context/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      if (response.ok) router.refresh();
    });
  }

  return (
    <PortalContextProvider value={context}>
      <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
        <div className={cn("fixed inset-y-0 left-0 z-40 hidden lg:block", compact ? "w-[76px]" : "w-72")}>
          <PortalSidebar context={context} compact={compact} unreadNotifications={unreadNotifications} />
        </div>
        {mobileOpen && (
          <>
            <button className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" />
            <div className="fixed inset-y-0 left-0 z-50 w-[min(88vw,320px)] lg:hidden">
              <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 z-10 rounded-lg p-2 text-slate-300 hover:bg-white/10" aria-label="Close navigation">
                <X className="size-5" />
              </button>
              <PortalSidebar context={context} compact={false} unreadNotifications={unreadNotifications} onNavigate={() => setMobileOpen(false)} />
            </div>
          </>
        )}
        <div className={cn("transition-[padding] duration-200", compact ? "lg:pl-[76px]" : "lg:pl-72")}>
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Button variant="outline" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
                <Menu className="size-5" />
              </Button>
              <Button variant="outline" size="icon" className="hidden lg:inline-flex" onClick={() => setCompact((value) => !value)} aria-label={compact ? "Expand navigation" : "Collapse navigation"}>
                <PanelLeftClose className={cn("size-5 transition-transform", compact && "rotate-180")} />
              </Button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{orgName}</p>
                <p className="truncate text-xs text-muted-foreground">{active.roles.join(" · ")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {context.organizations.length > 1 && (
                <label className="relative hidden sm:block">
                  <span className="sr-only">Switch organization</span>
                  <select
                    className="h-9 max-w-56 appearance-none rounded-md border border-input bg-background py-1 pl-3 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring"
                    value={active.organization.id}
                    disabled={switching}
                    onChange={(event) => switchOrganization(event.target.value)}
                  >
                    {context.organizations.map((membership) => (
                      <option key={membership.organization.id} value={membership.organization.id}>
                        {membership.organization.displayName || membership.organization.legalName}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-2.5 size-4 text-muted-foreground" />
                </label>
              )}
              <ThemeSwitcher />
              <div className="hidden items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 sm:flex">
                <span className="grid size-8 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-200">{initials}</span>
                <span className="max-w-36 truncate text-xs font-medium">{context.user.email || "Business user"}</span>
              </div>
              <Button variant="outline" size="icon" onClick={() => signOut({ callbackUrl: "/signin" })} aria-label="Sign out">
                <LogOut className="size-4" />
              </Button>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </PortalContextProvider>
  );
}
