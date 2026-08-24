"use client";

import { useCart } from "@/components/ecommarce/CartContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Trash2,
  Plus,
  Minus,
  ShoppingCart,
  ArrowRight,
  Tag,
  Truck,
  Shield,
  ArrowLeft,
  Home,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "@/lib/auth-client";

interface LocalCartItem {
  id: number | string; // server cart item id
  productId: number;
  variantId?: number | null;
  name: string;
  price: number;
  image: string;
  quantity: number;
  variantLabel?: string | null;
  pcBuildId?: string | null;
  pcBuildSlot?: string | null;
  quantityItemId?: number | string | null;
}

function cartSelectionKey(item: Pick<LocalCartItem, "productId" | "variantId">) {
  return `${item.productId}:${item.variantId ?? "default"}`;
}

function combinePcBuildCompanionQuantities(items: LocalCartItem[]) {
  const standardQueues = new Map<string, LocalCartItem[]>();
  for (const item of items) {
    if (item.pcBuildId) continue;
    const key = cartSelectionKey(item);
    standardQueues.set(key, [...(standardQueues.get(key) ?? []), item]);
  }

  const consumedStandardIds = new Set<string>();
  const companionByBuildRow = new Map<string, LocalCartItem>();
  for (const item of items) {
    if (!item.pcBuildId) continue;
    const companion = standardQueues.get(cartSelectionKey(item))?.shift();
    if (!companion) continue;
    companionByBuildRow.set(String(item.id), companion);
    consumedStandardIds.add(String(companion.id));
  }

  return items.flatMap((item) => {
    if (!item.pcBuildId && consumedStandardIds.has(String(item.id))) return [];
    const companion = companionByBuildRow.get(String(item.id));
    return [
      companion
        ? {
            ...item,
            quantity: item.quantity + companion.quantity,
            quantityItemId: companion.id,
          }
        : item.pcBuildId
          ? { ...item, quantityItemId: null }
          : item,
    ];
  });
}

// ✅ Simple skeleton block component
function Skeleton({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-muted/60 ${className}`}
      aria-hidden="true"
    />
  );
}

function CartSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left skeleton */}
      <div className="lg:col-span-2 space-y-6">
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between px-6 py-5 border-b border-border">
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-10 w-28" />
          </div>

          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="px-6 py-5">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-16 w-16 rounded-md" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>

                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-32" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-20 ml-auto" />
                      <Skeleton className="h-3 w-16 ml-auto" />
                    </div>
                    <Skeleton className="h-10 w-10" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="px-6 py-5 border-t border-border">
            <Skeleton className="h-4 w-36" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-3">
          <div className="flex items-start gap-3">
            <Skeleton className="h-5 w-5" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      </div>

      {/* Right skeleton */}
      <div className="lg:col-span-1">
        <div className="rounded-xl border border-border bg-card shadow-sm sticky top-6">
          <div className="px-6 py-5 border-b border-border">
            <Skeleton className="h-5 w-36" />
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>

            <div className="border-t border-border pt-4 flex items-center justify-between">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-7 w-24" />
            </div>

            <div className="pt-2 flex gap-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>

            <div className="pt-4 border-t border-border">
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}

export default function CartPage() {
  const { cartItems, removeFromCart, updateQuantity, clearCart, replaceCart } =
    useCart();

  const { status } = useSession();
  const isAuthenticated = status === "authenticated";
  const router = useRouter();

  const [couponCode, setCouponCode] = useState("");
  const [discountAmount, setDiscountAmount] = useState(0);
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [hasMounted, setHasMounted] = useState(false);

  const [serverCartItems, setServerCartItems] = useState<LocalCartItem[] | null>(
    null
  );
  const [loadingServerCart, setLoadingServerCart] = useState(false);
  const [serverCartError, setServerCartError] = useState<string | null>(null);

  // ✅ prevent repeated context replace
  const lastReplacedRef = useRef<string>("");

  // ✅ prevent parallel requests
  const inFlightRef = useRef(false);

  useEffect(() => setHasMounted(true), []);

  /**
   * ✅ IMPORTANT: এই key টা তোমার CartContext localStorage key অনুযায়ী বসাও
   * Example: "cart" / "ecommerce_cart" / "cartItems" etc.
   */
  const GUEST_CART_STORAGE_KEY = "cartItems";

  // ----------------------------
  // ✅ Server cart -> Context cart (ONLY when changed)
  // ----------------------------
  const mappedServerForContext = useMemo(() => {
    if (!Array.isArray(serverCartItems)) return null;
    return serverCartItems.map((i) => ({
      id: i.id,
      productId: i.productId,
      variantId: i.variantId ?? null,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      image: i.image || "/placeholder.svg",
      variantLabel: i.variantLabel ?? null,
      pcBuildId: i.pcBuildId ?? null,
      pcBuildSlot: i.pcBuildSlot ?? null,
    }));
  }, [serverCartItems]);

  // ✅ Removed replaceCart to preserve cart context
  // Cart page should only display items, not modify the context
  // useEffect(() => {
  //   if (!hasMounted) return;
  //   if (!isAuthenticated) return;
  //   if (!mappedServerForContext) return;

  //   const nextStr = JSON.stringify(mappedServerForContext);
  //   if (lastReplacedRef.current === nextStr) return;

  //   lastReplacedRef.current = nextStr;
  //   replaceCart(mappedServerForContext);
  // }, [hasMounted, isAuthenticated, mappedServerForContext, replaceCart]);

  const fetchServerCart = useCallback(async () => {
    try {
      setServerCartError(null);
      setLoadingServerCart(true);

      const res = await fetch("/api/cart", { cache: "no-store" });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        console.error("Failed to load server cart:", data || res.statusText);
        throw new Error("Failed to load cart from server.");
      }

      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];

      const mapped: LocalCartItem[] = items.map((item: any) => ({
        id: item.id,
        productId: item.productId,
        variantId: item.variantId ?? item.variant?.id ?? null,
        name: item.product?.name ?? "Unknown Product",
        price: Number(item.variant?.price ?? item.product?.basePrice ?? 0),
        image: item.product?.image ?? "/placeholder.svg",
        quantity: Number(item.quantity ?? 1),
        variantLabel:
          item.variant?.options && typeof item.variant.options === "object"
            ? Object.entries(item.variant.options)
                .map(([key, value]) => `${key}: ${String(value)}`)
                .join(", ")
            : item.variant?.sku ?? null,
        pcBuildId: item.pcBuildId ?? null,
        pcBuildSlot: item.pcBuildSlot ?? null,
      }));

      setServerCartItems(mapped);
    } catch (err) {
      setServerCartError(
        err instanceof Error ? err.message : "Failed to load cart."
      );
    } finally {
      setLoadingServerCart(false);
    }
  }, []);

  // ✅ only clear guest storage (NOT context state)
  const clearGuestCartStorageOnly = useCallback(() => {
    try {
      localStorage.removeItem(GUEST_CART_STORAGE_KEY);
    } catch {}
  }, []);

  const syncGuestCartToServer = useCallback(async () => {
    try {
      setServerCartError(null);
      setLoadingServerCart(true);

      // 1) get existing server cart
      const serverRes = await fetch("/api/cart", { cache: "no-store" });
      if (!serverRes.ok) throw new Error("Failed to fetch server cart");

      const serverData = await serverRes.json();
      const existingItems = Array.isArray(serverData.items)
        ? serverData.items
        : [];

      // 2) snapshot local items
      const localSnapshot: any[] = Array.isArray(cartItems) ? cartItems : [];

      // 3) only sync missing products
      const itemsToSync = localSnapshot.filter(
        (localItem) =>
          !existingItems.some(
            (serverItem: any) =>
              String(serverItem.productId) === String(localItem.productId) &&
              String(serverItem.variantId ?? "") === String(localItem.variantId ?? "") &&
              String(serverItem.pcBuildId ?? "") === String(localItem.pcBuildId ?? "")
          )
      );

      // 4) push to server
      for (const item of itemsToSync) {
        await fetch("/api/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: item.productId,
            variantId: item.variantId ?? null,
            quantity: item.quantity,
            pcBuilder: false,
          }),
        });
      }

      /**
       * ✅ IMPORTANT:
       * এখানে clearCart() দিবে না
       * কারণ clearCart() দিলে CartContext count/badge 0 হয়ে যায়
       * checkout না হওয়া পর্যন্ত user এর count ঠিক থাকা উচিত
       */
      clearGuestCartStorageOnly();

      // 5) now fetch latest server cart (this will replace context)
      await fetchServerCart();
    } catch (err) {
      console.error("Error syncing guest cart to server:", err);
      await fetchServerCart();
    } finally {
      setLoadingServerCart(false);
    }
  }, [cartItems, clearGuestCartStorageOnly, fetchServerCart]);

  // ----------------------------
  // ✅ Main auth sync - DISABLED on cart page to preserve context
  // ----------------------------
  useEffect(() => {
    // Don't sync on cart page to prevent context changes
    // Cart page should be read-only view
    if (!hasMounted) return;
    
    if (isAuthenticated && !serverCartItems && !serverCartError) {
      // Only fetch server cart for display, don't sync with context
      fetchServerCart();
    }
    
    return;
  }, [
    isAuthenticated,
    hasMounted,
    serverCartItems,
    serverCartError,
    fetchServerCart,
  ]);

  // ----------------------------
  // ✅ Gentle sync for authenticated users - DISABLED on cart page
  // ----------------------------
  useEffect(() => {
    // Disable sync on cart page to prevent automatic additions
    // Cart page should be read-only view only
    return;
    
    if (!hasMounted) return;
    if (!isAuthenticated) return;
    
    const syncContextToServer = async () => {
      const contextItems = (cartItems as any) || [];
      const serverItems = serverCartItems ?? [];
      
      if (contextItems.length === 0) return;
      
      // Find items in context that don't exist in server
      const itemsToSync = contextItems.filter((contextItem: any) =>
        !serverItems.some(
          (serverItem: any) =>
              String(serverItem.productId) === String(contextItem.productId) &&
              String(serverItem.variantId ?? "") === String(contextItem.variantId ?? "") &&
              String(serverItem.pcBuildId ?? "") === String(contextItem.pcBuildId ?? "")
        )
      );
      
      // Sync to server without affecting context
      for (const item of itemsToSync) {
        try {
          await fetch("/api/cart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              productId: item.productId,
              variantId: item.variantId ?? null,
              quantity: item.quantity,
              pcBuilder: false,
            }),
          });
        } catch (error) {
          console.error("Failed to sync item to server:", error);
        }
      }
      
      // Refresh server cart after syncing
      if (itemsToSync.length > 0) {
        fetchServerCart();
      }
    };
    
    // Delay sync to avoid immediate calls
    const timer = setTimeout(syncContextToServer, 1000);
    return () => clearTimeout(timer);
  }, [isAuthenticated, hasMounted, cartItems, serverCartItems, fetchServerCart]);

  // manual retry
  const retryServerCart = async () => {
    inFlightRef.current = false;
    setServerCartItems(null);
    await fetchServerCart();
  };

  // listen for external clear event
  useEffect(() => {
    const handler = () => {
      setServerCartItems([]);
      setServerCartError(null);
      lastReplacedRef.current = JSON.stringify([]);
    };
    window.addEventListener("serverCartCleared", handler);
    return () => window.removeEventListener("serverCartCleared", handler);
  }, []);

  if (!hasMounted) return null;

  const showAuthSkeleton =
    isAuthenticated && serverCartItems === null && !serverCartError;
  const showAuthError =
    isAuthenticated && serverCartItems === null && !!serverCartError;

  const itemsToRender: LocalCartItem[] = (() => {
  if (!isAuthenticated) {
    return ((cartItems as any) || []);
  }

  // For authenticated users, combine server cart and context items
  const serverItems = serverCartItems ?? [];
  const contextItems = (cartItems as any) || [];

  // Merge items, preferring server items for same product/variant
  const mergedItems = [...serverItems];
  
  // Add context items that don't exist in server cart
  contextItems.forEach((contextItem: any) => {
    const existsInServer = serverItems.some(
      (serverItem: any) =>
        String(serverItem.productId) === String(contextItem.productId) &&
        String(serverItem.variantId ?? "") === String(contextItem.variantId ?? "") &&
        String(serverItem.pcBuildId ?? "") === String(contextItem.pcBuildId ?? "")
    );
    
    if (!existsInServer) {
      mergedItems.push(contextItem);
    }
  });

  return combinePcBuildCompanionQuantities(mergedItems);
})();

  const subtotal = itemsToRender.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  );

  // const shippingCost = subtotal > 500 ? 0 : 60;
  const total = subtotal - discountAmount;
  const isCartEmpty = itemsToRender.length === 0;

  const handleCheckout = async () => {
    if (!isAuthenticated) {
      sessionStorage.setItem("pendingCheckout", JSON.stringify(cartItems));
      sessionStorage.setItem("redirectAfterLogin", "/ecommerce/checkout");
      toast.info("Please log in to continue to checkout.");
      await signIn(undefined, { callbackUrl: "/ecommerce/checkout" });
      return;
    }
    router.push("/ecommerce/checkout");
  };

  const handleClearCart = async () => {
    if (itemsToRender.length === 0) return;

    try {
      if (isAuthenticated) {
        const res = await fetch("/api/cart", { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          console.error("Clear cart failed:", data || res.statusText);
          toast.error("Failed to clear cart.");
          return;
        }
        setServerCartItems([]);
      }

      // এখানে user নিজে clear করেছে, তাই context clear OK
      clearCart();
      lastReplacedRef.current = "";
      clearGuestCartStorageOnly();
      toast.success("Cart cleared.");
    } catch (error) {
      console.error("Error clearing cart:", error);
      toast.error("Failed to clear cart.");
    }
  };

  const handleRemoveItem = async (itemId: string | number) => {
    try {
      // Check if this is a server cart item or context item
      const isServerItem = isAuthenticated && serverCartItems?.some(item => item.id === itemId);
      
      if (isAuthenticated && isServerItem) {
        // Remove from server cart
        const res = await fetch(`/api/cart/${itemId}`, { method: "DELETE" });

        if (!res.ok && res.status !== 404) {
          const data = await res.json().catch(() => null);
          console.error("Remove cart item failed:", data || res.statusText);
          toast.error("Failed to remove item.");
          return;
        }

        setServerCartItems((prev) =>
          prev ? prev.filter((i) => i.id !== itemId) : prev
        );
      }

      // Always remove from context
      removeFromCart(itemId);
      toast.success("Item removed.");
    } catch (error) {
      console.error("Error removing cart item:", error);
      toast.error("Failed to remove item.");
    }
  };

  const handleUpdateQuantity = async (
    item: LocalCartItem,
    newQuantity: number
  ) => {
    if (newQuantity < 1) return;

    try {
      if (isAuthenticated && item.pcBuildId) {
        const companionQuantity = newQuantity - 1;
        let res: Response;

        if (item.quantityItemId) {
          res = await fetch(`/api/cart/${item.quantityItemId}`, {
            method: companionQuantity > 0 ? "PATCH" : "DELETE",
            headers:
              companionQuantity > 0
                ? { "Content-Type": "application/json" }
                : undefined,
            body:
              companionQuantity > 0
                ? JSON.stringify({ quantity: companionQuantity })
                : undefined,
          });
        } else {
          res = await fetch("/api/cart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              productId: item.productId,
              variantId: item.variantId ?? null,
              quantity: companionQuantity,
              pcBuilder: false,
            }),
          });
        }

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          toast.error(data?.error || "Failed to update quantity.");
          return;
        }

        await fetchServerCart();
        return;
      }

      const itemId = item.id;
      // Check if this is a server cart item or context item
      const isServerItem = isAuthenticated && serverCartItems?.some(item => item.id === itemId);
      
      if (isAuthenticated && isServerItem) {
        // Update server cart item
        const res = await fetch(`/api/cart/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: newQuantity }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          console.error("Update quantity failed:", data || res.statusText);
          toast.error("Failed to update quantity.");
          return;
        }

        setServerCartItems((prev) =>
          prev
            ? prev.map((i) =>
                i.id === itemId ? { ...i, quantity: newQuantity } : i
              )
            : prev
        );
      }

      // Always update context
      updateQuantity(itemId, newQuantity);
    } catch (error) {
      console.error("Error updating quantity:", error);
      toast.error("Failed to update quantity.");
    }
  };

  const applyCoupon = async () => {
    if (!couponCode.trim()) {
      toast.error("Enter a coupon code.");
      return;
    }

    try {
      const response = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: couponCode.trim(),
          subtotal,
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Failed to apply coupon.");

      if (data.success) {
        setDiscountAmount(data.coupon.discountAmount);
        setAppliedCoupon(data.coupon);
        toast.success("Coupon applied!");
        setCouponCode("");
      }
    } catch (error) {
      console.error("Coupon application error:", error);
      toast.error(
        error instanceof Error ? error.message : "Invalid coupon code."
      );
      setDiscountAmount(0);
      setAppliedCoupon(null);
    }
  };

  const removeCoupon = () => {
    setDiscountAmount(0);
    setAppliedCoupon(null);
    setCouponCode("");
    toast.info("Coupon removed.");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumbs */}
        <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            href="/"
            className="inline-flex items-center gap-2 hover:text-foreground transition"
          >
            <Home className="h-4 w-4" />
          </Link>
          <span>/</span>
          <span className="text-foreground/90">Shopping Cart</span>
        </div>

        {/* Page title */}
        <div className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">
            Shopping Cart
          </h1>

          {isAuthenticated && (loadingServerCart || showAuthSkeleton) && (
            <p className="mt-2 text-sm text-muted-foreground">
              Syncing your cart...
            </p>
          )}
        </div>

        {showAuthSkeleton ? (
          <CartSkeleton />
        ) : showAuthError ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center shadow-sm">
            <h2 className="text-lg font-semibold mb-2">
              Couldn’t load your cart
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {serverCartError}
            </p>
            <Button onClick={retryServerCart} className="rounded-md">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        ) : isCartEmpty ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center shadow-sm">
            <ShoppingCart className="h-14 w-14 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Your cart is empty</h2>
            <p className="text-muted-foreground mb-6">
              Add some products to get started.
            </p>
            <Link href="/">
              <Button className="rounded-md btn-primary">
                Continue Shopping <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left */}
            <div className="lg:col-span-2 space-y-6">
              {/* Items Card */}
              <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-5 border-b border-border bg-card/50">
                  <div>
                    <h2 className="text-lg font-semibold">Your Products</h2>
                    <p className="text-sm text-muted-foreground">
                      {itemsToRender.length} item(s)
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleClearCart}
                    className="rounded-xl w-full sm:w-auto"
                  >
                    Clear Cart
                  </Button>
                </div>

                <div className="divide-y divide-border">
                  {itemsToRender.map((item) => (
                    <div key={item.id} className="px-4 sm:px-6 py-5">
                      {/* ✅ Professional mobile layout */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        {/* ✅ Bigger image on mobile */}
                        <Link
                          href={`/ecommerce/products/${item.productId}`}
                          className="block"
                        >
                          <div className="relative w-full sm:w-20 h-44 sm:h-20 rounded-xl overflow-hidden border border-border bg-background">
                            <Image
                              src={item.image || "/placeholder.svg"}
                              alt={item.name}
                              fill
                              className="object-contain p-4"
                              sizes="(max-width: 640px) 100vw, 80px"
                            />
                          </div>
                        </Link>

                        {/* Name + unit price */}
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/ecommerce/products/${item.productId}`}
                            className="block"
                          >
                            <div className="font-semibold text-base leading-snug line-clamp-2 hover:underline">
                              {item.name}
                            </div>
                          </Link>
                          <div className="mt-1 text-sm text-muted-foreground">
                            Unit Price: ৳{item.price.toLocaleString()}
                          </div>

                          {/* ✅ Mobile: Qty + price inline row */}
                          <div className="mt-4 flex flex-col sm:hidden gap-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center rounded-xl border border-border overflow-hidden bg-background">
                                <button
                                  className="h-10 w-10 grid place-items-center hover:bg-muted transition disabled:opacity-40"
                                  onClick={() =>
                                    handleUpdateQuantity(item, item.quantity - 1)
                                  }
                                  disabled={item.quantity <= 1}
                                  aria-label="Decrease quantity"
                                >
                                  <Minus className="h-4 w-4" />
                                </button>
                                <div className="h-10 w-12 grid place-items-center text-sm font-semibold border-x border-border bg-background">
                                  {item.quantity}
                                </div>
                                <button
                                  className="h-10 w-10 grid place-items-center hover:bg-muted transition"
                                  onClick={() =>
                                    handleUpdateQuantity(item, item.quantity + 1)
                                  }
                                  aria-label="Increase quantity"
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              </div>

                              <div className="text-right">
                                <div className="font-bold">
                                  ৳
                                  {(item.price * item.quantity).toLocaleString()}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  ৳{item.price.toLocaleString()}/unit
                                </div>
                              </div>
                            </div>

                            <button
                              className="w-full h-10 rounded-xl border border-border bg-muted hover:bg-accent transition text-sm font-semibold flex items-center justify-center gap-2"
                              onClick={() => handleRemoveItem(item.id)}
                              aria-label="Remove item"
                            >
                              <Trash2 className="h-4 w-4" />
                              Remove item
                            </button>
                          </div>
                        </div>

                        {/* ✅ Desktop: Qty */}
                        <div className="hidden sm:flex items-center rounded-xl border border-border overflow-hidden bg-background">
                          <button
                            className="h-10 w-10 grid place-items-center hover:bg-muted transition disabled:opacity-40"
                            onClick={() =>
                              handleUpdateQuantity(item, item.quantity - 1)
                            }
                            disabled={item.quantity <= 1}
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <div className="h-10 w-12 grid place-items-center text-sm font-semibold border-x border-border bg-background">
                            {item.quantity}
                          </div>
                          <button
                            className="h-10 w-10 grid place-items-center hover:bg-muted transition"
                            onClick={() =>
                              handleUpdateQuantity(item, item.quantity + 1)
                            }
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>

                        {/* ✅ Desktop: Price + remove */}
                        <div className="hidden sm:flex items-center gap-4">
                          <div className="text-right">
                            <div className="font-bold">
                              ৳{(item.price * item.quantity).toLocaleString()}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              ৳{item.price.toLocaleString()}/unit
                            </div>
                          </div>

                          <button
                            className="h-10 w-10 grid place-items-center rounded-xl hover:bg-muted transition text-muted-foreground hover:text-foreground"
                            onClick={() => handleRemoveItem(item.id)}
                            aria-label="Remove item"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bottom left link */}
                <div className="px-4 sm:px-6 py-5 border-t border-border bg-card/40">
                  <Link
                    href="/"
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Continue Shopping
                  </Link>
                </div>
              </div>

              {/* Coupon Card */}
              {/* <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="p-6">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-muted-foreground">
                      <Tag className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-semibold">Have a Coupon?</div>
                      <div className="text-sm text-muted-foreground">
                        Apply your coupon for an instant discount.
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    {appliedCoupon ? (
                      <div className="rounded-xl border border-border bg-muted/40 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm min-w-0">
                            <span className="font-semibold">
                              {appliedCoupon.code}
                            </span>
                            {appliedCoupon.discountType === "percentage" && (
                              <span className="ml-2 text-muted-foreground">
                                ({appliedCoupon.discountValue}%)
                              </span>
                            )}
                          </div>
                          <button
                            onClick={removeCoupon}
                            className="text-sm text-foreground hover:underline shrink-0"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Coupon applied successfully.
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          placeholder="PROMO / COUPON Code"
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value)}
                          className="rounded-xl input-theme"
                        />
                        <Button
                          onClick={applyCoupon}
                          className="rounded-xl w-full sm:w-auto"
                        >
                          Apply Coupon
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div> */}
            </div>

            {/* Right */}
            <div className="lg:col-span-1">
              <div className="rounded-2xl border border-border bg-card shadow-sm lg:sticky lg:top-6 overflow-hidden">
                <div className="px-6 py-5 border-b border-border bg-card/50">
                  <h2 className="text-lg font-semibold">Order Summary</h2>
                </div>

                <div className="px-6 py-5 space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Sub-Total:</span>
                    <span className="font-semibold">
                      ৳{subtotal.toLocaleString()}
                    </span>
                  </div>

                  {discountAmount > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Discount
                        {appliedCoupon?.discountType === "percentage"
                          ? ` (${appliedCoupon.discountValue}%)`
                          : ""}
                        :
                      </span>
                      <span className="font-semibold">
                        -৳{discountAmount.toLocaleString()}
                      </span>
                    </div>
                  )}

                  {/* <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Shipping:</span>
                    <span className="font-semibold">
                      {shippingCost === 0 ? "Free" : `৳${shippingCost}`}
                    </span>
                  </div> */}

                  <div className="border-t border-border pt-4 flex items-center justify-between">
                    <span className="text-sm font-semibold">Total:</span>
                    <span className="text-xl font-bold">
                      ৳{total.toLocaleString()}
                    </span>
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row gap-3">
                    <Link href="/ecommerce/products" className="flex-1 w-full">
                      <Button variant="outline" className="w-full rounded-xl">
                        <Plus className="mr-2 h-4 w-4" />
                        Add More
                      </Button>
                    </Link>

                    <Button
                      className="flex-1 rounded-xl btn-primary"
                      onClick={handleCheckout}
                      disabled={isCartEmpty}
                    >
                      Checkout
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>

                  <div className="pt-4 border-t border-border">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Secure payment
                      </div>
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4" />
                        Fast delivery
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 text-xs text-muted-foreground">
                Shipping may vary based on location and weight.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
