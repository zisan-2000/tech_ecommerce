"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Home } from "lucide-react";
import { Card } from "@/components/ui/card";
import AccountHeader from "../AccountHeader";
import AccountMenu from "../AccountMenu";

type CustomerNotification = {
  id: number;
  title: string;
  message: string;
  status: "UNREAD" | "READ";
  targetUrl: string | null;
  createdAt: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function CustomerNotificationsPage() {
  const [items, setItems] = useState<CustomerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/customer-notifications?limit=50", {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setItems([]);
        setUnreadCount(0);
        return;
      }
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setUnreadCount(Number(payload.unreadCount) || 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, []);

  const markAllRead = async () => {
    const response = await fetch("/api/customer-notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
    if (!response.ok) return;
    setUnreadCount(0);
    setItems((notifications) =>
      notifications.map((item) => ({ ...item, status: "READ" as const })),
    );
  };

  const markRead = async (id: number) => {
    setItems((notifications) =>
      notifications.map((item) =>
        item.id === id ? { ...item, status: "READ" as const } : item,
      ),
    );
    setUnreadCount((count) => Math.max(0, count - 1));
    await fetch("/api/customer-notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => undefined);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="px-6 pt-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="flex items-center gap-1 transition-colors hover:text-foreground">
            <Home className="h-4 w-4" />
            <span>Home</span>
          </Link>
          <span>/</span>
          <Link href="/ecommerce/user" className="transition-colors hover:text-foreground">
            Account
          </Link>
          <span>/</span>
          <span className="text-foreground">Notifications</span>
        </div>
      </div>

      <AccountHeader />
      <AccountMenu />

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <div>
              <h2 className="text-2xl font-medium">Notifications</h2>
              <p className="text-sm text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
              </p>
            </div>
          </div>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex h-9 items-center gap-2 rounded border border-border px-3 text-xs font-semibold hover:bg-accent"
            >
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
              Mark all read
            </button>
          ) : null}
        </div>

        {loading ? (
          <Card className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Loading notifications...
          </Card>
        ) : items.length === 0 ? (
          <Card className="rounded-2xl border border-border bg-card p-8 text-center text-card-foreground">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted">
              <Bell className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mb-1 text-lg font-semibold">No notifications yet</h3>
            <p className="text-sm text-muted-foreground">
              Price drop alerts will appear here when a watched product gets cheaper.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <Link
                key={item.id}
                href={item.targetUrl ?? "/ecommerce/user"}
                onClick={() => item.status === "UNREAD" && void markRead(item.id)}
                className="block rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm transition hover:bg-accent/40"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatDate(item.createdAt)}
                    </p>
                  </div>
                  {item.status === "UNREAD" ? (
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" />
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
