"use client";

import { useState } from "react";
import { useCart } from "@/components/ecommarce/CartContext";

export default function AddToCartButton({
  productId,
  variantId,
  quantity = 1,
  className = "",
  children = "Add to Cart",
  disabled = false,
  disabledText = "Out of Stock",
}: {
  productId: string | number;
  variantId?: string | number | null;
  quantity?: number;
  className?: string;
  children?: React.ReactNode;

  // ✅ NEW
  disabled?: boolean;
  disabledText?: string;
}) {
  const { addToCart } = useCart();
  const [loading, setLoading] = useState(false);

  const isDisabled = disabled || loading || !productId;

  const handleAdd = async () => {
    if (isDisabled) return;

    try {
      setLoading(true);

      // ✅ Your existing CartContext function (localStorage cart)
      const added = await addToCart(productId, quantity, variantId);
      if (!added) throw new Error("Product could not be added to cart");
    } catch (e) {
      console.error(e);
      alert("Failed to add to cart");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleAdd}
      disabled={isDisabled}
      className={
        className ||
        "h-11 px-6 rounded-lg bg-transparent border border-primary hover:bg-primary text-primary hover:text-primary-foreground font-semibold hover:opacity-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
      }
    >
      {loading ? "Adding..." : isDisabled && disabled ? disabledText : children}
    </button>
  );
}
