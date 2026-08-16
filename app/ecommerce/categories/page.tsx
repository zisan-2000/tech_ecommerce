"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Heart, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/components/ecommarce/CartContext";
import { useWishlist } from "@/components/ecommarce/WishlistContext";
import { useSession } from "@/lib/auth-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ProductCardCompact from "@/components/ecommarce/ProductCard";
import SliderNavButton from "@/components/ecommarce/SliderNavButton";

type ApiCategory = {
  id: number | string;
  name: string;
  slug?: string | null;
  image?: string | null;
  parentId?: number | string | null;
  productCount?: number;
  childrenCount?: number;
};

type ApiVariant = {
  stock?: number | string | null;
  options?: Record<string, string | number | null | undefined> | null;
  colorImage?: string | null;
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
  image?: string | null;
  available?: boolean | null;
  categoryId?: number | string | null;
  variants?: ApiVariant[] | null;
};

type ReviewDTO = {
  productId: number | string;
  rating: number | string;
};

type CategoryNode = {
  id: number;
  name: string;
  slug: string;
  image: string | null;
  parentId: number | null;
  productCount: number;
  childrenCount: number;
  children: CategoryNode[];
};

type ProductUI = {
  id: number;
  name: string;
  slug: string;
  price: number;
  originalPrice: number;
  discountPct: number;
  image: string;
  stock: number;
  ratingAvg: number;
  ratingCount: number;
  categoryId: number | null;
  variants?: ApiVariant[] | null;
};

const toNumber = (value: unknown) => {
  const num =
    typeof value === "string" ? Number(value.replace(/,/g, "")) : Number(value);
  return Number.isFinite(num) ? num : 0;
};

const formatPrice = (value: number) =>
  `৳${Math.round(value).toLocaleString("en-US")}`;

function computeStock(variants?: ApiVariant[] | null) {
  const list = Array.isArray(variants) ? variants : [];
  if (!list.length) return 0;
  return list.reduce((sum, variant) => sum + toNumber(variant?.stock), 0);
}

function normalizeReviewsPayload(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.reviews)) return data.reviews;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function buildCategoryTree(categories: ApiCategory[]): CategoryNode[] {
  const map = new Map<number, CategoryNode>();

  categories.forEach((category) => {
    const id = Number(category.id);
    if (!Number.isFinite(id)) return;

    const rawParentId = category.parentId;
    const parentId =
      rawParentId === null || rawParentId === undefined || rawParentId === ""
        ? null
        : Number(rawParentId);

    map.set(id, {
      id,
      name: String(category.name || "Untitled"),
      slug: String(category.slug || category.id),
      image: category.image ?? null,
      parentId: Number.isFinite(parentId) ? parentId : null,
      productCount: toNumber(category.productCount),
      childrenCount: toNumber(category.childrenCount),
      children: [],
    });
  });

  const roots: CategoryNode[] = [];

  map.forEach((node) => {
    if (node.parentId !== null && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
      return;
    }
    roots.push(node);
  });

  const sortTree = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((node) => sortTree(node.children));
  };

  sortTree(roots);
  return roots;
}

function collectDescendantIds(node: CategoryNode): number[] {
  const ids: number[] = [];
  const stack = [...node.children];

  while (stack.length) {
    const current = stack.pop()!;
    ids.push(current.id);
    if (current.children.length) stack.push(...current.children);
  }

  return ids;
}

function CategorySectionSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 3 }).map((_, sectionIndex) => (
        <div key={sectionIndex} className="space-y-3">
          <div className="h-10 rounded-md border border-border bg-card" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((__, cardIndex) => (
              <div
                key={cardIndex}
                className="overflow-hidden rounded-md border border-border bg-card"
              >
                <div className="h-36 animate-pulse bg-muted" />
                <div className="space-y-2 p-3">
                  <div className="h-3 rounded bg-muted" />
                  <div className="h-3 w-3/4 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                  <div className="h-7 w-24 rounded border border-border bg-background" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CategoriesPage() {
  const { addToCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { status } = useSession();
  const searchParams = useSearchParams();

  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [products, setProducts] = useState<ProductUI[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeDepartmentId, setActiveDepartmentId] = useState<number | null>(
    null,
  );
  const [activeChildId, setActiveChildId] = useState<number | null>(null);
  const [activeGrandChildId, setActiveGrandChildId] = useState<number | null>(
    null,
  );

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollByCategories = (dir: "left" | "right") => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const category = el.querySelector<HTMLElement>("[data-category='1']");
    const categoryW = category ? category.offsetWidth : 120;

    el.scrollBy({
      left: dir === "left" ? -categoryW * 1.5 : categoryW * 1.5,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [categoriesRes, productsRes, reviewsRes] = await Promise.all([
          fetch("/api/categories?view=storefront", { cache: "force-cache" }),
          fetch("/api/products?view=storefront", { cache: "force-cache" }),
          fetch("/api/reviews?view=storefront", { cache: "force-cache" }),
        ]);

        if (!categoriesRes.ok || !productsRes.ok || !reviewsRes.ok) {
          throw new Error("Failed to fetch categories/products/reviews");
        }

        const categoriesJson = (await categoriesRes.json()) as ApiCategory[];
        const productsJson = (await productsRes.json()) as ApiProduct[];
        const reviewsJson = await reviewsRes.json();
        const reviewList = normalizeReviewsPayload(reviewsJson) as ReviewDTO[];

        const reviewStats = reviewList.reduce<
          Record<string, { sum: number; count: number }>
        >((acc, review) => {
          const productId = String(review.productId);
          const rating = toNumber(review.rating);
          if (!acc[productId]) acc[productId] = { sum: 0, count: 0 };
          acc[productId].sum += rating;
          acc[productId].count += 1;
          return acc;
        }, {});

        const tree = buildCategoryTree(
          Array.isArray(categoriesJson) ? categoriesJson : [],
        );

        const mappedProducts: ProductUI[] = (
          Array.isArray(productsJson) ? productsJson : []
        ).map((product) => {
          const price = toNumber(product.basePrice);
          const originalPrice = toNumber(
            product.originalPrice || product.basePrice,
          );
          const stock = computeStock(product.variants);
          const discountPct =
            originalPrice > 0 && price < originalPrice
              ? Math.round(((originalPrice - price) / originalPrice) * 100)
              : 0;
          const rating = reviewStats[String(product.id)] ?? {
            sum: 0,
            count: 0,
          };

          return {
            id: Number(product.id),
            name: String(product.name ?? "Untitled Product"),
            slug: String(product.slug ?? product.id),
            price,
            originalPrice,
            discountPct,
            image: product.image ?? "/placeholder.svg",
            stock,
            ratingAvg: rating.count ? rating.sum / rating.count : 0,
            ratingCount: rating.count,
            variants: Array.isArray(product.variants) ? product.variants : [],
            categoryId:
              product.categoryId === null || product.categoryId === undefined
                ? null
                : Number(product.categoryId),
          };
        });

        setCategories(tree);
        setProducts(mappedProducts);
      } catch (fetchError) {
        console.error(fetchError);
        setError("Failed to load categories and products.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Handle URL slug parameter for auto-selecting category
  useEffect(() => {
    if (categories.length === 0) return;

    const slug = searchParams.get('slug');
    if (!slug) return;

    // Find category by slug
    const findCategoryBySlug = (categoryList: CategoryNode[], targetSlug: string): CategoryNode | null => {
      for (const category of categoryList) {
        if (category.slug === targetSlug) {
          return category;
        }
        const foundInChildren = findCategoryBySlug(category.children, targetSlug);
        if (foundInChildren) return foundInChildren;
      }
      return null;
    };

    const targetCategory = findCategoryBySlug(categories, slug);
    if (targetCategory) {
      // Find the root department (parent with parentId === null)
      let rootDepartment = targetCategory;
      while (rootDepartment.parentId !== null && rootDepartment.parentId !== undefined) {
        const parent = categories.find(cat => cat.id === rootDepartment.parentId);
        if (!parent) break;
        rootDepartment = parent;
      }

      // Set the active department
      setActiveDepartmentId(rootDepartment.id);

      // If the target is a child category, set it as active
      if (targetCategory.parentId !== null && targetCategory.parentId !== undefined) {
        const parentDepartment = categories.find(cat => cat.id === rootDepartment.id);
        if (parentDepartment) {
          const childCategory = parentDepartment.children.find(child => child.id === targetCategory.id);
          if (childCategory) {
            setActiveChildId(childCategory.id);
            
            // If the target is a grandchild, set it as active
            if (targetCategory.children.length === 0) {
              // This might be a grandchild, find it in the child's children
              for (const grandChild of childCategory.children) {
                if (grandChild.slug === slug) {
                  setActiveGrandChildId(grandChild.id);
                  break;
                }
              }
            }
          }
        }
      }
    }
  }, [categories, searchParams]);

  const departmentTabs = useMemo(
    () => categories.filter((category) => category.parentId === null),
    [categories],
  );

  useEffect(() => {
    if (!departmentTabs.length) return;

    setActiveDepartmentId((currentId) => {
      if (
        currentId &&
        departmentTabs.some((department) => department.id === currentId)
      ) {
        return currentId;
      }
      return departmentTabs[0].id;
    });
  }, [departmentTabs]);

  const activeDepartment = useMemo(() => {
    if (activeDepartmentId) {
      return (
        departmentTabs.find((category) => category.id === activeDepartmentId) ??
        departmentTabs[0] ??
        null
      );
    }
    return departmentTabs[0] ?? null;
  }, [activeDepartmentId, departmentTabs]);

  const activeChild = useMemo(() => {
    if (!activeDepartment || !activeChildId) return null;
    return (
      activeDepartment.children.find((child) => child.id === activeChildId) ??
      null
    );
  }, [activeChildId, activeDepartment]);

  const activeGrandChild = useMemo(() => {
    if (!activeChild || !activeGrandChildId) return null;
    return (
      activeChild.children.find(
        (grandChild) => grandChild.id === activeGrandChildId,
      ) ?? null
    );
  }, [activeGrandChildId, activeChild]);

  useEffect(() => {
    if (!activeDepartment) {
      setActiveChildId(null);
      setActiveGrandChildId(null);
      return;
    }

    // Always start with "All" selected when department changes
    setActiveChildId(null);
    setActiveGrandChildId(null);
  }, [activeDepartment]);

  useEffect(() => {
    if (!activeChild) {
      setActiveGrandChildId(null);
      return;
    }

    // Always start with "All" selected when child changes
    setActiveGrandChildId(null);
  }, [activeChild]);

  const filteredDepartmentTabs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return departmentTabs;
    return departmentTabs.filter((department) =>
      department.name.toLowerCase().includes(term),
    );
  }, [departmentTabs, searchTerm]);

  const sections = useMemo(() => {
    const sourceDepartments =
      filteredDepartmentTabs.length > 0
        ? filteredDepartmentTabs
        : departmentTabs;

    const visibleDepartments = activeDepartment
      ? sourceDepartments.filter(
          (department) => department.id === activeDepartment.id,
        )
      : sourceDepartments;

    return visibleDepartments
      .map((department) => {
        const categoryIds = new Set<number>([
          department.id,
          ...collectDescendantIds(department),
        ]);

        const childTabs = department.children;
        const grandChildTabs =
          activeChild && department.id === activeDepartment?.id
            ? activeChild.children
            : [];
        const sectionProducts = products.filter((product) => {
          if (product.categoryId === null) return false;
          if (!categoryIds.has(product.categoryId)) return false;

          if (activeGrandChild && department.id === activeDepartment?.id) {
            const activeIds = new Set<number>([
              activeGrandChild.id,
              ...collectDescendantIds(activeGrandChild),
            ]);
            return activeIds.has(product.categoryId);
          }
          if (
            activeChild &&
            department.id === activeDepartment?.id &&
            !activeGrandChild
          ) {
            const activeIds = new Set<number>([
              activeChild.id,
              ...collectDescendantIds(activeChild),
            ]);
            return activeIds.has(product.categoryId);
          }

          return true;
        });

        return {
          department,
          childTabs,
          grandChildTabs,
          products: sectionProducts,
        };
      })
      .filter((section) => section.products.length > 0);
  }, [
    activeGrandChild,
    activeChild,
    activeDepartment,
    departmentTabs,
    filteredDepartmentTabs,
    products,
  ]);

  const handleAddToCart = useCallback(
    (product: ProductUI) => {
      if (product.stock === 0) {
        toast.error("This product is out of stock.");
        return;
      }

      addToCart(product.id);
      toast.success(`"${product.name}" added to cart.`);
    },
    [addToCart],
  );

  const handleWishlist = useCallback(
    async (product: ProductUI) => {
      try {
        if (status !== "authenticated") {
          setLoginModalOpen(true);
          return;
        }

        const alreadyWishlisted = isInWishlist(product.id);

        if (alreadyWishlisted) {
          const res = await fetch(`/api/wishlist?productId=${product.id}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error("Failed to remove from wishlist");

          removeFromWishlist(product.id);
          toast.success("Removed from wishlist.");
          return;
        }

        const res = await fetch("/api/wishlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: product.id }),
        });
        if (!res.ok) throw new Error("Failed to add to wishlist");

        addToWishlist(product.id);
        toast.success("Added to wishlist.");
      } catch (wishlistError) {
        console.error(wishlistError);
        toast.error("Wishlist update failed.");
      }
    },
    [status, isInWishlist, removeFromWishlist, addToWishlist],
  );

  return (
    <div className="min-h-screen bg-background pb-12 text-foreground">
      <div className="container px-4 py-5 sm:p-6">
        <div className="overflow-hidden rounded-md border border-border bg-gradient-to-br from-background to-muted/50 dark:from-card dark:to-muted/20">
          <div className="grid gap-4 p-4 md:grid-cols-[1.2fr_1fr] md:items-center md:p-5">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary shadow-sm dark:bg-primary/20">
                <Sparkles className="h-3.5 w-3.5" />
                Category
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground sm:text-3xl">
                  Browse products by category
                </h1>
                <p className="mt-2 max-w-2xl text-xs text-muted-foreground sm:text-sm">
                  Three-level category filtering with matched product listing,
                  quick add to cart, and wishlist support.
                </p>
              </div>
            </div>

            <div className="relative min-h-[120px] overflow-hidden rounded-md gradient-soft">
              <div className="absolute -right-5 top-0 h-24 w-24 rounded-[24px] bg-primary/30" />
              <div className="absolute right-14 top-7 h-20 w-20 rounded-[18px] bg-accent/40" />
              <div className="absolute bottom-2 right-28 h-16 w-16 rounded-[16px] bg-secondary/30" />
            </div>
          </div>
        </div>

        <div className="sticky top-20 z-40 mt-4 sm:top-28 sm:mt-5">
          <div className="space-y-4 rounded-xl border border-border/60 bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="group/slider relative">
              <div
                className="overflow-x-auto pb-2 scrollbar-hide scroll-smooth"
                ref={scrollContainerRef}
              >
                <div className="flex gap-2 whitespace-nowrap snap-x snap-proximity">
                  {departmentTabs.map((department) => (
                    <button
                      key={department.id}
                      data-category="1"
                      type="button"
                      onClick={() => setActiveDepartmentId(department.id)}
                      className={`snap-start rounded-full border px-3 py-1 text-sm font-medium transition sm:px-4 sm:py-1.5 sm:text-lg ${
                        activeDepartment?.id === department.id
                          ? "border-primary bg-primary text-primary-foreground shadow-lg"
                          : "border-border bg-card text-foreground hover:border-primary hover:bg-primary/5 dark:border-border dark:bg-card dark:text-foreground"
                      }`}
                    >
                      {department.name}
                    </button>
                  ))}
                </div>
              </div>

              {departmentTabs.length > 6 && (
                <>
                  <SliderNavButton
                    direction="left"
                    onClick={() => scrollByCategories("left")}
                  />
                  <SliderNavButton
                    direction="right"
                    onClick={() => scrollByCategories("right")}
                  />
                </>
              )}

              <div className="pointer-events-none absolute left-0 top-0 bottom-2 z-10 w-8 bg-gradient-to-r from-background to-transparent" />
              <div className="pointer-events-none absolute right-0 top-0 bottom-2 z-10 w-8 bg-gradient-to-l from-background to-transparent" />
            </div>

            {/* child categories normal, sticky na */}
            {activeDepartment && activeDepartment.children.length > 0 && (
              <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3 shadow-sm md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-2">
                  {activeDepartment?.children.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => {
                        setActiveChildId(child.id);
                        setActiveGrandChildId(null);
                      }}
                      className={`rounded-full border px-3 py-1 text-xs transition sm:text-sm ${
                        activeChild?.id === child.id
                          ? "border-secondary bg-secondary text-secondary-foreground shadow-md"
                          : "border-border bg-background text-muted-foreground hover:border-secondary hover:bg-secondary/10 dark:border-border dark:bg-background dark:text-muted-foreground"
                      }`}
                    >
                      {child.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* grandchild normal, sticky na */}
            {activeChild && activeChild.children.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveGrandChildId(null)}
                  className={`rounded-full border px-3 py-1 text-xs transition sm:text-sm ${
                    activeGrandChild === null
                      ? "border-accent bg-accent text-accent-foreground shadow-md"
                      : "border-border bg-card text-muted-foreground hover:border-accent hover:bg-accent/10 dark:border-border dark:bg-card dark:text-muted-foreground"
                  }`}
                >
                  All
                </button>
                {activeChild.children.map((grandChild) => (
                  <button
                    key={grandChild.id}
                    type="button"
                    onClick={() => setActiveGrandChildId(grandChild.id)}
                    className={`rounded-full border px-3 py-1 text-xs transition sm:text-sm ${
                      activeGrandChild?.id === grandChild.id
                        ? "border-accent bg-accent text-accent-foreground shadow-md"
                        : "border-border bg-card text-muted-foreground hover:border-accent hover:bg-accent/10 dark:border-border dark:bg-card dark:text-muted-foreground"
                    }`}
                  >
                    {grandChild.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6">
          {loading ? (
            <CategorySectionSkeleton />
          ) : error ? (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : sections.length === 0 ? (
            <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No products found of this category.
            </div>
          ) : (
            <div className="space-y-7">
              {sections.map((section) => (
                <section key={section.department.id} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {section.products.map((product) => (
                      <ProductCardCompact
                        key={product.id}
                        product={{
                          ...product,
                          href: `/ecommerce/products/${product.id}`,
                        }}
                        wishlisted={isInWishlist(product.id)}
                        onWishlistClick={() => handleWishlist(product)}
                        onAddToCart={() => handleAddToCart(product)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={loginModalOpen} onOpenChange={setLoginModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Please login first</DialogTitle>
            <DialogDescription>
              You need to be logged in to use the wishlist.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              onClick={() => setLoginModalOpen(false)}
              className="h-10 rounded-lg border border-border bg-background px-4 font-semibold text-foreground transition hover:bg-accent"
            >
              Cancel
            </button>

            <Link
              href="/signin"
              onClick={() => setLoginModalOpen(false)}
              className="btn-primary inline-flex h-10 items-center justify-center rounded-lg px-4 font-semibold transition"
            >
              Login
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
