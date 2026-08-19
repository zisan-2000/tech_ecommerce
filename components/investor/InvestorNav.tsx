"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  Wallet,
  PieChart,
  TrendingUp,
  HandCoins,
  ArrowDownCircle,
  FileText,
  FolderOpen,
  Bell,
  UserCircle2,
  LogOut,
  Sun,
  Moon,
  Check,
} from "lucide-react";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

type InvestorNavProps = {
  investorName: string;
  investorCode: string;
  onNavClick?: () => void;
};

const navItems = [
  { href: "/investor/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/investor/ledger", label: "Ledger", icon: Wallet },
  { href: "/investor/allocations", label: "Allocations", icon: PieChart },
  { href: "/investor/profit-runs", label: "Profit Runs", icon: TrendingUp },
  { href: "/investor/payouts", label: "Payouts", icon: HandCoins },
  { href: "/investor/withdrawals", label: "Withdrawals", icon: ArrowDownCircle },
  { href: "/investor/statements", label: "Statements", icon: FileText },
  { href: "/investor/documents", label: "Documents", icon: FolderOpen },
  { href: "/investor/profile", label: "Profile", icon: UserCircle2 },
  { href: "/investor/notifications", label: "Notifications", icon: Bell },
];

export default function InvestorNav({ investorName, investorCode, onNavClick }: InvestorNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    let active = true;

    async function loadUnreadCount() {
      try {
        const response = await fetch("/api/investor/notifications?unreadOnly=true", {
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) return;
        if (active) {
          setUnreadCount(Number(payload?.unreadCount || 0));
        }
      } catch {
        if (active) {
          setUnreadCount(0);
        }
      }
    }

    void loadUnreadCount();
    const interval = window.setInterval(() => {
      void loadUnreadCount();
    }, 60000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-card/70 backdrop-blur md:w-72">
      <div className="flex h-full flex-col">
        <div className="border-b border-border p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Investor Portal</p>
          <h2 className="mt-1 text-lg font-semibold">{investorName}</h2>
          <p className="text-sm text-muted-foreground">{investorCode}</p>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavClick}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className="flex items-center gap-2">
                  {item.label}
                  {item.href === "/investor/notifications" && unreadCount > 0 ? (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                      {unreadCount}
                    </span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3 space-y-2">
          {mounted && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2">
                  {(() => {
                    const active =
                      theme === "dark" || resolvedTheme === "dark"
                        ? "dark"
                        : "light";
                    if (active === "dark") return <Moon className="h-4 w-4" />;
                    return <Sun className="h-4 w-4" />;
                  })()}
                  <span className="flex-1 text-left">Theme</span>
                  <span className="text-xs text-muted-foreground capitalize">
                    {theme === "dark" || resolvedTheme === "dark"
                      ? "dark"
                      : "light"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-48">
                {THEME_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className="flex items-center gap-2"
                  >
                    <opt.icon className="h-4 w-4" />
                    <span className="flex-1">{opt.label}</span>
                    {theme === opt.value && (
                      <Check className="h-4 w-4" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={async () => {
              await signOut({ redirect: false });
              router.replace("/signin");
              router.refresh();
            }}
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </aside>
  );
}
