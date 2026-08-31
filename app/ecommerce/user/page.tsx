// app/ecommerce/user/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Card } from "@/components/ui/card";
import {
  Bell,
  ShoppingBag,
  User,
  Lock,
  MapPin,
  Heart,
  ChevronRight,
  FileTextIcon,
} from "lucide-react";
import AccountHeader from "./AccountHeader";

type Tile = {
  title: string;
  href: string;
  icon: React.ReactNode;
  badgeCount?: number;
};

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted/70 ${className}`} />;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-border/70 bg-card/90 p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-2xl" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 7 }).map((_, index) => (
          <Card
            key={index}
            className="h-[120px] rounded-2xl border border-border bg-card/90 shadow-sm md:h-[140px]"
          >
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="h-3 w-24" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function TileCard({ title, href, icon, badgeCount = 0 }: Tile) {
  const visibleBadgeCount = Math.min(99, Math.max(0, badgeCount));

  return (
    <Link href={href} className="group block">
      <Card
        className="
          relative h-[120px] rounded-2xl border border-border bg-card text-card-foreground
          shadow-sm transition-all duration-300 hover:-translate-y-[2px] hover:shadow-md
          md:h-[140px]
        "
      >
        {visibleBadgeCount > 0 ? (
          <span className="absolute right-3 top-3 flex min-w-6 items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[11px] font-bold leading-5 text-white shadow-sm">
            {visibleBadgeCount === 99 ? "99+" : visibleBadgeCount}
          </span>
        ) : null}
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <div
            className="
              flex h-12 w-12 items-center justify-center rounded-full bg-muted
              transition-all duration-300 group-hover:bg-accent
            "
          >
            <div className="text-foreground">{icon}</div>
          </div>

          <p className="text-sm font-semibold">{title}</p>
        </div>
      </Card>
    </Link>
  );
}

export default function UserDashboardPage() {
  const { data: session, status } = useSession();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (status !== "authenticated") return;

    const loadNotificationCount = async () => {
      try {
        const response = await fetch(
          "/api/customer-notifications?unreadOnly=true&limit=1",
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const payload = await response.json();
        setUnreadCount(Number(payload.unreadCount) || 0);
      } catch (error) {
        console.error("Failed to load customer notification count:", error);
      }
    };

    void loadNotificationCount();
    const intervalId = window.setInterval(loadNotificationCount, 30_000);
    return () => window.clearInterval(intervalId);
  }, [status]);

  const userName =
    session?.user?.name ||
    (session?.user?.email ? session.user.email.split("@")[0] : "") ||
    "User";

  const tiles: Tile[] = [
    {
      title: "Orders",
      href: "/ecommerce/user/orders",
      icon: <ShoppingBag className="h-5 w-5" />,
    },
    {
      title: "Invoice",
      href: "/ecommerce/user/invoice",
      icon: <FileTextIcon className="h-4 w-4" />,
    },
    {
      title: "Edit Profile",
      href: "/ecommerce/user/profile",
      icon: <User className="h-5 w-5" />,
    },
    {
      title: "Password",
      href: "/ecommerce/user/change-password",
      icon: <Lock className="h-5 w-5" />,
    },
    {
      title: "Addresses",
      href: "/ecommerce/user/addresses",
      icon: <MapPin className="h-5 w-5" />,
    },
    {
      title: "Wish List",
      href: "/ecommerce/user/wishlist",
      icon: <Heart className="h-5 w-5" />,
    },
    {
      title: "Notifications",
      href: "/ecommerce/user/notifications",
      icon: <Bell className="h-5 w-5" />,
      badgeCount: unreadCount,
    },
  ];

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/25 text-foreground">
        <div className="px-6 pt-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Skeleton className="h-4 w-16" />
            <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-6 pb-10 pt-4">
          <DashboardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/25 text-foreground">
      <div className="px-6 pt-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="transition-colors hover:text-foreground">
            Home
          </Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
          <span className="text-foreground">Account</span>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 pb-10 pt-4">
        <div className="rounded-3xl border border-border/70 bg-card/80 p-5 shadow-sm">
          <AccountHeader />
          <p className="mt-3 text-xs text-muted-foreground">
            Signed in as {userName}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((tile) => (
            <TileCard key={tile.href} {...tile} />
          ))}
        </div>

      </div>
    </div>
  );
}
