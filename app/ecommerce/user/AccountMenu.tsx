"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ShoppingBag,
  User,
  Lock,
  MapPin,
  Heart,
  FileTextIcon,
} from "lucide-react";

type MenuItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

export default function AccountMenu() {
  const pathname = usePathname();

  const items: MenuItem[] = [
    { label: "Orders", href: "/ecommerce/user/orders", icon: <ShoppingBag className="h-4 w-4" /> },
    { label: "Invoice", href: "/ecommerce/user/invoice", icon: <FileTextIcon className="h-4 w-4" /> }, 
    { label: "Edit Profile", href: "/ecommerce/user/profile", icon: <User className="h-4 w-4" /> },
    { label: "Change Password", href: "/ecommerce/user/change-password", icon: <Lock className="h-4 w-4" /> },
    { label: "Addresses", href: "/ecommerce/user/addresses", icon: <MapPin className="h-4 w-4" /> },
    { label: "Wish List", href: "/ecommerce/user/wishlist", icon: <Heart className="h-4 w-4" /> },
    { label: "Notifications", href: "/ecommerce/user/notifications", icon: <Bell className="h-4 w-4" /> },
  ];

  return (
    <div className="border-b border-border">
      <div className="max-w-6xl mx-auto px-6">
        <nav className="flex items-center gap-6 overflow-x-auto py-3">
          {items.map((it) => {
            const active =
              pathname === it.href || pathname?.startsWith(it.href + "/");

            return (
              <Link
                key={it.href}
                href={it.href}
                className={[
                  "flex items-center gap-2 whitespace-nowrap text-sm transition-colors",
                  active
                    ? "text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                <span className="text-muted-foreground">{it.icon}</span>
                <span>{it.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
