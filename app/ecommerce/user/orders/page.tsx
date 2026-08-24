"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ChevronRight, Home } from "lucide-react";
import { Card } from "@/components/ui/card";
import AccountMenu from "../AccountMenu";
import AccountHeader from "../AccountHeader";

interface CartItem {
  id: number | string;
  productId: number;
  variantId: number | null;
  name: string;
  price: number;
  quantity: number;
  image: string;
}

function mergeIdenticalOrderItems(items: CartItem[]) {
  const merged = new Map<string, CartItem>();

  for (const item of items) {
    const key = `${item.productId}:${item.variantId ?? "default"}:${item.price}`;
    const current = merged.get(key);
    if (current) {
      current.quantity += item.quantity;
    } else {
      merged.set(key, { ...item });
    }
  }

  return [...merged.values()];
}

interface Customer {
  name: string;
  mobile: string;
  email: string;
  location?: string;
  address?: string;
  deliveryAddress?: string;
}

interface Order {
  invoiceId: string;
  customer: Customer;
  cartItems?: CartItem[] | null;
  paymentMethod: string;
  transactionId: string | null;
  total: number;
  createdAt: string;
  status: string;
  paymentStatus: string;
}

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

const getOrderStatusConfig = (status: string) => {
  const s = status?.toUpperCase();
  if (s === "DELIVERED") {
    return {
      label: "Delivered",
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
    };
  }
  if (s === "RETURNED") {
    return {
      label: "Returned",
      className:
        "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300",
    };
  }
  if (s === "FAILED") {
    return {
      label: "Failed",
      className:
        "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300",
    };
  }
  if (s === "SHIPPED" || s === "PROCESSING" || s === "CONFIRMED") {
    return {
      label:
        s === "SHIPPED"
          ? "Shipped"
          : s === "PROCESSING"
            ? "Processing"
            : "Confirmed",
      className:
        "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300",
    };
  }
  if (s === "CANCELLED") {
    return {
      label: "Cancelled",
      className:
        "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300",
    };
  }
  return {
    label: "Pending",
    className:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  };
};

const getPaymentStatusConfig = (paymentStatus: string) => {
  const s = paymentStatus?.toUpperCase();
  if (s === "PAID") {
    return {
      label: "Paid",
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
    };
  }
  if (s === "REFUNDED") {
    return {
      label: "Refunded",
      className:
        "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300",
    };
  }
  return {
    label: "Unpaid",
    className:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  };
};

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted/70 ${className}`} />;
}

function OrdersPageSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card
          key={index}
          className="overflow-hidden border-border/60 bg-card/90 p-4 shadow-sm md:p-6"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
              <Skeleton className="h-3 w-64" />
            </div>
            <div className="flex flex-col gap-2 md:items-end">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>

          <div className="mt-5 space-y-4 border-t border-border/60 pt-4">
            {Array.from({ length: 2 }).map((__, itemIndex) => (
              <div
                key={itemIndex}
                className="flex gap-4 rounded-2xl border border-border/50 p-3"
              >
                <Skeleton className="h-20 w-16 flex-none rounded-xl" />
                <div className="flex-1 space-y-3 py-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end border-t border-border/60 pt-4">
            <div className="space-y-2 text-right">
              <Skeleton className="ml-auto h-3 w-20" />
              <Skeleton className="ml-auto h-5 w-28" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function OrdersPage() {
  const { data: session } = useSession();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const starPoints = 0;
  const storeCredit = 0;

  const userName =
    session?.user?.name ||
    (session?.user?.email ? session.user.email.split("@")[0] : "") ||
    "User";

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/orders?limit=50", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });

        if (res.status === 401) {
          setError("You need to login to view your orders.");
          setOrders([]);
          return;
        }

        if (!res.ok) {
          setError("Failed to load orders.");
          setOrders([]);
          return;
        }

        const data = await res.json();

        const mapped: Order[] = Array.isArray(data.orders)
          ? data.orders.map((o: any) => {
              const items: CartItem[] = Array.isArray(o.orderItems)
                ? mergeIdenticalOrderItems(
                    o.orderItems.map((oi: any) => ({
                      id: oi.id,
                      productId: Number(oi.productId),
                      variantId:
                        oi.variantId === null || oi.variantId === undefined
                          ? null
                          : Number(oi.variantId),
                      name: oi.product?.name ?? "Unknown product",
                      price: Number(oi.price ?? 0),
                      quantity: Math.max(1, Number(oi.quantity ?? 1)),
                      image: oi.product?.image ?? "",
                    })),
                  )
                : [];

              return {
                invoiceId: String(o.id),
                customer: {
                  name: o.name,
                  mobile: o.phone_number,
                  email: o.email ?? "",
                  address: o.address_details ?? "",
                  location: `${o.area || ""}, ${o.district || ""}, ${o.country || ""}`
                    .replace(/^[,\s]+|[,\s]+$/g, "")
                    .replace(/,\s*,/g, ","),
                  deliveryAddress: o.address_details ?? "",
                },
                cartItems: items,
                paymentMethod: o.payment_method,
                transactionId: o.transactionId ?? null,
                total: Number(o.grand_total ?? o.total ?? 0),
                createdAt: o.createdAt ?? o.order_date,
                status: o.status ?? "PENDING",
                paymentStatus: o.paymentStatus ?? "UNPAID",
              };
            })
          : [];

        setOrders(mapped);
      } catch (err) {
        console.error(err);
        setError("Failed to load orders.");
        setOrders([]);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, []);

  const orderedList = useMemo(() => orders, [orders]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/25 text-foreground">
      <div className="px-6 pt-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            href="/"
            className="flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <Home className="h-4 w-4" />
            <span>Home</span>
          </Link>

          <ChevronRight className="h-4 w-4 text-muted-foreground/70" />

          <Link
            href="/ecommerce/user"
            className="transition-colors hover:text-foreground"
          >
            Account
          </Link>

          <ChevronRight className="h-4 w-4 text-muted-foreground/70" />

          <span className="text-foreground">Order History</span>
        </div>
      </div>

      <AccountHeader />
      <AccountMenu />

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6">
          <h2 className="text-3xl font-semibold tracking-tight">
            Order History
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Track your recent orders, payment state, and delivery progress.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {userName}
            {starPoints || storeCredit
              ? ` • ${starPoints} stars • TK. ${storeCredit.toFixed(2)} credit`
              : ""}
          </p>
        </div>

        {loading ? (
          <OrdersPageSkeleton />
        ) : error ? (
          <Card className="border-rose-200 bg-rose-50 p-6 text-rose-900 shadow-sm dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
            <p className="text-sm font-medium">{error}</p>
          </Card>
        ) : orderedList.length === 0 ? (
          <Card className="border-dashed border-border/70 bg-card/80 p-8 text-center shadow-sm">
            <p className="text-sm text-muted-foreground">
              You have not made any previous orders yet.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {orderedList.map((order) => {
              const items = Array.isArray(order.cartItems) ? order.cartItems : [];
              const statusCfg = getOrderStatusConfig(order.status);
              const paymentCfg = getPaymentStatusConfig(order.paymentStatus);

              return (
                <Card
                  key={order.invoiceId}
                  className="overflow-hidden border-border/60 bg-card/90 p-4 text-card-foreground shadow-sm transition-shadow hover:shadow-md md:p-6"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="text-sm">
                      <p>
                        <span className="font-medium">Order ID: </span>
                        <Link
                          href={`/ecommerce/user/orders/${order.invoiceId}`}
                          className="font-medium text-primary underline underline-offset-2 transition-colors hover:text-primary/80 hover:no-underline"
                        >
                          {order.invoiceId}
                        </Link>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Placed on: {formatDateTime(order.createdAt)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Customer:{" "}
                        <span className="font-medium text-foreground">
                          {order.customer.name}
                        </span>{" "}
                        | Mobile: {order.customer.mobile}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 md:items-end">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusCfg.className}`}
                      >
                        {statusCfg.label}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${paymentCfg.className}`}
                      >
                        Payment: {paymentCfg.label}
                      </span>

                      <Link
                        href={`/ecommerce/user/orders/${order.invoiceId}`}
                        className="text-sm font-medium text-primary underline underline-offset-2 transition-colors hover:text-primary/80 hover:no-underline"
                      >
                        Track My Order →
                      </Link>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-border/60 pt-4">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="flex gap-4 border-b border-border/60 py-4 last:border-b-0"
                      >
                        <div className="flex h-20 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/40">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="px-2 text-center text-[10px] text-muted-foreground">
                              No Image
                            </span>
                          )}
                        </div>

                        <div className="flex-1 text-sm">
                          <p className="line-clamp-1 font-medium">{item.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            TK. {item.price.toFixed(2)} × {item.quantity}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 flex justify-end border-t border-border/60 pt-3">
                    <div className="text-right text-sm">
                      <p className="text-xs text-muted-foreground">
                        Order Total
                      </p>
                      <p className="text-base font-semibold text-foreground">
                        TK. {order.total.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
