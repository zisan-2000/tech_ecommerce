"use client";

import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Menu,
  Home,
  LogOut,
  LayoutDashboard,
  Moon,
  Sun,
  Check,
  Bell,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isDarkLikeTheme } from "@/lib/theme";
import Image from "next/image";

const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

type ScmNotificationPreview = {
  id: number;
  type: string;
  title: string;
  href: string;
  readAt: string | null;
};

type ScmNotificationsResponse = {
  unreadCount: number;
  rows: ScmNotificationPreview[];
};

type InvestorNotificationPreview = {
  id: number;
  type: string;
  title: string;
  message: string;
  targetUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

type InvestorNotificationsResponse = {
  unreadCount: number;
  rows: InvestorNotificationPreview[];
};

export default function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const { data: session } = useSession();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [isPending, setIsPending] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [siteSettings, setSiteSettings] = useState<any>(null);
  const [loadingSite, setLoadingSite] = useState(true);
  const [scmNotifications, setScmNotifications] =
    useState<ScmNotificationsResponse | null>(null);
  const [investorNotifications, setInvestorNotifications] =
    useState<InvestorNotificationsResponse | null>(null);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch site settings
  useEffect(() => {
    const fetchSiteSettings = async () => {
      try {
        const response = await fetch("/api/site");
        const data = await response.json();
        setSiteSettings(data);
      } catch (error) {
        console.error("Failed to fetch site settings:", error);
      } finally {
        setLoadingSite(false);
      }
    };

    fetchSiteSettings();
  }, []);

  const permissionKeys = Array.isArray((session?.user as any)?.permissions)
    ? (((session?.user as any).permissions as string[]) ?? [])
    : [];
  const canViewScmNotifications = permissionKeys.includes("scm.access");
  const canViewInvestorNotifications = permissionKeys.includes(
    "investor.notifications.read",
  );
  const canViewAnyAdminNotifications =
    canViewScmNotifications || canViewInvestorNotifications;

  useEffect(() => {
    if (!canViewAnyAdminNotifications) {
      setScmNotifications(null);
      setInvestorNotifications(null);
      return;
    }

    let active = true;
    const scmController = new AbortController();
    const investorController = new AbortController();

    const fetchNotifications = async () => {
      try {
        setLoadingNotifications(true);
        const requests: Promise<void>[] = [];

        if (canViewScmNotifications) {
          requests.push(
            fetch("/api/scm/notifications?limit=5", {
              cache: "no-store",
              signal: scmController.signal,
            })
              .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (!response.ok) {
                  throw new Error(
                    payload?.error || "Failed to load SCM notifications.",
                  );
                }
                if (active) {
                  setScmNotifications(payload as ScmNotificationsResponse);
                }
              })
              .catch((error: any) => {
                if (active && error?.name !== "AbortError") {
                  console.error("Failed to load SCM notification preview:", error);
                }
              }),
          );
        } else if (active) {
          setScmNotifications(null);
        }

        if (canViewInvestorNotifications) {
          requests.push(
            fetch("/api/admin/investor-notifications?limit=5", {
              cache: "no-store",
              signal: investorController.signal,
            })
              .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (!response.ok) {
                  throw new Error(
                    payload?.error || "Failed to load investor notifications.",
                  );
                }
                if (active) {
                  setInvestorNotifications(payload as InvestorNotificationsResponse);
                }
              })
              .catch((error: any) => {
                if (active && error?.name !== "AbortError") {
                  console.error(
                    "Failed to load investor notification preview:",
                    error,
                  );
                }
              }),
          );
        } else if (active) {
          setInvestorNotifications(null);
        }

        await Promise.all(requests);
      } finally {
        if (active) {
          setLoadingNotifications(false);
        }
      }
    };

    void fetchNotifications();
    const interval = window.setInterval(() => {
      void fetchNotifications();
    }, 60000);

    return () => {
      active = false;
      scmController.abort();
      investorController.abort();
      window.clearInterval(interval);
    };
  }, [
    canViewAnyAdminNotifications,
    canViewInvestorNotifications,
    canViewScmNotifications,
  ]);

  const handleLogout = async () => {
    setIsPending(true);
    try {
      await signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      setIsPending(false);
    }
  };

  const activeTheme =
    theme === "dark" || resolvedTheme === "dark" ? "dark" : "light";
  const darkLikeActiveTheme = isDarkLikeTheme(activeTheme);

  const userName = (session?.user as any)?.name || "User";
  const userRole =
    Array.isArray((session?.user as any)?.roleNames) &&
    ((session?.user as any).roleNames as string[]).length > 0
      ? ((session?.user as any).roleNames as string[]).join(", ")
      : (session?.user as any)?.role || "admin";

  const scmUnreadNotificationCount = scmNotifications?.unreadCount ?? 0;
  const investorUnreadNotificationCount = investorNotifications?.unreadCount ?? 0;
  const unreadNotificationCount =
    scmUnreadNotificationCount + investorUnreadNotificationCount;

  const scmUnreadPreviewRows = useMemo(
    () => (scmNotifications?.rows || []).filter((row) => !row.readAt).slice(0, 4),
    [scmNotifications],
  );
  const scmRecentPreviewRows = useMemo(
    () => (scmNotifications?.rows || []).filter((row) => Boolean(row.readAt)).slice(0, 3),
    [scmNotifications],
  );
  const investorUnreadPreviewRows = useMemo(
    () =>
      (investorNotifications?.rows || [])
        .filter((row) => !row.readAt)
        .slice(0, 4),
    [investorNotifications],
  );
  const investorRecentPreviewRows = useMemo(
    () =>
      (investorNotifications?.rows || [])
        .filter((row) => Boolean(row.readAt))
        .slice(0, 3),
    [investorNotifications],
  );

  return (
    <header className="w-full h-20 bg-background border-border border-b flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20 shadow-sm">
      {/* Mobile menu toggle */}
      <button
        className="lg:hidden bg-muted hover:bg-primary/80 transition-all duration-300 hover:scale-105"
        onClick={onMenuClick}
        aria-label="Toggle Menu"
      >
        <Menu className="w-5 h-5 text-foreground" />
      </button>

      {/* Logo and Title */}
      <div className="flex items-center space-x-3">
        <div className="flex flex-col">
          <h1 className="text-lg font-bold text-foreground hidden sm:block">
            {loadingSite ? (
              <div className="h-5 w-24 bg-gray-200 rounded animate-pulse"></div>
            ) : siteSettings?.siteTitle ? (
              siteSettings.siteTitle + " Admin"
            ) : (
              "BOED Admin"
            )}
          </h1>
          <h1 className="text-lg font-bold text-foreground sm:hidden">
            {loadingSite ? (
              <div className="h-5 w-16 bg-gray-200 rounded animate-pulse"></div>
            ) : (
              siteSettings?.siteTitle?.split(" ")[0] || "Admin"
            )}
          </h1>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        {/* Theme Toggle */}
        {mounted && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full bg-primary hover:bg-primary/80 text-foreground"
                title="Select theme"
              >
                {darkLikeActiveTheme ? (
                  <Sun className="h-5 w-5" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {THEME_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => setTheme(option.value)}
                  className="flex items-center hover:bg-primary/80 justify-between"
                >
                  <span>{option.label}</span>
                  {activeTheme === option.value ? (
                    <Check className="h-4 w-4" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {canViewAnyAdminNotifications ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative rounded-full bg-muted hover:bg-primary/80 text-foreground"
                title="Admin notifications"
              >
                <Bell className="h-5 w-5" />
                {unreadNotificationCount > 0 ? (
                  <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-destructive px-1 text-[10px] font-semibold leading-5 text-destructive-foreground">
                    {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                  </span>
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <div className="flex items-center justify-between px-2 py-1.5">
                <div>
                  <p className="text-sm font-semibold">Admin Notifications</p>
                  <p className="text-xs text-muted-foreground">
                    {loadingNotifications
                      ? "Loading..."
                      : `${unreadNotificationCount} unread`}
                  </p>
                </div>
              </div>
              <div className="max-h-80 space-y-1 overflow-y-auto px-1 py-1">
                {!canViewScmNotifications &&
                !canViewInvestorNotifications ? (
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    No admin notifications.
                  </div>
                ) : (
                  <>
                    {canViewScmNotifications ? (
                      <div className="border-b border-border/60 pb-2 last:border-b-0">
                        <div className="flex items-center justify-between px-2 pb-1 pt-1">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            SCM
                          </div>
                          <Link
                            href="/admin/scm/notifications"
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            View all
                          </Link>
                        </div>
                        {(!scmNotifications || scmNotifications.rows.length === 0) ? (
                          <div className="px-2 py-2 text-sm text-muted-foreground">
                            No SCM notifications.
                          </div>
                        ) : (
                          <>
                            {scmUnreadPreviewRows.map((row) => (
                              <DropdownMenuItem key={`scm-${row.type}-${row.id}`} asChild>
                                <Link
                                  href={row.href}
                                  className="flex flex-col items-start gap-1 whitespace-normal rounded-md px-2 py-2"
                                >
                                  <div className="flex w-full items-start justify-between gap-2">
                                    <span className="text-sm font-medium leading-tight">
                                      {row.title}
                                    </span>
                                    {!row.readAt ? (
                                      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                                    ) : null}
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    {row.type}
                                  </span>
                                </Link>
                              </DropdownMenuItem>
                            ))}
                            {scmRecentPreviewRows.map((row) => (
                              <DropdownMenuItem key={`scm-${row.type}-${row.id}`} asChild>
                                <Link
                                  href={row.href}
                                  className="flex flex-col items-start gap-1 whitespace-normal rounded-md px-2 py-2"
                                >
                                  <div className="flex w-full items-start justify-between gap-2">
                                    <span className="text-sm font-medium leading-tight">
                                      {row.title}
                                    </span>
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    {row.type}
                                  </span>
                                </Link>
                              </DropdownMenuItem>
                            ))}
                          </>
                        )}
                      </div>
                    ) : null}
                    {canViewInvestorNotifications ? (
                      <div className="pt-2">
                        <div className="flex items-center justify-between px-2 pb-1 pt-1">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Investors
                          </div>
                          <Link
                            href="/admin/investors/notifications"
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            View all
                          </Link>
                        </div>
                        {(!investorNotifications ||
                          investorNotifications.rows.length === 0) ? (
                          <div className="px-2 py-2 text-sm text-muted-foreground">
                            No investor notifications.
                          </div>
                        ) : (
                          <>
                            {investorUnreadPreviewRows.map((row) => (
                              <DropdownMenuItem
                                key={`investor-${row.type}-${row.id}`}
                                asChild
                              >
                                <Link
                                  href={row.targetUrl || "/admin/investors/notifications"}
                                  className="flex flex-col items-start gap-1 whitespace-normal rounded-md px-2 py-2"
                                >
                                  <div className="flex w-full items-start justify-between gap-2">
                                    <span className="text-sm font-medium leading-tight">
                                      {row.title}
                                    </span>
                                    {!row.readAt ? (
                                      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                                    ) : null}
                                  </div>
                                  <span className="line-clamp-2 text-xs text-muted-foreground">
                                    {row.message}
                                  </span>
                                </Link>
                              </DropdownMenuItem>
                            ))}
                            {investorRecentPreviewRows.map((row) => (
                              <DropdownMenuItem
                                key={`investor-${row.type}-${row.id}`}
                                asChild
                              >
                                <Link
                                  href={row.targetUrl || "/admin/investors/notifications"}
                                  className="flex flex-col items-start gap-1 whitespace-normal rounded-md px-2 py-2"
                                >
                                  <div className="flex w-full items-start justify-between gap-2">
                                    <span className="text-sm font-medium leading-tight">
                                      {row.title}
                                    </span>
                                  </div>
                                  <span className="line-clamp-2 text-xs text-muted-foreground">
                                    {row.message}
                                  </span>
                                </Link>
                              </DropdownMenuItem>
                            ))}
                          </>
                        )}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {/* View Site Link */}
        <Link
          href="/"
          className="text-sm font-medium transition-all duration-300 hover:scale-105"
          title="View Live Site"
        >
          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:flex bg-muted hover:bg-primary/80 text-foreground border-border hover:border-border rounded-full px-4"
          >
            <Home className="w-4 h-4 mr-2" />
            View Site
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden bg-muted hover:bg-primary/80 text-foreground rounded-full"
          >
            <Home className="w-4 h-4" />
          </Button>
        </Link>

        {/* User Info & Avatar */}
        <div className="hidden md:flex flex-col text-right">
          <p className="text-foreground text-sm font-semibold leading-none">
            {userName}
          </p>
          <p className="text-muted-foreground text-xs leading-none mt-1">
            {userRole}
          </p>
        </div>

        <Link href="/admin/profile" title="View Profile">
          <Avatar className="h-9 w-9 border-2 border-border cursor-pointer hover:opacity-80 transition-all duration-300 hover:scale-105 hover:border-primary">
            <AvatarImage
              src={(session?.user as any)?.image ?? undefined}
              alt={session?.user?.name ?? "Profile"}
            />
            <AvatarFallback className="bg-primary text-primary-foreground font-bold text-sm">
              {(session?.user?.name || "Me")
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>

        {/* Logout Button */}
        <Button
          onClick={handleLogout}
          disabled={isPending}
          className="hidden sm:flex bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold px-6 rounded-full transition-all duration-300 hover:shadow-lg hover:scale-105"
        >
          {isPending ? (
            <div className="animate-spin rounded-full h-4 w-4"></div>
          ) : (
            <>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </>
          )}
        </Button>
        <Button
          onClick={handleLogout}
          disabled={isPending}
          variant="ghost"
          size="icon"
          className="sm:hidden bg-muted hover:bg-primary/80 text-foreground rounded-full"
          title="Logout"
        >
          {isPending ? (
            <div className="animate-spin rounded-full h-4 w-4"></div>
          ) : (
            <LogOut className="w-4 h-4" />
          )}
        </Button>
      </div>
    </header>
  );
}
