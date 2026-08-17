"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { useCart } from "@/components/ecommarce/CartContext";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSession, signIn } from "@/lib/auth-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "floating-cart-position";
const BUTTON_WIDTH_MOBILE = 48;
const BUTTON_HEIGHT_MOBILE = 48;
const BUTTON_WIDTH_DESKTOP = 68;
const BUTTON_HEIGHT_DESKTOP = 64;
const EDGE_MARGIN = 0;
const DRAG_THRESHOLD = 6;

type Position = {
  x: number;
  y: number;
};

type CartItemWithVariants = {
  id: string | number;
  productId: string | number;
  variantId?: string | number | null;
  name: string;
  price: number;
  quantity: number;
  image: string;
  variantLabel?: string | null;
  hasVariants?: boolean;
  variants?: any[];
};

type FlyingItem = {
  image: string;
  left: number;
  top: number;
  width: number;
  height: number;
  opacity: number;
  borderRadius: number;
  translateX: number;
  translateY: number;
};

function getButtonSize() {
  if (typeof window === "undefined") {
    return { width: BUTTON_WIDTH_DESKTOP, height: BUTTON_HEIGHT_DESKTOP };
  }

  const isMobile = window.matchMedia("(max-width: 640px)").matches;
  return isMobile
    ? { width: BUTTON_WIDTH_MOBILE, height: BUTTON_HEIGHT_MOBILE }
    : { width: BUTTON_WIDTH_DESKTOP, height: BUTTON_HEIGHT_DESKTOP };
}

function getDefaultPosition(): Position {
  if (typeof window === "undefined") {
    return { x: 0, y: 140 };
  }

  const { width } = getButtonSize();

  return {
    x: window.innerWidth - width - EDGE_MARGIN,
    y: Math.max(120, window.innerHeight - 240),
  };
}

function clampY(y: number) {
  if (typeof window === "undefined") return y;

  const { height } = getButtonSize();
  const maxY = window.innerHeight - height - EDGE_MARGIN;
  return Math.min(Math.max(EDGE_MARGIN, y), maxY);
}

function clampX(x: number) {
  if (typeof window === "undefined") return x;

  const { width } = getButtonSize();
  const maxX = window.innerWidth - width - EDGE_MARGIN;
  return Math.min(Math.max(EDGE_MARGIN, x), maxX);
}

function snapToEdge(x: number, y: number): Position {
  if (typeof window === "undefined") return { x, y };

  const { width } = getButtonSize();
  const middle = window.innerWidth / 2;
  const snappedX =
    x + width / 2 < middle
      ? EDGE_MARGIN
      : window.innerWidth - width - EDGE_MARGIN;

  return {
    x: clampX(snappedX),
    y: clampY(y),
  };
}

function getDrawerSide(x: number): "left" | "right" {
  if (typeof window === "undefined") return "right";

  const { width } = getButtonSize();
  return x + width / 2 < window.innerWidth / 2 ? "left" : "right";
}

export default function FloatingCartButton() {
  const router = useRouter();
  const { cartItems, cartCount, removeFromCart, updateQuantity, addToCart } = useCart();
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";

  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<Position>(getDefaultPosition);
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState(false);
  const [drawerSide, setDrawerSide] = useState<"left" | "right">("right");
  const [animate, setAnimate] = useState(false);
  const [displayCartCount, setDisplayCartCount] = useState(cartCount);
  const [flyingItem, setFlyingItem] = useState<FlyingItem | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string | number>>(new Set());
  const [itemVariants, setItemVariants] = useState<Record<string | number, any[]>>({});
  const [loadingVariants, setLoadingVariants] = useState<Set<string | number>>(new Set());

  const suppressClickRef = useRef(false);
  const animationTimeoutRef = useRef<number | null>(null);
  const animationCleanupRef = useRef<number | null>(null);
  const cartCountRef = useRef(cartCount);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    setMounted(true);

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        const fallback = getDefaultPosition();
        setPosition(fallback);
        setDrawerSide(getDrawerSide(fallback.x));
        return;
      }

      const parsed = JSON.parse(saved) as Position;
      const snapped = snapToEdge(parsed.x, parsed.y);
      setPosition(snapped);
      setDrawerSide(getDrawerSide(snapped.x));
    } catch {
      const fallback = getDefaultPosition();
      setPosition(fallback);
      setDrawerSide(getDrawerSide(fallback.x));
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  }, [mounted, position]);

  useEffect(() => {
    if (!mounted) return;

    const handleResize = () => {
      setPosition((prev) => {
        const snapped = snapToEdge(prev.x, prev.y);
        setDrawerSide(getDrawerSide(snapped.x));
        return snapped;
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [mounted]);

  // Listen for cart-item-added event to trigger animation
  useEffect(() => {
    cartCountRef.current = cartCount;
  }, [cartCount]);

  useEffect(() => {
    if (animationTimeoutRef.current !== null) {
      return;
    }

    setDisplayCartCount(cartCount);
  }, [cartCount]);

  useEffect(() => {
    if (!mounted) return;

    const handleCartItemAdded = (event: CustomEvent<{
      image?: string;
      imageRect?: { left: number; top: number; width: number; height: number };
    }>) => {
      const buttonRect = document
        .querySelector('[aria-label="Open cart drawer"]')
        ?.getBoundingClientRect();

      if (!buttonRect) return;

      if (animationTimeoutRef.current !== null) {
        window.clearTimeout(animationTimeoutRef.current);
      }
      if (animationCleanupRef.current !== null) {
        window.clearTimeout(animationCleanupRef.current);
      }

      const startRect = event.detail?.imageRect ?? {
        left: buttonRect.left,
        top: buttonRect.top,
        width: 180,
        height: 180,
      };
      const targetSize = 52;
      const targetLeft = buttonRect.left + (buttonRect.width - targetSize) / 2;
      const targetTop = buttonRect.top + (buttonRect.height - targetSize) / 2;
      const travelX = buttonRect.left + buttonRect.width / 2 - (startRect.left + startRect.width / 2);
      const travelY = buttonRect.top + buttonRect.height / 2 - (startRect.top + startRect.height / 2);

      setFlyingItem({
        image: event.detail?.image || "/placeholder.svg",
        left: startRect.left,
        top: startRect.top,
        width: startRect.width,
        height: startRect.height,
        opacity: 0.96,
        borderRadius: 14,
        translateX: 0,
        translateY: 0,
      });

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setFlyingItem({
            image: event.detail?.image || "/placeholder.svg",
            left: targetLeft,
            top: targetTop,
            width: targetSize,
            height: targetSize,
            opacity: 0,
            borderRadius: 12,
            translateX: travelX * 0.04,
            translateY: travelY * -0.08,
          });
        });
      });

      animationTimeoutRef.current = window.setTimeout(() => {
        setAnimate(true);
        setDisplayCartCount(cartCountRef.current);
        window.setTimeout(() => setAnimate(false), 850);
        animationTimeoutRef.current = null;
      }, 2325);

      animationCleanupRef.current = window.setTimeout(() => {
        setFlyingItem(null);
        animationCleanupRef.current = null;
      }, 2650);
    };

    window.addEventListener(
      "cart-item-added",
      handleCartItemAdded as EventListener
    );
    return () => {
      window.removeEventListener(
        "cart-item-added",
        handleCartItemAdded as EventListener
      );
      if (animationTimeoutRef.current !== null) {
        window.clearTimeout(animationTimeoutRef.current);
      }
      if (animationCleanupRef.current !== null) {
        window.clearTimeout(animationCleanupRef.current);
      }
    };
  }, [mounted]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const nextX = event.clientX - drag.offsetX;
      const nextY = event.clientY - drag.offsetY;

      if (
        Math.abs(nextX - position.x) > DRAG_THRESHOLD ||
        Math.abs(nextY - position.y) > DRAG_THRESHOLD
      ) {
        drag.moved = true;
        suppressClickRef.current = true;
      }

      setDragging(true);
      setPosition({
        x: clampX(nextX),
        y: clampY(nextY),
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      dragRef.current = null;
      setDragging(false);

      setPosition((prev) => {
        const snapped = snapToEdge(prev.x, prev.y);
        setDrawerSide(getDrawerSide(snapped.x));
        return snapped;
      });

      setTimeout(() => {
        suppressClickRef.current = false;
      }, 150);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [position.x, position.y]);

  const subtotal = useMemo(
    () =>
      cartItems.reduce(
        (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
        0,
      ),
    [cartItems],
  );

  // Check if any cart items have variants that need selection
  const hasUnselectedVariants = useMemo(() => {
    return cartItems.some(item => {
      // Check if this item needs variant selection
      // Items with variantId null/undefined but have variants in the product need selection
      return !item.variantId && item.productId;
    });
  }, [cartItems]);

  const handleCheckout = async () => {
    if (!isAuthenticated) {
      // Store cart items for after login
      sessionStorage.setItem("pendingCheckout", JSON.stringify(cartItems));
      sessionStorage.setItem("redirectAfterLogin", "/ecommerce/checkout");
      toast.info("Please log in to continue to checkout.");
      await signIn(undefined, { callbackUrl: "/ecommerce/checkout" });
      return;
    }

    // Check for items that need variant selection
    if (hasUnselectedVariants) {
      toast.error("Please select variants for all items before checkout.");
      return;
    }

    // If authenticated and no variant issues, proceed to checkout
    setOpen(false);
    router.push("/ecommerce/checkout");
  };

  const fetchItemVariants = async (item: CartItemWithVariants) => {
    if (itemVariants[item.id]) return itemVariants[item.id];
    
    // Add to loading state
    setLoadingVariants(prev => new Set([...prev, item.id]));
    
    try {
      console.log('Fetching variants for product:', item.productId);
      const res = await fetch(`/api/products/${item.productId}?view=storefront`);
      const product = await res.json();
      console.log('Product data:', product);
      
      if (product.variants && product.variants.length > 0) {
        console.log('Found variants:', product.variants);
        setItemVariants(prev => ({
          ...prev,
          [item.id]: product.variants
        }));
        return product.variants;
      } else {
        console.log('No variants found for product');
        toast.info('This product has no variants available');
      }
    } catch (err) {
      console.error('Failed to fetch product variants:', err);
      toast.error('Failed to load product variants');
    } finally {
      // Remove from loading state
      setLoadingVariants(prev => new Set([...prev].filter(id => id !== item.id)));
    }
    return [];
  };

  const handleExpandItem = async (item: CartItemWithVariants) => {
    setExpandedItems(prev => 
      prev.has(item.id) 
        ? new Set([...prev].filter(id => id !== item.id))
        : new Set([...prev, item.id])
    );
    
    // Fetch variants if not already loaded
    if (!itemVariants[item.id] && !item.variantId) {
      await fetchItemVariants(item);
    }
  };

  // Auto-fetch variants for items that need them
  useEffect(() => {
    cartItems.forEach(async (item) => {
      if (!item.variantId && !itemVariants[item.id] && !loadingVariants.has(item.id)) {
        await fetchItemVariants(item);
      }
    });
  }, [cartItems]);

  const handleInlineVariantSelect = (item: CartItemWithVariants, variant: any) => {
    console.log('Selecting variant:', variant, 'for item:', item);
    
    // Remove the item without variant
    removeFromCart(item.id);
    
    // Add the item with variant
    setTimeout(() => {
      console.log('Adding variant to cart:', item.productId, variant.id, item.quantity);
      addToCart(item.productId, item.quantity, variant.id);
      
      // Show success message
      toast.success(`Variant selected: ${getVariantLabel(variant)}`);
      
      // Remove from expanded items
      setExpandedItems(prev => new Set([...prev].filter(id => id !== item.id)));
      
      // Clear cached variants for this item
      setItemVariants(prev => {
        const newVariants = { ...prev };
        delete newVariants[item.id];
        return newVariants;
      });
    }, 100);
  };

  // Helper function to get variant label
  const sanitizeVariantLabel = (label: string | null | undefined) =>
    String(label || "")
      .split(",")
      .map((part) => part.trim())
      .filter(
        (part) =>
          part.length > 0 && !/^__meta\s*:/i.test(part) && part !== "[object Object]",
      )
      .join(", ");

  const getVariantLabel = (variant: any) => {
    if (!variant.options) return variant.sku || "";
    return Object.entries(variant.options)
      .filter(
        ([key, value]) =>
          key !== "__meta" &&
          (typeof value === "string" || typeof value === "number") &&
          String(value).trim(),
      )
      .map(([, value]) => `${value}`)
      .join(", ");
  };

  if (!mounted) return null;

  return (
    <>
      {/* Flying image animation */}
      {flyingItem && (
        <div
          className="fixed pointer-events-none z-[100] overflow-hidden border border-white/70 bg-white/90 shadow-2xl transition-all"
          style={{
            left: flyingItem.left,
            top: flyingItem.top,
            width: flyingItem.width,
            height: flyingItem.height,
            opacity: flyingItem.opacity,
            borderRadius: `${flyingItem.borderRadius}px`,
            transform: `translate(${flyingItem.translateX}px, ${flyingItem.translateY}px)`,
            transitionDuration: "2400ms",
            transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <Image
            src={flyingItem.image || "/placeholder.svg"}
            alt="Flying item"
            fill
            className="object-contain p-1"
          />
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <button
          type="button"
          onPointerDown={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();

            event.preventDefault();

            dragRef.current = {
              pointerId: event.pointerId,
              offsetX: event.clientX - rect.left,
              offsetY: event.clientY - rect.top,
              moved: false,
            };

            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onClick={() => {
            if (suppressClickRef.current) return;
            setOpen(true);
          }}
          style={{
            left: position.x,
            top: position.y,
            touchAction: "none",
          }}
          className={`fixed z-50 flex min-w-[48px] flex-col items-center rounded-xl border border-border bg-primary py-1 md:py-2 text-primary-foreground shadow-lg transition sm:min-w-[68px] sm:px-3 ${
            dragging
              ? "cursor-grabbing scale-105 shadow-2xl"
              : "cursor-grab hover:shadow-xl"
          } ${animate ? "animate-bounce-in" : ""}`}
          aria-label="Open cart drawer"
        >
          <div className="relative">
            <ShoppingBag className="h-4 w-4 sm:h-5 sm:w-5" />
            {displayCartCount > 0 && (
              <span className="absolute -right-2 -top-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground sm:h-5 sm:min-w-[20px] sm:text-[10px]">
                {displayCartCount}
              </span>
            )}
          </div>

          <span className="mt-1 text-[10px] font-medium sm:text-[11px]">Cart</span>
        </button>

        <SheetContent
          side={drawerSide}
          className="w-full border-border p-0 sm:max-w-[420px]"
        >
          <SheetHeader className="border-b bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex w-full items-center justify-between">
              <SheetTitle className="flex gap-2 items-center justify-center text-base font-semibold text-primary-foreground">
                <ShoppingCart width={20}/>
                Cart
              </SheetTitle>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 bg-destructive text-destructive-foreground transition hover:bg-destructive/90"
                aria-label="Close cart drawer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SheetDescription className="hidden">
              Review cart items and continue to checkout.
            </SheetDescription>
          </SheetHeader>

          <div className="flex h-full flex-col bg-background">
            <div className="flex-1 overflow-y-auto px-3 py-4">
              {cartItems.length === 0 ? (
                <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 text-center">
                  <ShoppingBag className="mb-3 h-10 w-10 text-muted-foreground" />
                  <p className="font-medium text-foreground">Your cart is empty</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add some items to continue shopping.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cartItems.map((item) => {
                    const needsVariantSelection = !item.variantId;
                    const isExpanded = expandedItems.has(item.id);
                    return (
                    <div
                      key={`${item.id}-${item.variantId ?? "base"}`}
                      className={`overflow-hidden rounded-md border bg-card ${
                        needsVariantSelection 
                          ? 'border-orange-200 bg-orange-50' 
                          : 'border-border'
                      }`}
                    >
                      <div className="grid grid-cols-[1fr_92px] gap-3 border-b p-3">
                        <div className="min-w-0">
                          <div className="line-clamp-2 text-base font-medium text-foreground">
                            {item.name}
                          </div>
                          {item.variantLabel ? (
                            <div className="mt-1 text-sm text-muted-foreground">
                              {sanitizeVariantLabel(item.variantLabel)}
                            </div>
                          ) : null}
                        </div>
                        <div className="relative h-24 overflow-hidden rounded-md border border-border bg-background">
                          <Image
                            src={item.image || "/placeholder.svg"}
                            alt={item.name}
                            fill
                            className="object-cover"
                          />
                        </div>
                      </div>

                      {/* Variant Selection Section */}
                      {needsVariantSelection && (
                        <div className="border-t border-orange-200 bg-orange-50 p-3">
                          <div className="mb-2">
                            <span className="text-sm font-medium text-orange-800">Select Variant:</span>
                          </div>
                          
                          <div className="mt-3 space-y-2">
                            {loadingVariants.has(item.id) ? (
                              <div className="flex items-center justify-center py-4">
                                <Loader2 className="h-4 w-4 animate-spin text-orange-600 mr-2" />
                                <span className="text-sm text-orange-600">Loading variants...</span>
                              </div>
                            ) : itemVariants[item.id]?.length > 0 ? (
                              itemVariants[item.id].map((variant) => {
                                const outOfStock = variant.stock === 0;
                                return (
                                  <button
                                    key={variant.id}
                                    onClick={() => !outOfStock && handleInlineVariantSelect(item, variant)}
                                    disabled={outOfStock}
                                    className={cn(
                                      "w-full text-left p-3 rounded-lg border transition-all",
                                      outOfStock
                                        ? "border-gray-200 bg-gray-50 cursor-not-allowed opacity-60"
                                        : "border-orange-300 hover:border-orange-400 hover:bg-orange-100"
                                    )}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <div className="h-5 w-5 rounded-full border-2 border-orange-400 flex items-center justify-center">
                                          <div className="h-2 w-2 rounded-full bg-orange-400" />
                                        </div>
                                        <div>
                                          <span className="text-sm font-medium text-orange-800">
                                            {getVariantLabel(variant)}
                                          </span>
                                          {variant.sku && (
                                            <div className="text-xs text-gray-500">SKU: {variant.sku}</div>
                                          )}
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <span className="text-sm font-semibold text-orange-900">
                                          {formatPrice(variant.price)}
                                        </span>
                                        {outOfStock && (
                                          <div className="text-xs text-red-600 font-medium">Out of Stock</div>
                                        )}
                                      </div>
                                    </div>
                                  </button>
                                );
                              })
                            ) : (
                              <div className="text-center py-4 text-sm text-gray-500">
                                No variants available for this product
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-[90px_1fr] border-b border-border px-3 py-2 text-sm">
                        <span className="text-muted-foreground">Price</span>
                        <span className="text-right font-medium text-foreground">
                          {formatPrice(item.price)}
                        </span>
                      </div>

                      <div className="grid grid-cols-[90px_1fr] border-b border-border px-3 py-2 text-sm">
                        <span className="text-muted-foreground">Quantity</span>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(item.id, Math.max(0, item.quantity - 1))
                            }
                            className="rounded border border-border p-1 text-foreground transition hover:bg-accent"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="min-w-8 text-center font-medium text-foreground">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="rounded border border-border p-1 text-foreground transition hover:bg-accent"
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-[90px_1fr_auto] items-center px-3 py-2 text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="text-right font-semibold text-foreground">
                          {formatPrice(item.price * item.quantity)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id)}
                          className="ml-3 rounded bg-destructive/10 p-2 text-destructive transition hover:bg-destructive hover:text-destructive-foreground"
                          aria-label="Remove item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-border bg-card">
              <div className="grid grid-cols-[1fr_auto] items-center px-4 py-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Cart Total
                  </div>
                  <div className="text-lg font-semibold text-foreground">
                    {formatPrice(subtotal)}
                  </div>
                </div>
                <Button
                  onClick={handleCheckout}
                  disabled={cartItems.length === 0 || hasUnselectedVariants}
                  className={`h-12 rounded-none rounded-tr-none rounded-br-none px-6 text-primary-foreground hover:bg-primary disabled:bg-muted disabled:text-muted-foreground sm:rounded-md ${
                    hasUnselectedVariants 
                      ? 'bg-orange-100 text-orange-600 hover:bg-orange-200' 
                      : 'bg-primary'
                  }`}
                >
                  {hasUnselectedVariants ? 'Select Variants' : 'Checkout'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      
          </>
  );
}

function formatPrice(value: number) {
  return `৳ ${Math.round(Number(value) || 0).toLocaleString("en-US")}`;
}
