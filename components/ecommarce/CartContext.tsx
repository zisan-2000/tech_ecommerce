"use client";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";

// API থেকে যেটুকু লাগবে শুধু সেটার টাইপ
interface ProductApiItem {
  id: number | string;
  name: string;
  type?: string | null;
  price: number;
  image?: string | null;
  variants?: Array<{
    id: number | string;
    price?: number;
    sku?: string | null;
    options?: Record<string, string> | null;
  }>;
}

export interface CartItem {
  id: string | number; // local row id
  productId: string | number; // product id
  variantId?: string | number | null;
  name: string;
  price: number;
  quantity: number;
  image: string;
  variantLabel?: string | null;
  pcBuildId?: string | null;
  pcBuildSlot?: string | null;
}

type CartAnimationRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type CartAnimationOptions = {
  startX?: number;
  startY?: number;
  image?: string;
  imageRect?: CartAnimationRect;
  product?: ProductApiItem;
  pcBuilder?: boolean;
};

interface CartContextType {
  cartItems: CartItem[];

  addToCart: (
    productId: string | number,
    quantity?: number,
    variantId?: string | number | null,
    options?: CartAnimationOptions
  ) => Promise<boolean>;

  // row-id based
  removeFromCart: (id: string | number) => void;
  updateQuantity: (id: string | number, quantity: number) => void;

  // product-id based helpers ✅ (for +/- in details page)
  getQuantityByProductId: (
    productId: string | number,
    variantId?: string | number | null
  ) => number;
  setProductQty: (
    productId: string | number,
    quantity: number,
    variantId?: string | number | null
  ) => void;
  incProductQty: (
    productId: string | number,
    step?: number,
    variantId?: string | number | null
  ) => void;
  decProductQty: (
    productId: string | number,
    step?: number,
    variantId?: string | number | null
  ) => void;

  clearCart: () => void;
  cartCount: number;

  // external replace (server sync / cart page sync)
  replaceCart: (items: CartItem[]) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const norm = (v: string | number) => String(v);
const normVariant = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? "" : String(v);
const clamp = (n: number) => Math.max(0, Math.min(99, n));
let cartRowSequence = 0;
const createCartRowId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${++cartRowSequence}`;

export function CartProvider({ children }: { children: ReactNode }) {
  // 🛒 cartItems -> localStorage synced
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("cartItems");
        return saved ? JSON.parse(saved) : [];
      } catch (e) {
        console.error("Failed to parse cartItems from localStorage:", e);
        return [];
      }
    }
    return [];
  });

  // Product snapshots are populated only for products the shopper interacts with.
  const productCacheRef = useRef(new Map<string, ProductApiItem>());

  // ✅ safer replace (also normalize + sanitize)
  const replaceCart = useCallback((items: CartItem[]) => {
    const safe = Array.isArray(items)
      ? items
          .filter((x) => x && x.productId != null)
          .map((x) => ({
            ...x,
            productId: x.productId,
            variantId: x.variantId ?? null,
            quantity: clamp(Number(x.quantity ?? 1)),
            image: x.image || "/placeholder.svg",
            pcBuildId: x.pcBuildId ?? null,
            pcBuildSlot: x.pcBuildSlot ?? null,
          }))
      : [];
    setCartItems(safe);
  }, []);

  // cartItems localStorage এ sync
  useEffect(() => {
    try {
      localStorage.setItem("cartItems", JSON.stringify(cartItems));
    } catch (e) {
      console.error("Failed to save cartItems to localStorage:", e);
    }
  }, [cartItems]);

  // 🔁 অন্য ট্যাব বা কোড থেকে localStorage change হলে অটো sync
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "cartItems") {
        try {
          if (!e.newValue) {
            setCartItems([]);
            return;
          }
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setCartItems(parsed);
          else setCartItems([]);
        } catch (err) {
          console.error("Failed to sync cartItems from storage event:", err);
          setCartItems([]);
        }
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const cartCount = useMemo(
    () => cartItems.reduce((total, item) => total + (Number(item.quantity) || 0), 0),
    [cartItems]
  );

  // ✅ productId দিয়ে qty read (standard cart rows only)
  const getQuantityByProductId = useCallback(
    (productId: string | number, variantId?: string | number | null) => {
      const pid = norm(productId);
      const vid = normVariant(variantId);
      return (
        cartItems.find(
          (x) =>
            !x.pcBuildId &&
            norm(x.productId) === pid &&
            normVariant(x.variantId) === vid
        )?.quantity ?? 0
      );
    },
    [cartItems]
  );

  // ✅ productId দিয়ে qty set (0 => remove), standard rows only
  const setProductQty = useCallback(
    (productId: string | number, quantity: number, variantId?: string | number | null) => {
      const pid = norm(productId);
      const vid = normVariant(variantId);
      const nextQty = clamp(Number(quantity) || 0);

      setCartItems((prev) => {
        const idx = prev.findIndex(
          (x) =>
            !x.pcBuildId &&
            norm(x.productId) === pid &&
            normVariant(x.variantId) === vid
        );

        // remove if 0
        if (nextQty === 0) {
          if (idx === -1) return prev;
          return prev.filter((_, i) => i !== idx);
        }

        // if not exists -> create (needs product)
        if (idx === -1) {
          const product = productCacheRef.current.get(pid);
          if (!product) return prev;
          const variant =
            vid !== ""
              ? product.variants?.find((item) => norm(item.id) === vid) ?? null
              : null;
          const variantLabel =
            variant?.options && Object.keys(variant.options).length > 0
              ? Object.entries(variant.options)
                  .map(([key, value]) => `${key}: ${String(value)}`)
                  .join(", ")
              : variant?.sku ?? null;

          return [
            ...prev,
            {
              id: createCartRowId(),
              productId: product.id,
              variantId: variant?.id ?? null,
              name: product.name,
              price: Number(variant?.price ?? product.price),
              quantity: nextQty,
              image: product.image || "/placeholder.svg",
              variantLabel,
            },
          ];
        }

        // update existing
        return prev.map((it, i) => (i === idx ? { ...it, quantity: nextQty } : it));
      });
    },
    []
  );

  const incProductQty = useCallback(
    (productId: string | number, step: number = 1, variantId?: string | number | null) => {
      const cur = getQuantityByProductId(productId, variantId);
      setProductQty(productId, cur + (Number(step) || 1), variantId);
    },
    [getQuantityByProductId, setProductQty]
  );

  const decProductQty = useCallback(
    (productId: string | number, step: number = 1, variantId?: string | number | null) => {
      const cur = getQuantityByProductId(productId, variantId);
      setProductQty(productId, cur - (Number(step) || 1), variantId);
    },
    [getQuantityByProductId, setProductQty]
  );

  // ✅ addToCart increments standard rows, but PC Builder keeps one row per build.
  const addToCart = useCallback(
    async (
      productId: string | number,
      quantity: number = 1,
      variantId?: string | number | null,
      options?: CartAnimationOptions
    ) => {
      const pid = norm(productId);
      const vid = normVariant(variantId);
      const add = clamp(Number(quantity) || 1);
      if (add <= 0) return false;

      let product = options?.product ?? productCacheRef.current.get(pid);
      if (!product) {
        try {
          const response = await fetch(`/api/products/${encodeURIComponent(pid)}?view=storefront`, {
            cache: "force-cache",
          });
          if (response.ok) {
            const data = await response.json();
            product = {
              id: data.id,
              name: String(data.name || "Product"),
              type: data.type ?? null,
              price: Number(data.basePrice ?? 0),
              image: data.image ?? "/placeholder.svg",
              variants: Array.isArray(data.variants)
                ? data.variants.map((variant: any) => ({
                    id: variant.id,
                    price: Number(variant.price ?? data.basePrice ?? 0),
                    sku: variant.sku ?? null,
                    options:
                      variant.options && typeof variant.options === "object"
                        ? variant.options
                        : null,
                  }))
                : [],
            };
          }
        } catch (error) {
          console.error("Failed to load product for cart:", error);
        }
      }
      if (!product) {
        console.warn("Product could not be loaded for cart:", productId);
        return false;
      }
      productCacheRef.current.set(pid, product);

      const requestedVariant =
        vid !== ""
          ? product.variants?.find((item) => norm(item.id) === vid) ?? null
          : null;
      const variant =
        product.type === "BUNDLE"
          ? requestedVariant ?? product.variants?.[0] ?? null
          : requestedVariant;
      const cartVariantKey = normVariant(variant?.id ?? null);
      const variantLabel =
        variant?.options && Object.keys(variant.options).length > 0
          ? Object.entries(variant.options)
              .map(([key, value]) => `${key}: ${String(value)}`)
              .join(", ")
          : variant?.sku ?? null;

      const fromPcBuilder =
        options?.pcBuilder ??
        (typeof window !== "undefined" &&
          window.location.pathname.includes("/pc-builder"));
      let pcBuildId: string | null = null;
      let pcBuildSlot: string | null = null;

      if (fromPcBuilder) {
        try {
          const response = await fetch("/api/cart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              productId: product.id,
              variantId: variant?.id ?? null,
              quantity: 1,
              pcBuilder: true,
            }),
          });
          const data = await response.json().catch(() => null);
          if (response.ok) {
            pcBuildId = typeof data?.pcBuildId === "string" ? data.pcBuildId : null;
            pcBuildSlot = typeof data?.pcBuildSlot === "string" ? data.pcBuildSlot : null;
          } else if (response.status !== 401) {
            console.error("Failed to persist PC Builder cart row:", data?.error || response.status);
            return false;
          }
        } catch (error) {
          console.error("Failed to sync PC Builder cart row:", error);
          return false;
        }
      }

      if (!fromPcBuilder) {
        try {
          const response = await fetch("/api/cart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              productId: product.id,
              variantId: variant?.id ?? null,
              quantity: add,
            }),
          });
          if (!response.ok && response.status !== 401) {
            const data = await response.json().catch(() => null);
            console.error(
              "Failed to persist cart row:",
              data?.error || response.status,
            );
          }
        } catch (error) {
          console.error("Failed to sync cart row:", error);
        }
      }

      setCartItems((prevItems) => {
        if (fromPcBuilder) {
          if (pcBuildId) {
            const existingBuildRow = prevItems.find(
              (item) =>
                item.pcBuildId === pcBuildId &&
                norm(item.productId) === pid &&
                normVariant(item.variantId) === cartVariantKey,
            );
            if (existingBuildRow) return prevItems;
          }
          return [
            ...prevItems,
            {
              id: createCartRowId(),
              productId: product.id,
              variantId: variant?.id ?? null,
              name: product.name,
              price: Number(variant?.price ?? product.price),
              quantity: 1,
              image: product.image || "/placeholder.svg",
              variantLabel,
              pcBuildId,
              pcBuildSlot,
            },
          ];
        }

        const idx = prevItems.findIndex(
          (item) =>
            !item.pcBuildId &&
            norm(item.productId) === pid &&
            normVariant(item.variantId) === cartVariantKey
        );

        if (idx !== -1) {
          const nextQty = clamp(prevItems[idx].quantity + add);
          return prevItems.map((it, i) => (i === idx ? { ...it, quantity: nextQty } : it));
        }

        return [
          ...prevItems,
          {
            id: createCartRowId(),
            productId: product.id,
            variantId: variant?.id ?? null,
            name: product.name,
            price: Number(variant?.price ?? product.price),
            quantity: add,
            image: product.image || "/placeholder.svg",
            variantLabel,
          },
        ];
      });

      // Dispatch custom event to trigger animation on FloatingCartButton
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("cart-item-added", {
          detail: {
            startX: options?.startX,
            startY: options?.startY,
            image: options?.image || product.image || "/placeholder.svg",
            imageRect: options?.imageRect,
          },
        }));
      }
      return true;
    },
    []
  );

  const removeFromCart = useCallback((id: string | number) => {
    setCartItems((prevItems) => prevItems.filter((item) => item.id !== id));
  }, []);

  // ✅ quantity < 1 হলে remove
  const updateQuantity = useCallback((id: string | number, quantity: number) => {
    const q = clamp(Number(quantity) || 0);
    setCartItems((prev) => {
      if (q <= 0) return prev.filter((x) => x.id !== id);
      return prev.map((item) => (item.id === id ? { ...item, quantity: q } : item));
    });
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
  }, []);

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        cartCount,
        replaceCart,

        // ✅ NEW helpers
        getQuantityByProductId,
        setProductQty,
        incProductQty,
        decProductQty,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
