"use client";

import { useEffect, useState } from "react";
import { Menu, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import InvestorNav from "./InvestorNav";

type Props = {
  investorName: string;
  investorCode: string;
  children: React.ReactNode;
};

export default function InvestorLayoutClient({ investorName, investorCode, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="flex min-h-screen w-full">
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={[
          "fixed inset-y-0 left-0 z-50 w-[82vw] max-w-80 transform transition-transform duration-300 ease-in-out",
          "md:relative md:translate-x-0 md:transition-none",
          "md:w-72 md:max-w-none",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <InvestorNav
          investorName={investorName}
          investorCode={investorCode}
          onNavClick={() => setSidebarOpen(false)}
        />
      </div>

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar — sticky */}
        <header
          className={[
            "sticky top-0 z-30 flex items-center gap-3 border-b border-border px-4 py-3 md:hidden",
            "bg-card/80 backdrop-blur-md transition-shadow duration-200",
            scrolled ? "shadow-md" : "shadow-none",
          ].join(" ")}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Investor Portal</p>
            <p className="truncate text-sm font-semibold">{investorName}</p>
          </div>
          {mounted && (
            <button
              onClick={() => {
                const active =
                  theme === "dark" || resolvedTheme === "dark"
                    ? "dark"
                    : "light";
                setTheme(active === "dark" ? "light" : "dark");
              }}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Toggle theme"
            >
              {(() => {
                const active =
                  theme === "dark" || resolvedTheme === "dark"
                    ? "dark"
                    : "light";
                if (active === "dark") return <Moon className="h-5 w-5" />;
                return <Sun className="h-5 w-5" />;
              })()}
            </button>
          )}
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
