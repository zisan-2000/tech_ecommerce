"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Heart,
  Minus,
  Plus,
  Truck,
  ShieldCheck,
  RefreshCcw,
  Share2,
  ChevronRight,
  Star,
  Check,
  ChevronLeft,
  X,
  ZoomIn,
  Box, // ← NEW: 3D button icon
} from "lucide-react";
import ProductReviews from "@/components/ecommarce/ProductReviews";
import AddToCartButton from "@/components/ecommarce/AddToCartButton";
import RelatedProducts from "@/components/ecommarce/RelatedProducts";
import VariantSelector from "@/components/ecommarce/VariantSelector";
import { useCart } from "@/components/ecommarce/CartContext";
import { useWishlist } from "@/components/ecommarce/WishlistContext";
import { getVariantMediaMeta } from "@/lib/product-variants";
import { Product, Variant } from "@/types/product";
import { cn } from "@/lib/utils";
import ProductDetailsSkeleton from "./ProductDetailsSkeleton";
import ProductModel3D from "@/components/3dProductModel";

/* ─────────────────── helpers ─────────────────── */
function moneyBDT(n: number) {
  return `৳${Math.round(n).toLocaleString("en-US")}`;
}
function toNumber(v: number | string | null | undefined) {
  const p = typeof v === "number" ? v : Number(v);
  return Number.isFinite(p) ? p : 0;
}
function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<img[^>]+alt="([^"]+)"[^>]*>/g, "$1")
    .replace(/<span[^>]*class="html-span[^"]*"[^>]*>(.*?)<\/span>/g, "$1")
    .replace(/class="[^"]*xexx8yu[^"]*"/g, "")
    .replace(/<img[^>]+src="https:\/\/static\.xx\.fbcdn\.net[^>]*>/g, "")
    .replace(/<script[^>]*>.*?<\/script>/gis, "")
    .replace(/<style[^>]*>.*?<\/style>/gis, "")
    .replace(/on\w+="[^"]*"/g, "");
}
function saveText(price: number, orig: number | null | undefined) {
  if (!orig || orig <= price) return null;
  const diff = orig - price;
  const pct = Math.round((diff / orig) * 100);
  return { amount: moneyBDT(diff), pct };
}
function getDefaultVariant(product: Product | null): Variant | null {
  if (!product?.variants?.length) return null;
  return (
    (product.variants as Variant[]).find(
      (v: any) => v?.active !== false && v?.isDefault && toNumber(v?.stock) > 0,
    ) ??
    (product.variants as Variant[]).find(
      (v: any) => v?.active !== false && v?.isDefault,
    ) ??
    (product.variants as Variant[]).find(
      (v: any) => v?.active !== false && toNumber(v?.stock) > 0,
    ) ??
    (product.variants as Variant[]).find((v: any) => v?.active !== false) ??
    (product.variants as Variant[]).find((v: any) => v?.isDefault) ??
    (product.variants[0] as Variant) ??
    null
  );
}

function normalizeImageList(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) =>
          typeof value === "string" && value.trim() ? value.trim() : "",
        )
        .filter(Boolean),
    ),
  );
}

function getVariantGallery(variant: Variant | null | undefined) {
  if (!variant) return [];
  if (Array.isArray(variant.gallery) && variant.gallery.length > 0) {
    return normalizeImageList(variant.gallery);
  }
  return getVariantMediaMeta(variant.options)?.gallery ?? [];
}

function getVariantDisplayImage(variant: Variant | null | undefined) {
  if (!variant) return null;
  if (typeof variant.colorImage === "string" && variant.colorImage.trim()) {
    return variant.colorImage.trim();
  }
  if (typeof variant.image === "string" && variant.image.trim()) {
    return variant.image.trim();
  }
  const [galleryImage] = getVariantGallery(variant);
  if (galleryImage) return galleryImage;
  return null;
}

/* ─────────────────── sub-components ─────────────────── */
function StarRow({ avg, count }: { avg: number; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={cn(
              "h-3.5 w-3.5",
              i < Math.floor(avg)
                ? "fill-amber-400 text-amber-400"
                : i === Math.floor(avg) && avg % 1 >= 0.5
                  ? "fill-amber-400/50 text-amber-400"
                  : "fill-muted text-muted-foreground/20",
            )}
          />
        ))}
      </div>
      <span className="text-sm font-medium text-foreground">
        {avg.toFixed(1)}
      </span>
      <span className="text-sm text-muted-foreground">({count} reviews)</span>
    </div>
  );
}

function TrustBadge({
  icon: Icon,
  title,
  sub,
}: {
  icon: any;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-3">
      <div className="mt-0.5 shrink-0 rounded-md bg-primary/10 p-1.5">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-[13px] font-semibold text-foreground">{title}</p>
        <p className="text-[12px] text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

/* ─────────────────── main page ─────────────────── */
const MIN_SKELETON_MS = 250;

export default function ProductDetailsPage() {
  const params = useParams<{ id: string }>();
  const routeProductId = typeof params?.id === "string" ? params.id : "";
  return (
    <ProductDetailsContent
      key={routeProductId || "product-details"}
      routeProductId={routeProductId}
    />
  );
}

function ProductDetailsContent({ routeProductId }: { routeProductId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToCart, getQuantityByProductId, incProductQty, decProductQty } =
    useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();

  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<Product | null>(null);
  const [all, setAll] = useState<Product[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [activeImg, setActiveImg] = useState<string | null>(null);
  const [activeThumb, setActiveThumb] = useState(0);
  const [tab, setTab] = useState<"desc" | "spec" | "reviews">("desc");
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [previewVariant, setPreviewVariant] = useState<Variant | null>(null);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  const [isZooming, setIsZooming] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [lightboxPan, setLightboxPan] = useState({ x: 0, y: 0 });
  const [copied, setCopied] = useState(false);
  const [show3D, setShow3D] = useState(false); // ← NEW

  const imgRef = useRef<HTMLDivElement>(null);
  const lightboxDragStartRef = useRef({ x: 0, y: 0 });
  const lightboxPanStartRef = useRef({ x: 0, y: 0 });
  const [isDraggingLightbox, setIsDraggingLightbox] = useState(false);

  useEffect(() => {
    if (searchParams.get("tab") === "reviews") setTab("reviews");
  }, [searchParams]);

  useEffect(() => {
    if (!routeProductId) return;
    let mounted = true;
    (async () => {
      const startedAt = Date.now();
      try {
        setLoading(true);
        setErr(null);
        setShow3D(false); // reset 3D view on product change
        const [detailRes, allRes] = await Promise.all([
          fetch(`/api/products/${routeProductId}?view=storefront`, { cache: "force-cache" }),
          fetch("/api/products?view=storefront", { cache: "force-cache" }),
        ]);
        if (!detailRes.ok) throw new Error("Failed to load product");
        if (!allRes.ok) throw new Error("Failed to load products");
        const detailData = (await detailRes.json()) as Product;
        const data = (await allRes.json()) as unknown[];
        if (!mounted) return;
        const list: Product[] = Array.isArray(data) ? (data as Product[]) : [];
        setAll(list);
        const found =
          detailData && String(detailData.id) === String(routeProductId)
            ? detailData
            : (list.find((i) => String(i.id) === String(routeProductId)) ??
              null);
        if (!found) {
          setErr("Product not found");
          return;
        }
        setProduct(found);
        const iv = getDefaultVariant(found);
        setSelectedVariant(iv);
        setPreviewVariant(iv);
        setActiveImg(
          getVariantDisplayImage(iv) ||
            found.image ||
            (found.gallery?.[0] ?? null),
        );
      } catch (e: any) {
        if (mounted) setErr(e?.message || "Something went wrong");
      } finally {
        const remaining = MIN_SKELETON_MS - (Date.now() - startedAt);
        if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [routeProductId]);

  useEffect(() => {
    if (!product) return;
    if (
      selectedVariant &&
      product.variants?.some((v) => String(v.id) === String(selectedVariant.id))
    )
      return;
    const nextVariant = getDefaultVariant(product);
    setSelectedVariant(nextVariant);
    setPreviewVariant(nextVariant);
  }, [product]);

  const mediaVariant = selectedVariant ?? previewVariant;

  useEffect(() => {
    const nextImages = normalizeImageList([
      getVariantDisplayImage(mediaVariant),
      ...getVariantGallery(mediaVariant),
      product?.image,
      ...(product?.gallery ?? []),
    ]);
    setActiveImg(nextImages[0] ?? null);
    setActiveThumb(0);
  }, [product, mediaVariant]);

  const related = useMemo(() => {
    if (!product) return [];
    const cid = product.categoryId ?? product.category?.id ?? null;
    if (!cid) return [];
    return all
      .filter(
        (i) =>
          (i.categoryId ?? i.category?.id) === cid &&
          i.featured &&
          String(i.id) !== String(product.id),
      )
      .slice(0, 10);
  }, [all, product]);

  const stock = useMemo(() => {
    if (selectedVariant) return toNumber(selectedVariant.stock);
    const variants = product?.variants ?? [];
    if (variants.length)
      return variants.reduce((s, v) => s + toNumber(v.stock), 0);
    return product?.available ? 10 : 0;
  }, [product, selectedVariant]);

  const images = useMemo(() => {
    return normalizeImageList([
      getVariantDisplayImage(mediaVariant),
      ...getVariantGallery(mediaVariant),
      product?.image,
      ...(product?.gallery ?? []),
    ]);
  }, [product, mediaVariant]);

  useEffect(() => {
    if (images.length === 0) {
      setActiveThumb(0);
      if (activeImg !== null) setActiveImg(null);
      return;
    }
    if (!activeImg || !images.includes(activeImg)) {
      setActiveImg(images[0]);
      setActiveThumb(0);
      return;
    }
    setActiveThumb(images.indexOf(activeImg));
  }, [activeImg, images]);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const closeLightbox = () => {
    setLightbox(false);
    setLightboxZoom(1);
    setLightboxPan({ x: 0, y: 0 });
    setIsDraggingLightbox(false);
  };

  const zoomInLightbox = () => setLightboxZoom((p) => Math.min(p + 0.25, 3));
  const zoomOutLightbox = () =>
    setLightboxZoom((p) => {
      const n = Math.max(p - 0.25, 1);
      if (n === 1) setLightboxPan({ x: 0, y: 0 });
      return n;
    });

  const clampLightboxPan = (x: number, y: number, zoom: number) => {
    if (zoom <= 1) return { x: 0, y: 0 };
    const maxOffset = ((zoom - 1) * 80) / 2;
    return {
      x: Math.max(-maxOffset, Math.min(maxOffset, x)),
      y: Math.max(-maxOffset, Math.min(maxOffset, y)),
    };
  };

  const startLightboxDrag = (clientX: number, clientY: number) => {
    if (lightboxZoom <= 1) return;
    lightboxDragStartRef.current = { x: clientX, y: clientY };
    lightboxPanStartRef.current = lightboxPan;
    setIsDraggingLightbox(true);
  };
  const moveLightboxDrag = (clientX: number, clientY: number) => {
    if (!isDraggingLightbox || lightboxZoom <= 1) return;
    const deltaX =
      ((clientX - lightboxDragStartRef.current.x) / window.innerWidth) * 100;
    const deltaY =
      ((clientY - lightboxDragStartRef.current.y) / window.innerHeight) * 100;
    setLightboxPan(
      clampLightboxPan(
        lightboxPanStartRef.current.x + deltaX,
        lightboxPanStartRef.current.y + deltaY,
        lightboxZoom,
      ),
    );
  };
  const stopLightboxDrag = () => setIsDraggingLightbox(false);

  /* ── guards ── */
  if (loading) return <ProductDetailsSkeleton />;
  if (err || !product)
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="max-w-md space-y-4 p-6 text-center">
          <div className="text-5xl">😕</div>
          <h2 className="text-xl font-semibold">
            {err || "Product not found"}
          </h2>
          <button
            onClick={() => router.back()}
            className="rounded-none border border-foreground bg-transparent px-6 py-2.5 text-sm font-semibold uppercase tracking-widest text-foreground transition hover:bg-foreground hover:text-background"
          >
            Go Back
          </button>
        </div>
      </div>
    );

  const displayPrice = selectedVariant
    ? toNumber(selectedVariant.price)
    : toNumber(product.basePrice as any);
  const displayOriginalPrice = selectedVariant
    ? (selectedVariant as any).originalPrice != null
      ? toNumber((selectedVariant as any).originalPrice)
      : product.originalPrice != null
        ? toNumber(product.originalPrice as any)
        : null
    : product.originalPrice != null
      ? toNumber(product.originalPrice as any)
      : null;
  const savings = saveText(displayPrice, displayOriginalPrice);
  const hasMultipleVariants = (product.variants?.length ?? 0) > 1;
  const selectionRequired = hasMultipleVariants && !selectedVariant;
  const purchaseDisabled = selectionRequired || stock <= 0;
  const cartQty = getQuantityByProductId(
    product.id,
    selectedVariant?.id ?? null,
  );
  const inWishlist = isInWishlist(product.id);

  /* ── 3D model path — from product data or fallback ── */
  const modelPath = "/models/snickersModel.glb";
  const has3DModel = true;

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* ── Lightbox — disabled when 3D is active ── */}
      {lightbox && !show3D && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm"
          onClick={closeLightbox}
        >
          <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
            <button
              type="button"
              className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={(e) => {
                e.stopPropagation();
                zoomOutLightbox();
              }}
              disabled={lightboxZoom <= 1}
              aria-label="Zoom out"
            >
              <Minus className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={(e) => {
                e.stopPropagation();
                zoomInLightbox();
              }}
              disabled={lightboxZoom >= 3}
              aria-label="Zoom in"
            >
              <Plus className="h-5 w-5" />
            </button>
            <button
              className="rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
              onClick={closeLightbox}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              const prev = (activeThumb - 1 + images.length) % images.length;
              setActiveThumb(prev);
              setActiveImg(images[prev]);
              setLightboxZoom(1);
              setLightboxPan({ x: 0, y: 0 });
            }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              const next = (activeThumb + 1) % images.length;
              setActiveThumb(next);
              setActiveImg(images[next]);
              setLightboxZoom(1);
              setLightboxPan({ x: 0, y: 0 });
            }}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div
            className="relative flex h-[80vmin] w-[80vmin] items-center justify-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onMouseMove={(e) => {
              e.stopPropagation();
              moveLightboxDrag(e.clientX, e.clientY);
            }}
            onMouseUp={stopLightboxDrag}
            onMouseLeave={stopLightboxDrag}
            onTouchMove={(e) => {
              e.stopPropagation();
              const t = e.touches[0];
              if (!t) return;
              moveLightboxDrag(t.clientX, t.clientY);
            }}
            onTouchEnd={stopLightboxDrag}
          >
            {activeImg && (
              <div
                className="relative h-full w-full transition-transform duration-200"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  startLightboxDrag(e.clientX, e.clientY);
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  const t = e.touches[0];
                  if (!t) return;
                  startLightboxDrag(t.clientX, t.clientY);
                }}
                style={{
                  transform: `translate(${lightboxPan.x}%, ${lightboxPan.y}%) scale(${lightboxZoom})`,
                  cursor:
                    lightboxZoom > 1
                      ? isDraggingLightbox
                        ? "grabbing"
                        : "grab"
                      : "default",
                }}
              >
                <Image
                  src={activeImg}
                  alt={product.name}
                  fill
                  className="object-contain"
                  sizes="80vmin"
                />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* ── Breadcrumb ── */}
        <nav className="mb-6 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="cursor-pointer hover:text-foreground"
            onClick={() => router.push("/")}
          >
            Home
          </span>
          <ChevronRight className="h-3 w-3" />
          <span
            className="cursor-pointer hover:text-foreground"
            onClick={() => router.push("/ecommerce/products")}
          >
            Products
          </span>
          {product.category?.name && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="cursor-pointer hover:text-foreground">
                {product.category.name}
              </span>
            </>
          )}
          <ChevronRight className="h-3 w-3" />
          <span className="min-w-0 line-clamp-1 font-medium text-foreground">
            {product.name}
          </span>
        </nav>

        {/* mobile title block */}
        <div className="mb-5 lg:hidden">
          {product.category?.name && (
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary">
              {product.category.name}
            </p>
          )}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                {product.name}
              </h1>
              {Number(product.ratingCount ?? 0) > 0 && (
                <div className="mt-2">
                  <StarRow
                    avg={Number(product.ratingAvg ?? 0)}
                    count={Number(product.ratingCount ?? 0)}
                  />
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={async () =>
                  inWishlist
                    ? await removeFromWishlist(product.id)
                    : await addToWishlist(product.id)
                }
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border transition",
                  inWishlist
                    ? "border-red-400 bg-red-50 text-red-500 dark:bg-red-950"
                    : "border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground",
                )}
                aria-label="Wishlist"
              >
                <Heart
                  className={cn("h-5 w-5", inWishlist && "fill-current")}
                />
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition hover:border-foreground hover:text-foreground"
                aria-label="Share"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Share2 className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-baseline gap-1">
            <span className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
              {moneyBDT(displayPrice)}
            </span>
            {displayOriginalPrice && displayOriginalPrice > displayPrice && (
              <span className="text-xs text-muted-foreground/70 line-through">
                {moneyBDT(displayOriginalPrice)}
              </span>
            )}
          </div>
        </div>

        {/* ── Main grid ── */}
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
          {/* ────── LEFT: Image Gallery ────── */}
          <div className="min-w-0 space-y-3">
            {/* ── Main image container ── */}
            <div
              ref={imgRef}
              className={cn(
                "group relative aspect-square w-full max-w-full overflow-hidden bg-muted/30",
                // only allow zoom-cursor when NOT in 3D mode
                !show3D && "cursor-zoom-in",
              )}
              onMouseMove={(e) => {
                if (show3D) return; // no zoom tracking in 3D mode
                const { left, top, width, height } =
                  e.currentTarget.getBoundingClientRect();
                setZoomPos({
                  x: ((e.clientX - left) / width) * 100,
                  y: ((e.clientY - top) / height) * 100,
                });
              }}
              onMouseEnter={() => {
                if (!show3D) setIsZooming(true);
              }}
              onMouseLeave={() => setIsZooming(false)}
              onClick={() => {
                if (show3D) return; // don't open lightbox in 3D mode
                setLightboxZoom(1);
                setLightbox(true);
              }}
            >
              {/* Sale badge */}
              {savings && (
                <div className="absolute right-0 top-4 z-10 bg-red-500 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow">
                  {savings.pct}% OFF
                </div>
              )}

              {/* Best seller badge */}
              {product.rank && product.rank <= 3 && (
                <div className="absolute left-0 top-4 z-10 bg-foreground px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-background shadow">
                  Best Seller
                </div>
              )}

              {/* ── 3D View toggle button — top-left ── */}
              {has3DModel && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShow3D((prev) => !prev);
                    setIsZooming(false);
                  }}
                  className={cn(
                    "absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider shadow-sm backdrop-blur-sm transition-all duration-200",
                    show3D
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-primary bg-background/85 text-primary hover:bg-primary/10",
                  )}
                >
                  <Box className="h-3.5 w-3.5" />
                  3D Model
                </button>
              )}

              {/* Hover actions (zoom + wishlist) — only in photo mode */}
              {!show3D && (
                <div className="absolute right-[72px] top-3 z-10 flex gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxZoom(1);
                      setLightbox(true);
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-background/90 shadow backdrop-blur-sm transition hover:scale-105"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      inWishlist
                        ? await removeFromWishlist(product.id)
                        : await addToWishlist(product.id);
                    }}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full bg-background/90 shadow backdrop-blur-sm transition hover:scale-105",
                      inWishlist && "text-red-500",
                    )}
                  >
                    <Heart
                      className={cn("h-4 w-4", inWishlist && "fill-current")}
                    />
                  </button>
                </div>
              )}

              {/* ── Content: 3D viewer OR image ── */}
              {show3D ? (
                /* 3D model viewer fills the container */
                <div
                  className="h-full w-full"
                  onClick={(e) => e.stopPropagation()} // isolate clicks from lightbox trigger
                >
                  <ProductModel3D modelPath={modelPath} />
                </div>
              ) : activeImg ? (
                /* Normal zoom-on-hover image */
                <div
                  className="h-full w-full bg-cover bg-no-repeat transition-[background-size] duration-150"
                  style={{
                    backgroundImage: `url(${activeImg})`,
                    backgroundPosition: isZooming
                      ? `${zoomPos.x}% ${zoomPos.y}%`
                      : "center",
                    backgroundSize: isZooming ? "230%" : "cover",
                  }}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  No Image
                </div>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="scrollbar-hide-on-idle flex w-full max-w-full gap-2 overflow-x-auto pb-1">
                {images.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => {
                      setShow3D(false);
                      setActiveImg(src);
                      setActiveThumb(i);
                    }}
                    className={cn(
                      "relative h-[72px] w-[72px] shrink-0 overflow-hidden border-2 bg-muted/20 transition-all duration-150 sm:h-20 sm:w-20",
                      src === activeImg
                        ? "border-foreground"
                        : "border-transparent hover:border-muted-foreground/40",
                    )}
                  >
                    <Image
                      src={src}
                      alt={`thumb-${i}`}
                      fill
                      className="object-contain p-1"
                      sizes="80px"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ────── RIGHT: Product Info ────── */}
          {/* (unchanged — paste your original right column here) */}
          <div className="min-w-0 flex flex-col gap-5">
            {/* Title + wishlist */}
            <div className="hidden min-w-0 lg:block">
              {product.category?.name && (
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
                  {product.category.name}
                </p>
              )}
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-4 sm:flex-nowrap">
                <h1 className="min-w-0 flex-1 text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-4xl">
                  {product.name}
                </h1>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={async () =>
                      inWishlist
                        ? await removeFromWishlist(product.id)
                        : await addToWishlist(product.id)
                    }
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border transition",
                      inWishlist
                        ? "border-red-400 bg-red-50 text-red-500 dark:bg-red-950"
                        : "border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground",
                    )}
                    aria-label="Wishlist"
                  >
                    <Heart
                      className={cn("h-5 w-5", inWishlist && "fill-current")}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={handleShare}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition hover:border-foreground hover:text-foreground"
                    aria-label="Share"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Share2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              {Number(product.ratingCount ?? 0) > 0 && (
                <div className="mt-2">
                  <StarRow
                    avg={Number(product.ratingAvg ?? 0)}
                    count={Number(product.ratingCount ?? 0)}
                  />
                </div>
              )}
            </div>

            {/* Price block */}
            <div className="hidden border-y border-border/50 bg-gradient-to-r from-muted/30 to-transparent py-6 lg:block">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[22px] font-bold tracking-tight text-primary sm:text-[28px]">
                  {moneyBDT(displayPrice)}
                </span>
                {displayOriginalPrice &&
                  displayOriginalPrice > displayPrice && (
                    <span className="text-[13px] text-muted-foreground line-through sm:text-[14px]">
                      {moneyBDT(displayOriginalPrice)}
                    </span>
                  )}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                {stock > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
                    <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                    In Stock {stock < 10 && `(Only ${stock} left)`}
                  </span>
                ) : selectionRequired ? (
                  <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                    Select a variant
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-500">
                    <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                    Out of Stock
                  </span>
                )}
              </div>
            </div>

            {/* Meta */}
            {(product.brand?.name ||
              product.sku ||
              (selectedVariant as any)?.sku) && (
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {product.brand?.name && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <span>Brand:</span>
                    <span className="font-medium text-foreground">
                      {product.brand.name}
                    </span>
                  </div>
                )}
                {((selectedVariant as any)?.sku || product.sku) && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <span>SKU:</span>
                    <span className="font-medium text-foreground">
                      {(selectedVariant as any)?.sku ?? product.sku}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Variant selector */}
            {(product.variants?.length ?? 0) > 1 && (
              <div>
                <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-foreground">
                  Select Color / Variant
                </p>
                <VariantSelector
                  variants={product.variants ?? []}
                  value={selectedVariant}
                  onPreviewVariant={(v) =>
                    setPreviewVariant(v as Variant | null)
                  }
                  onChange={(v) => {
                    setSelectedVariant(v as Variant | null);
                    if (v) setPreviewVariant(v as Variant);
                  }}
                />
                {selectionRequired && (
                  <p className="mt-2 text-[13px] font-medium text-amber-600">
                    ⚠ Please select a variant to continue
                  </p>
                )}
              </div>
            )}

            {/* Mobile stock status */}
            <div className="lg:hidden">
              {stock > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                  In Stock {stock < 10 && `(Only ${stock} left)`}
                </span>
              ) : selectionRequired ? (
                <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  Select a variant
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-500">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                  Out of Stock
                </span>
              )}
            </div>

            {/* Short description */}
            {product.shortDesc && (
              <div
                className="text-[14px] leading-7 text-muted-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1 [&_p]:mb-2 [&_strong]:font-semibold [&_strong]:text-foreground"
                dangerouslySetInnerHTML={{
                  __html: sanitizeHtml(product.shortDesc),
                }}
              />
            )}

            {/* Quantity + CTA */}
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Qty
                </p>
                <div className="flex items-center border border-border">
                  <button
                    type="button"
                    disabled={purchaseDisabled || cartQty <= 0}
                    onClick={() =>
                      decProductQty(product.id, 1, selectedVariant?.id ?? null)
                    }
                    className="flex h-10 w-10 items-center justify-center text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <div className="flex h-10 w-12 items-center justify-center border-x border-border text-sm font-semibold">
                    {cartQty}
                  </div>
                  <button
                    type="button"
                    disabled={purchaseDisabled}
                    onClick={() =>
                      incProductQty(product.id, 1, selectedVariant?.id ?? null)
                    }
                    className="flex h-10 w-10 items-center justify-center text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                <AddToCartButton
                  productId={product.id}
                  variantId={selectedVariant?.id ?? null}
                  disabled={purchaseDisabled}
                />
                <button
                  type="button"
                  disabled={purchaseDisabled}
                  onClick={() => {
                    if (
                      getQuantityByProductId(
                        product.id,
                        selectedVariant?.id ?? null,
                      ) <= 0
                    ) {
                      addToCart(product.id, 1, selectedVariant?.id ?? null);
                    }
                    router.push("/ecommerce/checkout");
                  }}
                  className="h-11 rounded-lg bg-foreground font-semibold uppercase tracking-widest text-background text-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Buy Now
                </button>
              </div>
            </div>

            {/* Trust badges */}
            <div className="grid grid-cols-3 gap-2">
              <TrustBadge
                icon={Truck}
                title="Fast Delivery"
                sub="Dhaka same day"
              />
              <TrustBadge
                icon={ShieldCheck}
                title="Authentic"
                sub="100% genuine"
              />
              <TrustBadge
                icon={RefreshCcw}
                title="Easy Return"
                sub="7-day policy"
              />
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="mt-12">
          <div className="scrollbar-hide-on-idle flex w-full max-w-full overflow-x-auto border-b border-border">
            {(["desc", "spec", "reviews"] as const).map((t) => {
              const labels = {
                desc: "Description",
                spec: "Delivery & Policy",
                reviews: "Reviews",
              };
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "shrink-0 border-b-2 px-5 py-3 text-sm font-semibold uppercase tracking-wider transition-colors",
                    tab === t
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {labels[t]}
                </button>
              );
            })}
          </div>

          <div className="py-8">
            {tab === "desc" && (
              <div>
                {product.type === "BUNDLE" &&
                  (product as any).bundleItems?.length > 0 && (
                    <div className="mb-8 overflow-hidden rounded-none border border-border">
                      <div className="border-b border-border bg-muted/30 px-5 py-3">
                        <h3 className="text-sm font-bold uppercase tracking-widest">
                          Bundle Contents
                        </h3>
                      </div>
                      <div className="divide-y divide-border">
                        {(product as any).bundleItems.map(
                          (item: any, idx: number) => (
                            <div
                              key={item.id}
                              className="flex items-center gap-4 px-5 py-4"
                            >
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                                {idx + 1}
                              </span>
                              {item.product.image && (
                                <div className="relative h-12 w-12 shrink-0 overflow-hidden border border-border bg-muted/20">
                                  <Image
                                    src={item.product.image}
                                    alt={item.product.name}
                                    fill
                                    className="object-contain p-1"
                                    sizes="48px"
                                  />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="line-clamp-1 text-sm font-medium text-foreground">
                                  {item.product.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Qty: {item.quantity}
                                </p>
                              </div>
                              <p className="shrink-0 text-sm font-semibold text-foreground">
                                {moneyBDT(
                                  toNumber(
                                    item?.product?.basePrice ??
                                      (item?.product as any)?.price,
                                  ) * toNumber(item?.quantity),
                                )}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                      <div className="border-t border-border bg-muted/20 px-5 py-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            Regular total
                          </span>
                          <span className="text-muted-foreground line-through">
                            {moneyBDT(
                              (product as any).bundleItems.reduce(
                                (t: number, i: any) =>
                                  t +
                                  toNumber(
                                    i?.product?.basePrice ??
                                      (i?.product as any)?.price,
                                  ) *
                                    toNumber(i?.quantity),
                                0,
                              ),
                            )}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="font-semibold text-foreground">
                            Bundle price
                          </span>
                          <span className="text-lg font-bold text-green-600">
                            {moneyBDT(displayPrice)}
                          </span>
                        </div>
                        {(product as any).bundleSavings && (
                          <p className="mt-2 text-center text-sm font-medium text-green-600">
                            🎉 You save {(product as any).bundleSavings}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                <div className="prose prose-sm max-w-none dark:prose-invert [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-x-auto [&_table]:block [&_th]:border [&_th]:border-border [&_th]:bg-muted/40 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_img]:max-w-full [&_img]:h-auto [&_p]:mb-3">
                  {product.description ? (
                    <div
                      dangerouslySetInnerHTML={{
                        __html: sanitizeHtml(product.description),
                      }}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No description available.
                    </p>
                  )}
                </div>
              </div>
            )}

            {tab === "spec" && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-none border border-border p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Truck className="h-5 w-5 text-primary" />
                    <h4 className="text-sm font-bold uppercase tracking-wider">
                      Delivery
                    </h4>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Fast delivery available. Same-day delivery for Dhaka city.
                    1–3 days for outside Dhaka.
                  </p>
                </div>
                <div className="rounded-none border border-border p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    <h4 className="text-sm font-bold uppercase tracking-wider">
                      Specifications
                    </h4>
                  </div>
                  <div className="space-y-2 text-sm">
                    {[
                      ["Weight", product.weight ? `${product.weight} kg` : "—"],
                      [
                        "SKU",
                        (selectedVariant as any)?.sku ?? product.sku ?? "—",
                      ],
                      ["Category", product.category?.name ?? "—"],
                    ].map(([k, v]) => (
                      <div
                        key={k}
                        className="flex justify-between border-b border-border/40 pb-2"
                      >
                        <span className="text-muted-foreground">{k}</span>
                        <span className="font-medium text-foreground">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-none border border-border p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <RefreshCcw className="h-5 w-5 text-primary" />
                    <h4 className="text-sm font-bold uppercase tracking-wider">
                      Returns
                    </h4>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    7-day replacement policy as per store rules and product
                    eligibility. Contact support to initiate.
                  </p>
                </div>
              </div>
            )}

            {tab === "reviews" && (
              <ProductReviews productId={Number(product.id)} />
            )}
          </div>
        </div>

        {/* ── Related products ── */}
        {related.length > 0 && (
          <div className="mt-4 border-t border-border pt-10">
            <RelatedProducts
              products={related}
              currentProductId={product.id}
              categoryId={product.categoryId || product.category?.id}
            />
          </div>
        )}
      </div>
      <div className="h-14 sm:hidden" />
    </div>
  );
}
