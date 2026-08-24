"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useCart } from "@/components/ecommarce/CartContext";
import {
  PC_BUILDER_EXTRA_ITEMS_STORAGE_KEY,
  PC_BUILDER_STORAGE_KEY,
} from "@/lib/pc-builder";

function clearCompletedPcBuilderDraft() {
  try {
    localStorage.removeItem(PC_BUILDER_STORAGE_KEY);
    localStorage.removeItem(PC_BUILDER_EXTRA_ITEMS_STORAGE_KEY);
  } catch {
    // A verified payment remains successful when browser storage is unavailable.
  }
}

export default function PaymentResultClient({ success }: { success: boolean }) {
  const { clearCart } = useCart();
  const { data: session } = useSession();

  useEffect(() => {
    if (!success) return;
    clearCompletedPcBuilderDraft();
    clearCart();
    if (session?.user) {
      fetch("/api/cart", { method: "DELETE" })
        .then(() => window.dispatchEvent(new Event("serverCartCleared")))
        .catch(() => undefined);
    }
  }, [clearCart, session?.user, success]);

  return null;
}
