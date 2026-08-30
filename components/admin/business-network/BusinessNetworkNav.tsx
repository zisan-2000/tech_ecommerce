"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { businessNetworkNavigation } from "./config";

export function BusinessNetworkNav() {
  const pathname = usePathname(); const { data: session } = useSession();
  const permissions = useMemo(() => new Set(Array.isArray((session?.user as { permissions?: string[] } | undefined)?.permissions) ? (session?.user as { permissions: string[] }).permissions : []), [session]);
  return <nav aria-label="Business Network sections" className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-4 py-2 sm:px-6">{businessNetworkNavigation.filter((item) => item.permissions.some((permission) => permissions.has(permission))).map((item) => { const active = item.href === "/admin/business-network" ? pathname === item.href : pathname.startsWith(item.href); return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{item.label}</Link>; })}</nav>;
}
