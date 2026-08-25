// components/ecommarce/header.tsx

"use client";

import Link from "next/link";

import Image from "next/image";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import { useTheme } from "next-themes";

import { isDarkLikeTheme } from "@/lib/theme";

import { useSession, signOut } from "@/lib/auth-client";

import { getDashboardRoute } from "@/lib/dashboard-route";

import { cachedFetchJson } from "@/lib/client-cache-fetch";

import SearchSuggestionPanel from "@/components/ecommarce/search/SearchSuggestionPanel";

import { sendSearchEvent } from "@/lib/search/client-analytics";

import type {
  SearchSuggestionLink,
  SearchSuggestionProduct,
  SearchSuggestionResponse,
} from "@/lib/search/core";

import { useCart } from "@/components/ecommarce/CartContext";

import { useWishlist } from "@/components/ecommarce/WishlistContext";

import { useProductCompare } from "@/hooks/use-product-compare";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  Search,
  ShoppingCart,
  Heart,
  User as UserIcon,
  ChevronDown,
  ChevronRight,
  LogIn,
  LogOut,
  LayoutDashboard,
  Newspaper,
  Boxes,
  Sun,
  Moon,
  ChevronLeft,
  Check,
  X,
  Menu,
  BadgePercent,
  GitCompareArrows,
  Monitor,
} from "lucide-react";

const CATEGORIES_API = "/api/categories?view=storefront";

const THEME_OPTIONS = [
  { value: "light", label: "Light" },

  { value: "dark", label: "Dark" },
] as const;

const HEADER_SHOP_ACTIONS = [
  {
    id: "flash-sale",
    label: "Flash Sale",
    href: "/ecommerce/flash-sale",
    description: "View active limited-time deals",
    icon: BadgePercent,
  },
  {
    id: "compare",
    label: "Compare",
    href: "/ecommerce/compare",
    description: "Compare selected products",
    icon: GitCompareArrows,
  },
  {
    id: "pc-builder",
    label: "PC Builder",
    href: "/ecommerce/pc-builder",
    description: "Build a compatible custom desktop PC",
    icon: Monitor,
  },
] as const;

interface CategoryDTO {
  id: number;

  name: string;

  slug: string;

  image?: string | null;

  parentId: number | null;
}

interface CategoryNode extends CategoryDTO {
  children: CategoryNode[];
}

const DESKTOP_CATEGORY_ORDER = [
  "laptop",
  "desktop-pc",
  "components",
  "accessories",
  "monitor",
  "networking",
  "office-equipment",
  "smart-gadget",
  "cameras",
  "television",
  "power",
  "security",
  "gaming",
  "home-appliance",
  "software",
  "servers",
] as const;

function normalizeCategoryList(list: CategoryDTO[]): CategoryDTO[] {
  return Array.isArray(list)
    ? list.map((c: any) => ({
        id: Number(c.id),

        name: String(c.name),

        slug: String(c.slug),

        image: c.image ?? null,

        parentId: (() => {
          const rawParentId = c.parentId ?? c.parent_id;

          const parentId =
            rawParentId === null ||
            rawParentId === undefined ||
            rawParentId === ""
              ? null
              : Number(rawParentId);

          return Number.isFinite(parentId) ? parentId : null;
        })(),
      }))
    : [];
}

type SiteSettings = {
  logo?: string | null;

  siteTitle?: string | null;

  footerDescription?: string | null;

  contactNumber?: string | null;

  contactEmail?: string | null;

  address?: string | null;

  facebookLink?: string | null;

  instagramLink?: string | null;

  twitterLink?: string | null;

  tiktokLink?: string | null;

  youtubeLink?: string | null;
};

function buildCategoryTree(list: CategoryDTO[]): CategoryNode[] {
  const map = new Map<number, CategoryNode>();

  list.forEach((c) => map.set(c.id, { ...c, children: [] }));

  const roots: CategoryNode[] = [];

  map.forEach((node) => {
    if (
      node.parentId !== null &&
      node.parentId !== undefined &&
      map.has(node.parentId)
    ) {
      map.get(node.parentId)!.children.push(node);

      return;
    }

    roots.push(node);
  });

  const sortRec = (arr: CategoryNode[]) => {
    arr.sort((a, b) => a.name.localeCompare(b.name, "bn"));

    arr.forEach((x) => sortRec(x.children));
  };

  sortRec(roots);

  roots.sort((a, b) => {
    const aRank = DESKTOP_CATEGORY_ORDER.indexOf(
      a.slug as (typeof DESKTOP_CATEGORY_ORDER)[number],
    );
    const bRank = DESKTOP_CATEGORY_ORDER.indexOf(
      b.slug as (typeof DESKTOP_CATEGORY_ORDER)[number],
    );
    return (aRank < 0 ? 999 : aRank) - (bRank < 0 ? 999 : bRank);
  });

  return roots;
}

const ddItemBase =
  "w-full flex items-center justify-between px-4 py-2.5 text-sm transition select-none";

const ddItemInactive = "text-popover-foreground hover:bg-muted";

const ddItemActive = "bg-primary text-primary-foreground";

const ddColShell =
  "w-[250px] max-h-[420px] overflow-y-auto overflow-x-hidden bg-popover";

const ddWrapperShell =
  "bg-popover text-popover-foreground border border-border shadow-2xl rounded-xl overflow-hidden";

function DesktopCategoryDropdown({
  categories,

  loading,

  onClose,
}: {
  categories: CategoryNode[];

  loading: boolean;

  onClose: () => void;
}) {
  const router = useRouter();

  const [activeParentId, setActiveParentId] = useState<number | null>(null);

  const [activeSubId, setActiveSubId] = useState<number | null>(null);

  const activeParent = useMemo(
    () => categories.find((c) => c.id === activeParentId) ?? null,

    [categories, activeParentId],
  );

  const subList = activeParent?.children ?? [];

  const activeSub = useMemo(
    () => subList.find((s) => s.id === activeSubId) ?? null,

    [subList, activeSubId],
  );

  const childList = activeSub?.children ?? [];

  useEffect(() => {
    setActiveParentId(null);

    setActiveSubId(null);
  }, [categories.length]);

  const go = (slug: string) => {
    router.push(`/ecommerce/products?category=${encodeURIComponent(slug)}`);

    onClose();
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-popover px-5 py-4 text-sm shadow-2xl">
        Loading...
      </div>
    );
  }

  if (!categories.length) {
    return (
      <div className="rounded-xl border border-border bg-popover px-5 py-4 text-sm shadow-2xl">
        No categories found.
      </div>
    );
  }

  return (
    <div className={ddWrapperShell}>
      <div className="flex">
        <div className={`${ddColShell} border-r border-border`}>
          {categories.map((p) => {
            const isActive = p.id === activeParentId;

            const hasSub = p.children.length > 0;

            return (
              <button
                key={p.id}
                type="button"
                onMouseEnter={() => {
                  setActiveParentId(p.id);

                  setActiveSubId(null);
                }}
                onClick={() => go(p.slug)}
                className={`${ddItemBase} ${
                  isActive ? ddItemActive : ddItemInactive
                }`}
                title={p.name}
              >
                <span className="truncate font-medium">{p.name}</span>

                {hasSub ? <ChevronRight className="h-4 w-4" /> : <span />}
              </button>
            );
          })}
        </div>

        <div
          className={`${ddColShell} border-r border-border ${activeParentId ? "block" : "hidden"}`}
        >
          {subList.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              No subcategories.
            </div>
          ) : (
            subList.map((s) => {
              const isActive = s.id === activeSubId;

              const hasChild = s.children.length > 0;

              return (
                <button
                  key={s.id}
                  type="button"
                  onMouseEnter={() => setActiveSubId(s.id)}
                  onClick={() => go(s.slug)}
                  className={`${ddItemBase} ${
                    isActive ? ddItemActive : ddItemInactive
                  }`}
                  title={s.name}
                >
                  <span className="truncate">{s.name}</span>

                  {hasChild ? <ChevronRight className="h-4 w-4" /> : <span />}
                </button>
              );
            })
          )}
        </div>

        <div className={`${ddColShell} ${activeSubId ? "block" : "hidden"}`}>
          {childList.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              No child categories.
            </div>
          ) : (
            childList.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => go(c.slug)}
                className={`${ddItemBase} ${ddItemInactive}`}
                title={c.name}
              >
                <span className="truncate">{c.name}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function MobileCategoryTree({
  categories,

  loading,

  onGo,
}: {
  categories: CategoryNode[];

  loading: boolean;

  onGo: (slug: string) => void;
}) {
  const [openIds, setOpenIds] = useState<Set<number>>(() => new Set());

  const toggle = (id: number) => {
    setOpenIds((prev) => {
      const next = new Set(prev);

      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 bg-muted/70 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!categories.length) {
    return (
      <div className="text-sm text-muted-foreground">No categories found.</div>
    );
  }

  const Row = ({ node, level }: { node: CategoryNode; level: number }) => {
    const hasChildren = node.children.length > 0;

    const isOpen = openIds.has(node.id);

    const padLeft = 12 + level * 18;

    const markerLeft = padLeft - 9;

    return (
      <div
        data-category-slug={node.slug}
        data-menu-level={level + 1}
        className="relative border-b border-border/50 last:border-b-0"
      >
        {level > 0 && (
          <>
            <span
              className="absolute bottom-0 top-0 w-px bg-border/70"
              style={{ left: markerLeft }}
            />

            <span
              className="absolute h-px w-3 bg-border/70"
              style={{ left: markerLeft, top: 28 }}
            />
          </>
        )}

        <div
          className="flex items-center justify-between gap-3 py-1 transition-colors hover:bg-muted/30"
          style={{ paddingLeft: padLeft, paddingRight: 10 }}
        >
          <button
            type="button"
            onClick={() => onGo(node.slug)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            {node.image && (
              <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border/40">
                <Image
                  src={node.image}
                  alt={node.name}
                  fill
                  className="object-cover"
                  sizes="40px"
                />
              </span>
            )}

            <span className="truncate text-[15px] font-medium text-foreground">
              {node.name}
            </span>
          </button>

          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggle(node.id)}
              aria-expanded={isOpen}
              aria-label={`${isOpen ? "Collapse" : "Expand"} ${node.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
            >
              <ChevronRight
                aria-hidden="true"
                className={`h-5 w-5 transition-transform ${
                  isOpen ? "rotate-90" : ""
                }`}
              />
            </button>
          ) : null}
        </div>

        {hasChildren && isOpen && (
          <div>
            {node.children.map((child) => (
              <Row key={child.id} node={child} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="overflow-hidden bg-card">
      {categories.map((c) => (
        <Row key={c.id} node={c} level={0} />
      ))}
    </div>
  );
}

export default function Header({
  siteSettingsData,
  categoriesData,
}: {
  siteSettingsData?: SiteSettings;
  categoriesData?: CategoryDTO[];
}) {
  const router = useRouter();

  const { data: session } = useSession();

  const { theme, resolvedTheme, setTheme } = useTheme();

  const { cartItems } = useCart();

  const { wishlistCount } = useWishlist();

  const { count: compareCount, href: compareHref } = useProductCompare();

  const [hasMounted, setHasMounted] = useState(false);

  const [isPending, setIsPending] = useState(false);

  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);

    window.addEventListener("scroll", onScroll, { passive: true });

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const [siteSettings, setSiteSettings] = useState<SiteSettings>(
    siteSettingsData ?? {},
  );

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const [cartCount, setCartCount] = useState(0);

  const [searchTerm, setSearchTerm] = useState("");

  const [searchData, setSearchData] =
    useState<SearchSuggestionResponse | null>(null);

  const [searchLoading, setSearchLoading] = useState(false);

  const [searchError, setSearchError] = useState<string | null>(null);

  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);

  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>(() =>
    categoriesData
      ? buildCategoryTree(normalizeCategoryList(categoriesData))
      : [],
  );

  const [categoryLoading, setCategoryLoading] = useState(!categoriesData);

  const [catOpen, setCatOpen] = useState(false);

  const [profileOpen, setProfileOpen] = useState(false);

  const [navHoverCatId, setNavHoverCatId] = useState<number | null>(null);

  const [navMenuPos, setNavMenuPos] = useState<{ left: number; top: number }>({
    left: 0,

    top: 0,
  });

  const catWrapRef = useRef<HTMLDivElement | null>(null);

  const profileRef = useRef<HTMLDivElement | null>(null);

  const navCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navScrollRef = useRef<HTMLDivElement | null>(null);

  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);

  const scrollDesktopNav = (direction: "left" | "right") => {
    const el = navScrollRef.current;

    if (!el) return;

    el.scrollBy({
      left: direction === "left" ? -260 : 260,

      behavior: "smooth",
    });
  };

  useEffect(() => setHasMounted(true), []);

  useEffect(() => {
    const loadSiteSettings = async () => {
      try {
        if (siteSettingsData) {
          setSiteSettings(siteSettingsData);

          return;
        }

        const data = await cachedFetchJson<any>("/api/site?view=storefront", {
          ttlMs: 5 * 60 * 1000,
        });

        setSiteSettings(data);
      } catch (error) {
        console.error("Failed to load site settings:", error);
      }
    };

    loadSiteSettings();
  }, [siteSettingsData]);

  const activeTheme =
    theme === "dark" || resolvedTheme === "dark" ? "dark" : "light";

  const activeThemeOption =
    THEME_OPTIONS.find((option) => option.value === activeTheme) ??
    THEME_OPTIONS[0];

  const darkLikeActiveTheme = isDarkLikeTheme(activeTheme);

  useEffect(() => {
    const total =
      cartItems?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;

    setCartCount(total);
  }, [cartItems]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        if (categoriesData) {
          setCategoryTree(
            buildCategoryTree(normalizeCategoryList(categoriesData)),
          );

          setCategoryLoading(false);

          return;
        }

        setCategoryLoading(true);

        const data = await cachedFetchJson<any[]>(CATEGORIES_API, {
          ttlMs: 5 * 60 * 1000,
        });

        const mapped: CategoryDTO[] = Array.isArray(data)
          ? data.map((c) => ({
              id: Number(c.id),

              name: String(c.name),

              slug: String(c.slug),

              image: c.image ?? null,

              parentId:
                c.parentId === null ||
                c.parentId === undefined ||
                c.parentId === ""
                  ? null
                  : Number(c.parentId),
            }))
          : [];

        setCategoryTree(buildCategoryTree(mapped));
      } catch (err) {
        console.error(err);
      } finally {
        setCategoryLoading(false);
      }
    };

    loadCategories();
  }, [categoriesData]);

  useEffect(() => {
    const query = searchTerm.trim();
    if (query.length < 2) {
      setSearchData(null);
      setSearchError(null);
      setSearchLoading(false);
      setShowSearchDropdown(false);
      setActiveSearchIndex(-1);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      setShowSearchDropdown(true);
      try {
        const response = await fetch(
          `/api/search/suggest?q=${encodeURIComponent(query)}&limit=8`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error(`Search failed (${response.status})`);
        const data = (await response.json()) as SearchSuggestionResponse;
        if (!controller.signal.aborted) {
          setSearchData(data);
          setActiveSearchIndex(-1);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Header search suggestions failed", error);
        setSearchData(null);
        setSearchError(
          "Search is temporarily unavailable. Press Enter to view results.",
        );
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchTerm]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;

      if (catWrapRef.current && !catWrapRef.current.contains(target)) {
        setCatOpen(false);
      }

      if (profileRef.current && !profileRef.current.contains(target)) {
        setProfileOpen(false);
      }

      const el = e.target as HTMLElement;

      if (!el.closest?.(".header-search-wrapper")) {
        setShowSearchDropdown(false);

        setMobileSearchOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);

    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    setMobileSearchOpen(false);

    const prev = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileMenuOpen]);

  const handleSelectProduct = (
    product: SearchSuggestionProduct,
    position: number,
  ) => {
    sendSearchEvent({
      event: "SUGGESTION_CLICKED",
      query: searchData?.query || searchTerm,
      queryId: searchData?.queryId,
      resultCount: searchData?.total,
      productId: product.id,
      position,
    });
    setSearchTerm("");
    setShowSearchDropdown(false);
    setMobileSearchOpen(false);
    router.push(`/ecommerce/products/${product.id}`);
  };

  const submitCatalogSearch = (queryOverride?: string) => {
    const query = (queryOverride ?? searchTerm).trim();
    if (!query) return;
    sendSearchEvent({
      event: "SEARCH_SUBMITTED",
      query,
      queryId: searchData?.queryId,
      resultCount: searchData?.total,
    });
    setShowSearchDropdown(false);
    setMobileSearchOpen(false);
    router.push(`/ecommerce/products?q=${encodeURIComponent(query)}`);
  };

  const handleBrandSelect = (brand: SearchSuggestionLink) => {
    setShowSearchDropdown(false);
    setMobileSearchOpen(false);
    router.push(`/ecommerce/products?brand=${encodeURIComponent(brand.slug)}`);
  };

  const handleCategorySelect = (category: SearchSuggestionLink) => {
    setShowSearchDropdown(false);
    setMobileSearchOpen(false);
    router.push(
      `/ecommerce/products?category=${encodeURIComponent(category.slug)}`,
    );
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const resultCount = searchData?.products.length ?? 0;
    if (e.key === "ArrowDown" && resultCount > 0) {
      e.preventDefault();
      setShowSearchDropdown(true);
      setActiveSearchIndex((current) => (current + 1) % resultCount);
      return;
    }
    if (e.key === "ArrowUp" && resultCount > 0) {
      e.preventDefault();
      setShowSearchDropdown(true);
      setActiveSearchIndex((current) =>
        current <= 0 ? resultCount - 1 : current - 1,
      );
      return;
    }
    if (e.key === "Escape") {
      setShowSearchDropdown(false);
      setActiveSearchIndex(-1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const activeProduct = searchData?.products[activeSearchIndex];
      if (activeProduct) {
        handleSelectProduct(activeProduct, activeSearchIndex + 1);
        return;
      }
      submitCatalogSearch();
    }
  };

  const handleSignOut = async () => {
    setIsPending(true);

    try {
      await signOut();

      router.push("/");

      router.refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setIsPending(false);
    }
  };

  const sessionUser = (session?.user ?? null) as {
    name?: string | null;

    role?: string;

    roleNames?: string[];

    permissions?: string[];

    defaultAdminRoute?: "/admin" | "/admin/warehouse";
  } | null;

  const userName = sessionUser?.name || "User";

  const userRole = sessionUser?.role || "user";

  const displayRole =
    Array.isArray(sessionUser?.roleNames) && sessionUser.roleNames.length > 0
      ? sessionUser.roleNames.join(", ")
      : userRole;

  const dashboardHref = getDashboardRoute(sessionUser);

  const goCategoryFromMobile = (slug: string) => {
    setMobileMenuOpen(false);

    router.push(`/ecommerce/products?category=${encodeURIComponent(slug)}`);
  };

  const goCategoryFromDesktop = (slug: string) => {
    router.push(`/ecommerce/products?category=${encodeURIComponent(slug)}`);
  };

  const getDesktopNavMenuPosition = (rect: DOMRect) => {
    if (typeof window === "undefined") {
      return rect.left;
    }

    const viewportPadding = 12;
    const menuWidth = Math.min(960, window.innerWidth - viewportPadding * 2);
    const moveLeftOffset = Math.min(180, menuWidth / 4);

    const maxLeft = Math.max(
      viewportPadding,
      window.innerWidth - menuWidth - viewportPadding,
    );

    const desiredLeft = rect.left - moveLeftOffset;

    const left = Math.min(Math.max(desiredLeft, viewportPadding), maxLeft);

    return left;
  };
  const headerIconClass =
    "relative flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10 md:h-10 md:w-10 md:rounded-md md:text-white/90 md:hover:bg-white/10 md:hover:text-white";
  const desktopActionClass =
    "hidden h-10 items-center gap-2 rounded-md px-3 text-[13px] font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white lg:flex";

  const hoveredNavCat = useMemo(() => {
    if (navHoverCatId === null) return null;

    return categoryTree.find((c) => c.id === navHoverCatId) ?? null;
  }, [categoryTree, navHoverCatId]);

  const clearNavCloseTimer = useCallback(() => {
    if (navCloseTimerRef.current) {
      clearTimeout(navCloseTimerRef.current);

      navCloseTimerRef.current = null;
    }
  }, []);

  const scheduleNavClose = useCallback(() => {
    clearNavCloseTimer();

    navCloseTimerRef.current = setTimeout(() => {
      setNavHoverCatId(null);
    }, 120);
  }, [clearNavCloseTimer]);

  useEffect(() => {
    if (!mobileSearchOpen) return;

    mobileSearchInputRef.current?.focus();
  }, [mobileSearchOpen]);

  return (
    <header
      className={[
        "sticky top-0 z-50 bg-background/95 backdrop-blur-md text-foreground transition-shadow duration-200",

        scrolled ? "shadow-md" : "shadow-none",
      ].join(" ")}
    >
      <div className="border-b border-slate-800/60 bg-[#0f172a] text-white">
        <div className="container mx-auto flex h-[50px] items-center justify-between gap-3 px-4 md:h-[72px] md:gap-4">
          <Link href="/" className="flex min-w-0 shrink-0 items-center gap-2.5">
            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-white md:h-10 md:w-10">
              <Image
                src={siteSettings.logo || "/assets/examplelogo.jpg"}
                alt="Logo"
                fill
                className="object-contain"
                sizes="(max-width: 767px) 36px, 40px"
              />
            </div>

            <div className="hidden leading-none sm:block">
              <div className="max-w-[190px] truncate text-lg font-semibold tracking-tight text-white">
                {siteSettings.siteTitle || "AanBee"}
              </div>
            </div>
          </Link>

          <div className="header-search-wrapper relative hidden w-full max-w-[560px] md:block">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onFocus={() =>
                searchTerm.trim().length >= 2 && setShowSearchDropdown(true)
              }
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showSearchDropdown}
              aria-controls="desktop-search-suggestions"
              aria-activedescendant={
                activeSearchIndex >= 0 && searchData?.products[activeSearchIndex]
                  ? `desktop-search-suggestions-product-${searchData.products[activeSearchIndex].id}`
                  : undefined
              }
              placeholder="Search products, brands, models..."
              className="h-11 w-full rounded-md border border-white/10 bg-white/95 px-4 pr-12 text-sm text-slate-900 outline-none placeholder:text-slate-400 transition focus:border-white/30 focus:bg-white focus:ring-2 focus:ring-white/20"
            />

            <button
              type="button"
              onClick={() => submitCatalogSearch()}
              className="absolute bottom-0 right-0 top-0 flex w-11 items-center justify-center text-slate-500 transition hover:text-slate-800"
              aria-label="Search"
            >
              <Search className="h-[18px] w-[18px]" />
            </button>

            {showSearchDropdown && (
              <div className="absolute top-full z-[9999] mt-2 w-full">
                <SearchSuggestionPanel
                  id="desktop-search-suggestions"
                  data={searchData}
                  loading={searchLoading}
                  error={searchError}
                  activeIndex={activeSearchIndex}
                  onProductSelect={handleSelectProduct}
                  onQuerySelect={submitCatalogSearch}
                  onBrandSelect={handleBrandSelect}
                  onCategorySelect={handleCategorySelect}
                />
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {HEADER_SHOP_ACTIONS.map((action) => {
              const ActionIcon = action.icon;
              const actionHref =
                action.id === "compare" ? compareHref : action.href;

              return (
                <Link
                  key={action.id}
                  href={actionHref}
                  className={`${desktopActionClass} relative ${
                    action.id === "pc-builder" ? "lg:hidden xl:flex" : ""
                  }`}
                  aria-label={`${action.label}: ${action.description}`}
                  title={action.description}
                >
                  <ActionIcon className="h-[18px] w-[18px]" aria-hidden="true" />
                  <span>{action.label}</span>
                  {action.id === "compare" &&
                  hasMounted &&
                  compareCount > 0 ? (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
                      {compareCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}

            {hasMounted && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`${headerIconClass} hidden xl:flex`}
                    title="Select theme"
                  >
                    {darkLikeActiveTheme ? (
                      <Sun className="h-[18px] w-[18px]" />
                    ) : (
                      <Moon className="h-[18px] w-[18px]" />
                    )}

                    <span className="sr-only">Theme</span>
                  </button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end">
                  {THEME_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => setTheme(option.value)}
                      className="flex items-center justify-between"
                    >
                      <span>{option.label}</span>

                      {activeTheme === option.value ? (
                        <Check className="h-4 w-4" />
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Link
              href="/ecommerce/wishlist"
              className={`${headerIconClass} hidden sm:flex`}
            >
              <Heart className="h-5 w-5" />

              {hasMounted && wishlistCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">
                  {wishlistCount}
                </span>
              )}

              <span className="sr-only">Wishlist</span>
            </Link>

            <div
              className={`header-search-wrapper relative overflow-visible transition-all duration-300 md:hidden ${
                mobileSearchOpen ? "w-[42vw] max-w-[170px]" : "w-10"
              }`}
            >
              <div className="flex h-10 items-center overflow-hidden rounded-full border border-white/15 bg-white/5">
                <button
                  type="button"
                  onClick={() => setMobileSearchOpen((prev) => !prev)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center text-white"
                  aria-label={mobileSearchOpen ? "Close search" : "Open search"}
                >
                  <Search className="h-5 w-5" />
                </button>

                <input
                  ref={mobileSearchInputRef}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  onFocus={() =>
                    searchTerm.trim().length >= 2 && setShowSearchDropdown(true)
                  }
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={showSearchDropdown}
                  aria-controls="mobile-search-suggestions"
                  aria-activedescendant={
                    activeSearchIndex >= 0 && searchData?.products[activeSearchIndex]
                      ? `mobile-search-suggestions-product-${searchData.products[activeSearchIndex].id}`
                      : undefined
                  }
                  placeholder="Search..."
                  className={`h-10 min-w-0 flex-1 bg-transparent pr-3 text-sm text-white outline-none placeholder:text-white/60 transition-all duration-300 ${
                    mobileSearchOpen
                      ? "opacity-100"
                      : "pointer-events-none w-0 opacity-0"
                  }`}
                />
              </div>

              {mobileSearchOpen && showSearchDropdown && (
                <div className="absolute right-0 top-full z-[9999] mt-2 w-[min(92vw,30rem)]">
                  <SearchSuggestionPanel
                    id="mobile-search-suggestions"
                    data={searchData}
                    loading={searchLoading}
                    error={searchError}
                    activeIndex={activeSearchIndex}
                    onProductSelect={handleSelectProduct}
                    onQuerySelect={submitCatalogSearch}
                    onBrandSelect={handleBrandSelect}
                    onCategorySelect={handleCategorySelect}
                  />
                </div>
              )}
            </div>

            {hasMounted && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`${headerIconClass} md:hidden`}
                    title="Select theme"
                    aria-label="Select theme"
                  >
                    {activeThemeOption.value === "light" ? (
                      <Sun className="h-5 w-5" />
                    ) : (
                      <Moon className="h-5 w-5" />
                    )}

                    <span className="hidden">Theme</span>
                  </button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end">
                  {THEME_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => setTheme(option.value)}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="flex items-center gap-2">
                        {option.value === "light" ? (
                          <Sun className="h-4 w-4" />
                        ) : (
                          <Moon className="h-4 w-4" />
                        )}

                        {option.label}
                      </span>

                      {activeTheme === option.value ? (
                        <Check className="h-4 w-4" />
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Link href="/ecommerce/cart" className={headerIconClass}>
              <ShoppingCart className="h-5 w-5" />

              {hasMounted && cartCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">
                  {cartCount}
                </span>
              )}

              <span className="sr-only">Cart</span>
            </Link>

            <div ref={profileRef} className="relative hidden sm:block">
              {hasMounted && session ? (
                <>
                  <button
                    type="button"
                    onClick={() => setProfileOpen((p) => !p)}
                    className={headerIconClass}
                    aria-label="Profile"
                  >
                    {/* User Image or Icon */}
                    <div className="relative h-5 w-5 overflow-hidden rounded-full">
                      {session.user?.image ? (
                        <Image
                          src={session.user.image}
                          alt={userName}
                          fill
                          className="object-cover"
                          sizes="20px"
                        />
                      ) : (
                        <UserIcon className="h-5 w-5" />
                      )}
                    </div>
                    <span className="sr-only">
                      {userName?.split(" ")[0] || "Account"}
                    </span>
                  </button>

                  {profileOpen && (
                    <div className="absolute right-0 mt-3 w-64 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl z-[10001]">
                      {/* User Info Section with Image */}
                      <div className="border-b border-border px-4 py-3">
                        <div className="flex items-center gap-3">
                          {/* User Image */}
                          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-primary ring-2 ring-primary/20">
                            {session.user?.image ? (
                              <Image
                                src={session.user.image}
                                alt={userName}
                                fill
                                className="object-cover"
                                sizes="48px"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-base font-bold text-primary-foreground">
                                {userName?.charAt(0)?.toUpperCase() || "U"}
                              </div>
                            )}
                          </div>

                          {/* User Name and Role */}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">
                              {userName}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {displayRole}
                            </div>
                          </div>
                        </div>
                      </div>

                      <Link
                        href={dashboardHref}
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-muted"
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        Dashboard
                      </Link>

                      <Link
                        href="/ecommerce/user/profile"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-muted"
                      >
                        <UserIcon className="h-4 w-4" />
                        Profile
                      </Link>

                      <button
                        type="button"
                        disabled={isPending}
                        onClick={async () => {
                          setProfileOpen(false);
                          await handleSignOut();
                        }}
                        className="flex w-full items-center gap-2 px-4 py-3 text-sm text-destructive hover:bg-muted disabled:opacity-60"
                      >
                        <LogOut className="h-4 w-4" />
                        Logout
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <Link
                  href="/signin"
                  className={`${headerIconClass} md:w-auto md:px-3`}
                >
                  <UserIcon className="h-5 w-5" />
                  <span className="hidden lg:inline">Login</span>
                </Link>
              )}
            </div>

            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className={`${headerIconClass} md:hidden`}
              aria-label="Open menu"
            >
              <Menu className="h-6 w-6" />

              <span className="hidden">More</span>
            </button>
          </div>
        </div>
      </div>

      <nav className="relative z-[60] hidden border-b border-border bg-background text-foreground md:block">
        <div className="container relative mx-auto overflow-visible px-4">
          <div className="group/nav relative">
            <button
              type="button"
              onClick={() => scrollDesktopNav("left")}
              className="absolute left-0 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition-all duration-200 opacity-0 pointer-events-none group-hover/nav:opacity-100 group-hover/nav:pointer-events-auto hover:bg-muted active:scale-95"
              aria-label="Scroll categories left"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => scrollDesktopNav("right")}
              className="absolute right-0 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition-all duration-200 opacity-0 pointer-events-none group-hover/nav:opacity-100 group-hover/nav:pointer-events-auto hover:bg-muted active:scale-95"
              aria-label="Scroll categories right"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <div
              ref={navScrollRef}
              className="mx-8 flex h-11 items-center gap-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onMouseLeave={scheduleNavClose}
              onMouseEnter={clearNavCloseTimer}
            >
              {categoryTree.map((cat) => (
                <div
                  key={cat.id}
                  className="relative shrink-0 group"
                  onMouseEnter={(e) => {
                    clearNavCloseTimer();

                    setNavHoverCatId(cat.children.length > 0 ? cat.id : null);

                    const rect = (
                      e.currentTarget as HTMLDivElement
                    ).getBoundingClientRect();

                    const left = getDesktopNavMenuPosition(rect);

                    setNavMenuPos({ left, top: rect.bottom });
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      goCategoryFromDesktop(cat.slug);
                    }}
                    className="flex h-11 items-center gap-1 whitespace-nowrap px-3 text-[13px] font-medium text-foreground/80 transition-colors hover:text-foreground"
                  >
                    <span>{cat.name}</span>

                    {cat.children.length > 0 && (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-hover:rotate-180" />
                    )}
                  </button>

                  <div className="absolute bottom-0 left-3 right-3 h-[2px] origin-left scale-x-0 bg-foreground transition-transform duration-200 group-hover:scale-x-100" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {hoveredNavCat && hoveredNavCat.children.length > 0 && (
          <div
            className="fixed z-[10000]"
            style={{ left: navMenuPos.left, top: navMenuPos.top }}
            onMouseEnter={clearNavCloseTimer}
            onMouseLeave={scheduleNavClose}
          >
            <div className="w-[min(960px,calc(100vw-24px))] overflow-visible rounded-b-lg border border-border bg-popover text-popover-foreground shadow-xl animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Explore category
                  </p>
                  <p className="mt-0.5 text-base font-semibold">
                    {hoveredNavCat.name}
                  </p>
                </div>
                <Link
                  href={`/ecommerce/products?category=${encodeURIComponent(hoveredNavCat.slug)}`}
                  onClick={() => setNavHoverCatId(null)}
                  className="text-sm font-medium text-foreground/70 hover:text-foreground"
                >
                  View all
                </Link>
              </div>

              <div className="grid grid-cols-3 gap-x-8 gap-y-1 p-4">
                {hoveredNavCat.children.map((sub, index) => {
                  const hasChildren = sub.children.length > 0;
                  const opensToLeft = index % 3 === 2;

                  return (
                    <div
                      key={sub.id}
                      data-category-slug={sub.slug}
                      data-menu-level="2"
                      className="group/sub relative min-w-0 hover:z-20 focus-within:z-20"
                    >
                      <Link
                        href={`/ecommerce/products?category=${encodeURIComponent(sub.slug)}`}
                        onClick={() => setNavHoverCatId(null)}
                        className="group/item flex min-h-10 items-center justify-between gap-3 rounded-md px-2.5 py-2 text-[13px] font-medium text-foreground/90 transition hover:bg-muted"
                      >
                        <span className="truncate">{sub.name}</span>
                        {hasChildren && (
                          <ChevronRight
                            aria-hidden="true"
                            className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover/item:translate-x-0.5"
                          />
                        )}
                      </Link>

                      {hasChildren && (
                        <div
                          data-menu-level="3"
                          aria-label={`${sub.name} subcategories`}
                          className={`pointer-events-none invisible absolute top-0 z-30 w-72 rounded-lg border border-border bg-popover p-2 opacity-0 shadow-xl transition duration-150 group-hover/sub:pointer-events-auto group-hover/sub:visible group-hover/sub:opacity-100 group-focus-within/sub:pointer-events-auto group-focus-within/sub:visible group-focus-within/sub:opacity-100 ${
                            opensToLeft
                              ? "right-[calc(100%-0.25rem)]"
                              : "left-[calc(100%-0.25rem)]"
                          }`}
                        >
                          <div className="mb-1 flex items-center justify-between gap-3 border-b border-border px-2 py-2">
                            <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {sub.name}
                            </span>
                            <Link
                              href={`/ecommerce/products?category=${encodeURIComponent(sub.slug)}`}
                              onClick={() => setNavHoverCatId(null)}
                              className="shrink-0 text-xs font-medium text-foreground/70 hover:text-foreground"
                            >
                              View all
                            </Link>
                          </div>

                          <div className="max-h-72 space-y-0.5 overflow-y-auto">
                            {sub.children.map((child) => (
                              <Link
                                key={child.id}
                                href={`/ecommerce/products?category=${encodeURIComponent(child.slug)}`}
                                onClick={() => setNavHoverCatId(null)}
                                data-category-slug={child.slug}
                                data-menu-level="3-item"
                                className="flex min-h-9 items-center rounded-md px-2.5 py-2 text-sm text-foreground/80 transition hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground"
                              >
                                <span className="truncate">{child.name}</span>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </nav>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[9999] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close menu overlay"
            onClick={() => setMobileMenuOpen(false)}
          />

          <div className="absolute right-0 top-0 flex h-screen w-[85vw] max-w-[360px] flex-col overflow-hidden border-l border-border bg-background text-foreground shadow-2xl">
            <div className="shrink-0 border-b border-border px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <Link
                  href="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex min-w-0 items-center gap-3"
                >
                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                    <Image
                      src={siteSettings.logo || "/assets/examplelogo.jpg"}
                      alt="Logo"
                      fill
                      className="object-contain"
                      sizes="44px"
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="max-w-[190px] truncate text-xl text-primary font-lexend">
                      {siteSettings.siteTitle || "AanBee"}
                    </div>

                    <div className="truncate text-xs text-muted-foreground">
                      {siteSettings.footerDescription || "E-Commerce"}
                    </div>
                  </div>
                </Link>

                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-2 pb-4 pt-2">
              {/* Navigation Items */}

              <div className="grid grid-cols-3 gap-2">
                <Link
                  href="/ecommerce/blogs"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-11 items-center justify-center rounded-lg border border-border bg-card text-foreground/80 transition hover:border-primary/40 hover:bg-muted hover:text-foreground"
                  aria-label="Blog"
                  title="Blog"
                >
                  <Newspaper className="h-[18px] w-[18px]" />
                </Link>

                <Link
                  href="/ecommerce/wishlist"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-11 items-center justify-center rounded-lg border border-border bg-card text-foreground/80 transition hover:border-primary/40 hover:bg-muted hover:text-foreground"
                  aria-label="Wishlist"
                  title="Wishlist"
                >
                  <Heart className="h-[18px] w-[18px]" />
                </Link>

                <Link
                  href="/ecommerce/cart"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-11 items-center justify-center rounded-lg border border-border bg-card text-foreground/80 transition hover:border-primary/40 hover:bg-muted hover:text-foreground"
                  aria-label="Cart"
                  title="Cart"
                >
                  <ShoppingCart className="h-[18px] w-[18px]" />
                </Link>
              </div>

              <section aria-labelledby="mobile-shop-shortcuts-heading">
                <h2
                  id="mobile-shop-shortcuts-heading"
                  className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  Shop shortcuts
                </h2>

                <div className="grid grid-cols-3 gap-2">
                  {HEADER_SHOP_ACTIONS.map((action) => {
                    const ActionIcon = action.icon;
                    const actionHref =
                      action.id === "compare" ? compareHref : action.href;

                    return (
                      <Link
                        key={action.id}
                        href={actionHref}
                        onClick={() => setMobileMenuOpen(false)}
                        className="relative flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card px-2 py-3 text-center text-foreground transition hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`${action.label}: ${action.description}`}
                      >
                        <ActionIcon
                          className="h-5 w-5 text-primary"
                          aria-hidden="true"
                        />
                        <span className="text-[11px] font-bold leading-tight">
                          {action.label}
                        </span>
                        {action.id === "compare" &&
                        hasMounted &&
                        compareCount > 0 ? (
                          <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground shadow-sm">
                            {compareCount}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </section>

              {/* Categories */}

              <div>
                <MobileCategoryTree
                  categories={categoryTree}
                  loading={categoryLoading}
                  onGo={goCategoryFromMobile}
                />
              </div>
            </div>

            {hasMounted && (
              <div className="shrink-0 border-t border-border bg-background/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur">
                {session ? (
                  <div className="flex items-center gap-3 rounded-xl bg-card/90 px-3 py-2.5 shadow-sm">
                    {/* User Image or Avatar */}
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-primary">
                      {session.user?.image ? (
                        <Image
                          src={session.user.image}
                          alt={userName}
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm font-bold text-primary-foreground">
                          {userName?.charAt(0)?.toUpperCase() || "U"}
                        </div>
                      )}
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">
                              {userName}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {displayRole}
                            </span>
                          </span>
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>

                      <DropdownMenuContent
                        align="start"
                        side="top"
                        className="w-48"
                      >
                        <DropdownMenuItem asChild>
                          <Link
                            href={dashboardHref}
                            onClick={() => setMobileMenuOpen(false)}
                            className="flex items-center gap-2"
                          >
                            <LayoutDashboard className="h-4 w-4" />
                            Dashboard
                          </Link>
                        </DropdownMenuItem>

                        <DropdownMenuItem asChild>
                          <Link
                            href="/ecommerce/user/profile"
                            onClick={() => setMobileMenuOpen(false)}
                            className="flex items-center gap-2"
                          >
                            <UserIcon className="h-4 w-4" />
                            Profile
                          </Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <button
                      type="button"
                      disabled={isPending}
                      onClick={async () => {
                        setMobileMenuOpen(false);
                        await handleSignOut();
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted text-destructive hover:bg-destructive hover:text-destructive-foreground disabled:opacity-60"
                      aria-label="Sign out"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      router.push("/signin");
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
                  >
                    <LogIn className="h-5 w-5" />
                    Login
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
