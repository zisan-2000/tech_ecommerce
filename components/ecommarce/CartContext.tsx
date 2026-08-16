"use client";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useCallback,
  useMemo,
} from "react";

// API থেকে যেটুকু লাগবে শুধু সেটার টাইপ
interface ProductApiItem {
  id: number | string;
  name: string;
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
};

interface CartContextType {
  cartItems: CartItem[];

  addToCart: (
    productId: string | number,
    quantity?: number,
    variantId?: string | number | null,
    options?: CartAnimationOptions
  ) => void;

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

  // 📚 API থেকে আনা প্রোডাক্ট লিস্ট
  const [products, setProducts] = useState<ProductApiItem[]>([]);

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

  // 🧲 CartProvider মাউন্ট হলে একবারই /api/products থেকে প্রোডাক্ট লোড
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const res = await fetch("/api/products?view=storefront", {
          cache: "force-cache",
        });
        if (!res.ok) {
          console.error("Failed to fetch products for cart:", res.statusText);
          return;
        }

        const data = await res.json();
        if (!Array.isArray(data)) {
          console.error("Invalid products response for cart:", data);
          return;
        }

        const mapped: ProductApiItem[] = data.map((p: any) => ({
          id: p.id,
          name: p.name,
          price: Number(p.basePrice ?? 0), // ✅ use basePrice instead of price
          image: p.image ?? "/placeholder.svg",
          variants: Array.isArray(p.variants)
            ? p.variants.map((variant: any) => ({
                id: variant.id,
                price: Number(variant.price ?? p.basePrice ?? 0),
                sku: variant.sku ?? null,
                options:
                  variant.options && typeof variant.options === "object"
                    ? variant.options
                    : null,
              }))
            : [],
        }));

        setProducts(mapped);
      } catch (err) {
        console.error("Error fetching products for cart:", err);
      }
    };

    loadProducts();
  }, []);

  const cartCount = useMemo(
    () => cartItems.reduce((total, item) => total + (Number(item.quantity) || 0), 0),
    [cartItems]
  );

  // ✅ productId দিয়ে qty read
  const getQuantityByProductId = useCallback(
    (productId: string | number, variantId?: string | number | null) => {
      const pid = norm(productId);
      const vid = normVariant(variantId);
      return (
        cartItems.find(
          (x) =>
            norm(x.productId) === pid && normVariant(x.variantId) === vid
        )?.quantity ?? 0
      );
    },
    [cartItems]
  );

  // ✅ productId দিয়ে qty set (0 => remove)
  const setProductQty = useCallback(
    (productId: string | number, quantity: number, variantId?: string | number | null) => {
      const pid = norm(productId);
      const vid = normVariant(variantId);
      const nextQty = clamp(Number(quantity) || 0);

      setCartItems((prev) => {
        const idx = prev.findIndex(
          (x) => norm(x.productId) === pid && normVariant(x.variantId) === vid
        );

        // remove if 0
        if (nextQty === 0) {
          if (idx === -1) return prev;
          return prev.filter((_, i) => i !== idx);
        }

        // if not exists -> create (needs product)
        if (idx === -1) {
          const product = products.find((p) => norm(p.id) === pid);
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
              id: Date.now(),
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
    [products]
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

  // ✅ FIXED: addToCart always INCREMENT, normalize ids
  const addToCart = useCallback(
    (
      productId: string | number,
      quantity: number = 1,
      variantId?: string | number | null,
      options?: CartAnimationOptions
    ) => {
      const pid = norm(productId);
      const vid = normVariant(variantId);
      const add = clamp(Number(quantity) || 1);
      if (add <= 0) return;

      const product = products.find((p) => norm(p.id) === pid);
      if (!product) {
        console.warn(
          "Product not found in CartProvider products state for id:",
          productId,
          "Available products:",
          products.map((p) => ({ id: p.id, name: p.name, price: p.price }))
        );
        return;
      }

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

      setCartItems((prevItems) => {
        const idx = prevItems.findIndex(
          (item) =>
            norm(item.productId) === pid && normVariant(item.variantId) === vid
        );

        if (idx !== -1) {
          const nextQty = clamp(prevItems[idx].quantity + add);
          return prevItems.map((it, i) => (i === idx ? { ...it, quantity: nextQty } : it));
        }

        return [
          ...prevItems,
          {
            id: Date.now(), // unique row id
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
    },
    [products]
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
