"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";

const POLL_INTERVAL_MS = 30_000;

async function syncLocalCartToServerOnce() {
  const saved = localStorage.getItem("cartItems");
  if (!saved) return;

  const localItems = JSON.parse(saved);
  if (!Array.isArray(localItems) || localItems.length === 0) return;

  const cartResponse = await fetch("/api/cart", { cache: "no-store" });
  if (!cartResponse.ok) return;

  const cartPayload = await cartResponse.json().catch(() => ({}));
  const serverItems = Array.isArray(cartPayload.items) ? cartPayload.items : [];
  const missingItems = localItems.filter((localItem: any) => {
    if (!localItem || localItem.pcBuildId || localItem.productId == null) {
      return false;
    }
    return !serverItems.some(
      (serverItem: any) =>
        String(serverItem.productId) === String(localItem.productId) &&
        String(serverItem.variantId ?? "") ===
          String(localItem.variantId ?? ""),
    );
  });

  for (const item of missingItems) {
    const quantity = Number(item.quantity ?? 1);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    await fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: item.productId,
        variantId: item.variantId ?? null,
        quantity,
        pcBuilder: false,
      }),
    });
  }
}

export default function CustomerNotificationPoller() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;

    const poll = async () => {
      try {
        await syncLocalCartToServerOnce();
        await fetch("/api/customer-notifications?unreadOnly=true&limit=1", {
          cache: "no-store",
        });
      } catch (error) {
        console.error("Failed to poll customer notifications:", error);
      }
    };

    void poll();
    const intervalId = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [status]);

  return null;
}
