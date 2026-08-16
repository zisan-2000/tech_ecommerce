// app/ecommerce/bestsellers/page.tsx
"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/components/ecommarce/CartContext";
import { useWishlist } from "@/components/ecommarce/WishlistContext";
import ProductCard from "@/components/ecommarce/ProductCard";
import { useSession } from "@/lib/auth-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* =========================
  Types
========================= */
type ApiVariant = {
  id?: number | string;
  stock?: number | string | null;
  price?: number | string | null;
  currency?: string | null;
};

type ApiProduct = {
  id: number | string;
  name: string;
  slug?: string | null;
  type?: string | null;
  sku?: string | null;
  shortDesc?: string | null;
  description?: string | null;
  basePrice?: number | string | null;
  originalPrice?: number | string | null;
  currency?: string | null;
  available?: boolean | null;
  image?: string | null;

  // categories
  categoryId?: number | null;
  category?: { id: number; name: string } | null;

  // stock
  stock?: number | string | null;
  variants?: ApiVariant[] | null;
};

type ProductUI = {
  id: number;
  name: string;
  slug: string;
  sku: string;
  type: string;
  shortDesc: string;

  image: string;

  price: number;
  originalPrice: number | null;
  discountPct: number;

  categoryId: number | null;

  // ✅ for ProductCard stock behavior
  stock: number | null;
};

type ApiCategory = {
  id: number | string;
  name: string;
  slug?: string | null;
  parentId?: number | string | null;
};

type CategoryNode = {
  id: number;
  name: string;
  parentId: number | null;
  children: CategoryNode[];
};

/* =========================
  Helpers
========================= */
const toNumber = (v: any, fallback = 0) => {
  const n =
    typeof v === "string" ? Number(String(v).replace(/,/g, "")) : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const formatBDT = (v: number) => {
  const rounded = Math.round(v);
  return `৳${rounded.toLocaleString("en-US")}`;
};

function calcDiscountPct(price: number, original: number | null) {
  if (!original || original <= 0) return 0;
  if (price >= original) return 0;
  return Math.round(((original - price) / original) * 100);
}

function computeStock(p: ApiProduct): number | null {
  // priority: variants sum -> variants[0] -> product.stock -> null
  const variants = Array.isArray(p.variants) ? p.variants : [];
  if (variants.length) {
    const sum = variants.reduce((acc, v) => acc + toNumber(v?.stock, 0), 0);
    return Number.isFinite(sum) ? sum : 0;
  }
  if (p.stock !== undefined && p.stock !== null) return toNumber(p.stock, 0);
  return null;
}

function buildCategoryTree(list: ApiCategory[]): CategoryNode[] {
  const map = new Map<number, CategoryNode>();

  for (const c of list) {
    const id = Number(c.id);
    if (!Number.isFinite(id)) continue;

    map.set(id, {
      id,
      name: String(c.name ?? ""),
      parentId:
        c.parentId === null || c.parentId === undefined
          ? null
          : Number(c.parentId),
      children: [],
    });
  }

  const roots: CategoryNode[] = [];

  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRec = (arr: CategoryNode[]) => {
    arr.sort((a, b) => a.name.localeCompare(b.name));
    arr.forEach((x) => sortRec(x.children));
  };
  sortRec(roots);

  return roots;
}

function collectDescendantIds(node: CategoryNode): number[] {
  const out: number[] = [];
  const stack = [...node.children];
  while (stack.length) {
    const cur = stack.pop()!;
    out.push(cur.id);
    if (cur.children?.length) stack.push(...cur.children);
  }
  return out;
}

/* =========================
  Skeleton
========================= */
function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-md bg-muted ${className}`} />
  );
}

function GridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-border bg-card overflow-hidden"
        >
          <div className="p-3 flex items-center justify-between">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
          <div className="px-4 pb-4">
            <Skeleton className="h-40 w-full rounded-lg" />
            <Skeleton className="mt-4 h-4 w-5/6" />
            <Skeleton className="mt-2 h-3 w-3/5" />
            <Skeleton className="mt-4 h-4 w-24" />
            <Skeleton className="mt-4 h-10 w-full rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* =========================
  ✅ Single-track Dual Range
========================= */
function PriceRange({
  min,
  max,
  valueMin,
  valueMax,
  onChangeMin,
  onChangeMax,
  onReset,
}: {
  min: number;
  max: number;
  valueMin: number;
  valueMax: number;
  onChangeMin: (v: number) => void;
  onChangeMax: (v: number) => void;
  onReset: () => void;
}) {
  const range = Math.max(1, max - min);
  const leftPct = ((valueMin - min) / range) * 100;
  const rightPct = 100 - ((valueMax - min) / range) * 100;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Price Range</h3>
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          Reset
        </button>
      </div>

      <div className="relative mt-4 h-6">
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-border" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full bg-primary"
          style={{ left: `${leftPct}%`, right: `${rightPct}%` }}
        />

        <input
          type="range"
          min={min}
          max={max}
          value={valueMin}
          onChange={(e) => onChangeMin(Number(e.target.value))}
          className="range-input"
          style={{ zIndex: 6 }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={valueMax}
          onChange={(e) => onChangeMax(Number(e.target.value))}
          className="range-input"
          style={{ zIndex: 7 }}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-background px-3 py-2">
          <div className="text-[11px] text-muted-foreground">Min</div>
          <div className="text-sm font-semibold text-foreground">
            {formatBDT(valueMin)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-background px-3 py-2">
          <div className="text-[11px] text-muted-foreground">Max</div>
          <div className="text-sm font-semibold text-foreground">
            {formatBDT(valueMax)}
          </div>
        </div>
      </div>

      <div className="mt-3 text-xs text-muted-foreground">
        Range: {formatBDT(valueMin)} - {formatBDT(valueMax)}
      </div>

      <style jsx global>{`
        .range-input {
          -webkit-appearance: none;
          appearance: none;
          position: absolute;
          left: 0;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 100%;
          height: 24px;
          background: transparent;
          outline: none;
        }

        .range-input::-webkit-slider-runnable-track {
          height: 6px;
          background: transparent;
        }

        .range-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          height: 14px;
          width: 14px;
          border-radius: 9999px;
          background: #000;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
          cursor: pointer;
          pointer-events: auto;
        }

        .range-input::-moz-range-track {
          height: 6px;
          background: transparent;
        }

        .range-input::-moz-range-thumb {
          height: 14px;
          width: 14px;
          border-radius: 9999px;
          background: #000;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
          cursor: pointer;
          pointer-events: auto;
        }
      `}</style>
    </div>
  );
}

/**
 * Category Tree Filter
 * - Click row => expand/collapse
 * - Checkbox => select for filtering
 */
function CategoryTreeFilter({
  tree,
  loading,
  selectedIds,
  setSelectedIds,
}: {
  tree: CategoryNode[];
  loading: boolean;
  selectedIds: Set<number>;
  setSelectedIds: Dispatch<SetStateAction<Set<number>>>;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set<number>());

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set<number>(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set<number>(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reset = () => setSelectedIds(new Set<number>());

  const Row = ({ node, level }: { node: CategoryNode; level: number }) => {
    const hasChildren = node.children?.length > 0;
    const isOpen = expanded.has(node.id);
    const isChecked = selectedIds.has(node.id);

    return (
      <div>
        <div
          className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-accent transition cursor-pointer"
          style={{ paddingLeft: 8 + level * 14 }}
          onClick={() => {
            if (hasChildren) toggleExpand(node.id);
          }}
        >
          <span className="w-5 flex items-center justify-center">
            {hasChildren ? (
              isOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )
            ) : (
              <span className="h-4 w-4" />
            )}
          </span>

          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => toggleSelect(node.id)}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 accent-foreground"
          />

          <span className="text-sm text-foreground leading-snug line-clamp-1">
            {node.name}
          </span>
        </div>

        {hasChildren && isOpen && (
          <div className="mt-1 space-y-1">
            {node.children.map((ch) => (
              <Row key={ch.id} node={ch} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Filter By Categories
        </h3>
        <button
          type="button"
          onClick={reset}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          Reset
        </button>
      </div>

      <div className="mt-3 max-h-[320px] overflow-auto pr-1">
        {loading ? (
          <div className="text-sm text-muted-foreground py-2">Loading...</div>
        ) : tree.length === 0 ? (
          <div className="text-sm text-muted-foreground py-2">
            No categories found.
          </div>
        ) : (
          <div className="space-y-1">
            {tree.map((node) => (
              <Row key={node.id} node={node} level={0} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 text-xs text-muted-foreground">
        {selectedIds.size === 0
          ? "All categories selected."
          : `${selectedIds.size} category selected.`}
      </div>
    </div>
  );
}

/* =========================
  Page
========================= */
export default function BestSellingPage() {
  const { addToCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { status } = useSession();

  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [products, setProducts] = useState<ProductUI[]>([]);

  // Filters
  const [inStockOnly, setInStockOnly] = useState(false);
  const [showCount, setShowCount] = useState(20);
  const [sortBy, setSortBy] = useState<
    "default" | "price_low" | "price_high" | "name_az"
  >("default");

  // Price range
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(0);
  const [priceMinBound, setPriceMinBound] = useState(0);
  const [priceMaxBound, setPriceMaxBound] = useState(0);

  // Categories
  const [catTree, setCatTree] = useState<CategoryNode[]>([]);
  const [catLoading, setCatLoading] = useState(false);

  const [selectedCategoryIds, _setSelectedCategoryIds] = useState<Set<number>>(
    new Set<number>(),
  );

  const setSelectedCategoryIds = useCallback(
    (nextOrFn: SetStateAction<Set<number>>) => {
      _setSelectedCategoryIds((prev) => {
        if (typeof nextOrFn === "function") return nextOrFn(prev);
        return nextOrFn;
      });
    },
    [],
  );

  /* =========================
    Load best-selling products
  ========================= */
  useEffect(() => {
    const loadProducts = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/products/top-selling", { cache: "force-cache" });
        if (!res.ok) throw new Error("Failed to load best-selling products");

        const data = (await res.json()) as ApiProduct[];

        const mapped: ProductUI[] = (Array.isArray(data) ? data : []).map((p) => {
          const price = toNumber(p.basePrice, 0);
          const originalRaw =
            p.originalPrice !== null && p.originalPrice !== undefined
              ? toNumber(p.originalPrice, 0)
              : null;
          const original = originalRaw && originalRaw > 0 ? originalRaw : null;

          const discountPct = calcDiscountPct(price, original);

          const cId =
            typeof p.categoryId === "number"
              ? p.categoryId
              : (p.category?.id ?? null);

          const stock = computeStock(p);

          return {
            id: Number(p.id),
            name: String(p.name ?? "Untitled Product"),
            slug: String(p.slug ?? p.id),
            sku: String(p.sku ?? ""),
            type: String(p.type ?? ""),
            shortDesc: String(p.shortDesc ?? p.description ?? ""),
            image: p.image ?? "/placeholder.svg",
            price,
            originalPrice: original,
            discountPct,
            categoryId: cId,
            stock,
          };
        });

        const prices = mapped
          .map((x) => x.price)
          .filter((n) => Number.isFinite(n) && n > 0);

        const minB = prices.length ? Math.floor(Math.min(...prices)) : 0;
        const maxB = prices.length ? Math.ceil(Math.max(...prices)) : 0;

        setProducts(mapped);
        setPriceMinBound(minB);
        setPriceMaxBound(maxB);
        setPriceMin(minB);
        setPriceMax(maxB);
      } catch (e: any) {
        console.error(e);
        setError(e?.message || "Failed to load products.");
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, []);

  /* =========================
    Load categories
  ========================= */
  useEffect(() => {
    const loadCategories = async () => {
      try {
        setCatLoading(true);
        const res = await fetch("/api/categories?view=storefront", { cache: "force-cache" });
        if (!res.ok) {
          setCatTree([]);
          return;
        }

        const data = (await res.json()) as ApiCategory[];
        const tree = buildCategoryTree(Array.isArray(data) ? data : []);
        setCatTree(tree);
      } catch (e) {
        console.error(e);
        setCatTree([]);
      } finally {
        setCatLoading(false);
      }
    };

    loadCategories();
  }, []);

  /* =========================
    Price range handlers
  ========================= */
  const handleMin = useCallback(
    (v: number) => {
      setPriceMin(() => {
        const next = Math.min(v, priceMax - 1);
        return Math.max(priceMinBound, Math.min(next, priceMaxBound));
      });
    },
    [priceMax, priceMinBound, priceMaxBound],
  );

  const handleMax = useCallback(
    (v: number) => {
      setPriceMax(() => {
        const next = Math.max(v, priceMin + 1);
        return Math.max(priceMinBound, Math.min(next, priceMaxBound));
      });
    },
    [priceMin, priceMinBound, priceMaxBound],
  );

  const resetPrice = useCallback(() => {
    setPriceMin(priceMinBound);
    setPriceMax(priceMaxBound);
  }, [priceMinBound, priceMaxBound]);

  /* =========================
    Effective category IDs (include descendants)
  ========================= */
  const effectiveCategoryIds = useMemo(() => {
    if (selectedCategoryIds.size === 0) return null;

    const map = new Map<number, CategoryNode>();
    const walk = (nodes: CategoryNode[]) => {
      for (const n of nodes) {
        map.set(n.id, n);
        if (n.children?.length) walk(n.children);
      }
    };
    walk(catTree);

    const out = new Set<number>();
    for (const id of selectedCategoryIds) {
      out.add(id);
      const node = map.get(id);
      if (node) collectDescendantIds(node).forEach((d) => out.add(d));
    }
    return out;
  }, [selectedCategoryIds, catTree]);

  /* =========================
    Filter + sort (same UX as screenshot)
  ========================= */
  const filtered = useMemo(() => {
    let list = [...products];

    if (effectiveCategoryIds && effectiveCategoryIds.size > 0) {
      list = list.filter(
        (p) => p.categoryId !== null && effectiveCategoryIds.has(p.categoryId),
      );
    }

    // ✅ In Stock filter: stock > 0 only
    if (inStockOnly) {
      list = list.filter((p) => (typeof p.stock === "number" ? p.stock > 0 : true));
    }

    list = list.filter((p) => p.price >= priceMin && p.price <= priceMax);

    if (sortBy === "price_low") list.sort((a, b) => a.price - b.price);
    if (sortBy === "price_high") list.sort((a, b) => b.price - a.price);
    if (sortBy === "name_az") list.sort((a, b) => a.name.localeCompare(b.name));

    return list;
  }, [products, effectiveCategoryIds, inStockOnly, priceMin, priceMax, sortBy]);

  const visible = useMemo(
    () => filtered.slice(0, showCount),
    [filtered, showCount],
  );

  /* =========================
    Actions
  ========================= */
  const toggleWishlist = useCallback(
    async (p: ProductUI) => {
      try {
        if (status !== "authenticated") {
          setLoginModalOpen(true);
          return;
        }

        const already = isInWishlist(p.id);

        if (already) {
          const res = await fetch(`/api/wishlist?productId=${p.id}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error("Failed to remove from wishlist");

          removeFromWishlist(p.id);
          toast.success("Removed from wishlist.");
        } else {
          const res = await fetch("/api/wishlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId: p.id }),
          });
          if (!res.ok) throw new Error("Failed to add to wishlist");

          addToWishlist(p.id);
          toast.success("Added to wishlist.");
        }
      } catch (err) {
        console.error(err);
        toast.error("Wishlist update failed.");
      }
    },
    [status, isInWishlist, addToWishlist, removeFromWishlist],
  );

  const handleAddToCart = useCallback(
    (p: ProductUI) => {
      try {
        // ✅ block add if stock is known and 0
        if (typeof p.stock === "number" && p.stock <= 0) {
          toast.error("This product is out of stock.");
          return;
        }
        addToCart(p.id);
        toast.success(`"${p.name}" added to cart.`);
      } catch (err) {
        console.error(err);
        toast.error("Failed to add to cart.");
      }
    },
    [addToCart],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-6 md:py-8">
        {/* Top bar (same layout) */}
        <div className="mb-4 rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="font-semibold">Best Sellers</div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Show:</span>
                <select
                  value={showCount}
                  onChange={(e) => setShowCount(Number(e.target.value))}
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
                >
                  <option value={20}>20</option>
                  <option value={40}>40</option>
                  <option value={60}>60</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Sort By:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
                >
                  <option value="default">Default</option>
                  <option value="price_low">Price: Low to High</option>
                  <option value="price_high">Price: High to Low</option>
                  <option value="name_az">Name: A-Z</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-2 text-xs text-muted-foreground">
            Showing {Math.min(visible.length, filtered.length)} of{" "}
            {filtered.length} filtered products
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left filters */}
          <aside className="lg:col-span-3 space-y-4">
            <PriceRange
              min={priceMinBound}
              max={priceMaxBound}
              valueMin={priceMin}
              valueMax={priceMax}
              onChangeMin={handleMin}
              onChangeMax={handleMax}
              onReset={resetPrice}
            />

            <CategoryTreeFilter
              tree={catTree}
              loading={catLoading}
              selectedIds={selectedCategoryIds}
              setSelectedIds={setSelectedCategoryIds}
            />

            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground">
                Availability
              </h3>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(e) => setInStockOnly(e.target.checked)}
                  className="h-4 w-4 accent-foreground"
                />
                <span>In Stock</span>
              </label>
            </div>
          </aside>

          {/* Right grid */}
          <main className="lg:col-span-9">
            {loading ? (
              <GridSkeleton count={12} />
            ) : error ? (
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="text-sm text-red-500">{error}</div>
                <Button className="mt-3" onClick={() => window.location.reload()}>
                  Reload
                </Button>
              </div>
            ) : visible.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
                No products found for your filters.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {visible.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={{
                      id: p.id,
                      name: p.name,
                      href: `/ecommerce/products/${p.id}`,
                      image: p.image,
                      price: p.price,
                      originalPrice: p.originalPrice ?? undefined,

                      // ✅ IMPORTANT: stock pass করলে ProductCard out-of-stock perfect হবে
                      stock: p.stock,

                      // you can keep available true; stock will control actual availability inside ProductCard
                      available: true,

                      discountPct: p.discountPct || undefined,
                      sku: p.sku || undefined,
                      type: p.type || undefined,
                      shortDesc: p.shortDesc || undefined,
                    }}
                    wishlisted={isInWishlist(p.id)}
                    onWishlistClick={() => toggleWishlist(p)}
                    onAddToCart={() => handleAddToCart(p)}
                    formatPrice={formatBDT}
                    showMeta
                  />
                ))}
              </div>
            )}
          </main>
        </div>
      </div>

      <Dialog open={loginModalOpen} onOpenChange={setLoginModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Please login first</DialogTitle>
            <DialogDescription>
              You need to be logged in to use the wishlist.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              onClick={() => setLoginModalOpen(false)}
              className="h-10 px-4 rounded-lg border border-border bg-background text-foreground font-semibold hover:bg-accent transition"
            >
              Cancel
            </button>
            <Link
              href="/signin"
              onClick={() => setLoginModalOpen(false)}
              className="h-10 px-4 rounded-lg btn-primary inline-flex items-center justify-center font-semibold transition"
            >
              Login
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
