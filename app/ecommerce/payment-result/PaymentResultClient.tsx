"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useCart } from "@/components/ecommarce/CartContext";

export default function PaymentResultClient({ success }: { success: boolean }) {
  const { clearCart } = useCart();
  const { data: session } = useSession();

  useEffect(() => {
    if (!success) return;
    clearCart();
    if (session?.user) {
      fetch("/api/cart", { method: "DELETE" })
        .then(() => window.dispatchEvent(new Event("serverCartCleared")))
        .catch(() => undefined);
    }
  }, [clearCart, session?.user, success]);

  return null;
}
