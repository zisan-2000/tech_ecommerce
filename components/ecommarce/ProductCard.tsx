"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Eye,
  Flame,
  GitCompareArrows,
  Heart,
  Loader2,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "@/components/ecommarce/CartContext";

type ProductVariant = {
  id?: number | string;
  stock?: number | string | null;
  price?: number | string | null;
  sku?: string | null;
  image?: string | null;
  options?: Record<string, string | number | null | undefined> | null;
  color?: string | null;
  colour?: string | null;
  colorImage?: string | null;
  hex?: string | null;
  swatch?: string | null;
};

export type ProductCardData = {
  id: number | string;
  name: string;
  href: string;
  image?: string | null;
  price: number;
  originalPrice?: number | null;
  stock?: number | null;
  ratingAvg?: number | null;
  ratingCount?: number | null;
  discountPct?: number;
  sku?: string;
  type?: string;
  variants?: ProductVariant[] | null;
  shortDesc?: string;
  specifications?: Array<{
    label: string;
    value: string;
  }>;
  available?: boolean;
  totalSold?: number | null;
  rank?: number | null;
  bundleItems?: Array<{
    product: {
      id: number;
      name: string;
      image?: string | null;
    };
    quantity: number;
  }>;
  bundleItemCount?: number;
  bundleSavings?: string;
  bundleStockLimit?: number | string;
};

type Props = {
  product: ProductCardData;
  wishlisted?: boolean;
  wishlistMode?: string;
  showMeta?: boolean;
  addToCartLabel?: string;
  primaryAction?: "add-to-cart" | "view-details";
  onWishlistClick?: () => void | Promise<void>;
  onCompareClick?: () => void | Promise<void>;
  compared?: boolean;
  onAddToCart?: () => void | Promise<unknown>;
  formatPrice?: (value: number) => string;
  className?: string;
  imagePriority?: boolean;
};

const defaultFormatPrice = (value: number) =>
  `৳${Math.round(value).toLocaleString("en-US")}`;

const HEX_COLOR_REGEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const CSS_COLOR_FUNCTION_REGEX = /^(?:rgb|rgba|hsl|hsla)\(/i;
const COLOR_NAME_TO_HEX: Record<string, string> = {
  black: "#262626",
  white: "#f5f5f4",
  gray: "#9ca3af",
  grey: "#9ca3af",
  silver: "#c0c0c0",
  red: "#dc2626",
  maroon: "#7f1d1d",
  burgundy: "#6d1f2f",
  blue: "#2563eb",
  sky: "#38bdf8",
  green: "#16a34a",
  olive: "#6b8e23",
  mint: "#86efac",
  yellow: "#eab308",
  gold: "#b48a2c",
  orange: "#f59e0b",
  brown: "#8b5e3c",
  coffee: "#6f4e37",
  beige: "#d6c1a2",
  cream: "#eee6d8",
  tan: "#b08968",
  pink: "#ec4899",
  purple: "#7c3aed",
};

function resolveSwatchColor(value: string) {
  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue) return null;

  if (
    HEX_COLOR_REGEX.test(normalizedValue) ||
    CSS_COLOR_FUNCTION_REGEX.test(normalizedValue)
  ) {
    return value.trim();
  }

  const matchedEntry = Object.entries(COLOR_NAME_TO_HEX).find(([token]) =>
    normalizedValue.includes(token),
  );

  return matchedEntry?.[1] ?? "#9ca3af";
}

function getVariantMetaImage(variant: ProductVariant) {
  const options = variant.options as unknown;
  if (!options || typeof options !== "object") return null;
  const meta = (options as any)?.__meta;
  const img = meta?.image;
  return typeof img === "string" && img.trim() ? img.trim() : null;
}

function getColorSwatches(variants?: ProductVariant[] | null) {
  if (!Array.isArray(variants) || variants.length === 0) return [];

  const swatches = new Map<
    string,
    { label: string; color: string; image: string | null }
  >();

  variants.forEach((variant) => {
    const optionColor = Object.entries(variant.options ?? {}).find(
      ([key, value]) =>
        /colou?r/i.test(key) && typeof value === "string" && value.trim(),
    )?.[1];

    const labelSource = [
      optionColor,
      variant.color,
      variant.colour,
      variant.hex,
      variant.swatch,
    ].find((value) => typeof value === "string" && value.trim());

    if (typeof labelSource !== "string" || !labelSource.trim()) return;

    const label = labelSource.trim();
    const color = resolveSwatchColor(label);
    if (!color) return;

    const image =
      typeof variant.colorImage === "string" && variant.colorImage.trim()
        ? variant.colorImage.trim()
        : typeof variant.image === "string" && variant.image.trim()
          ? variant.image.trim()
          : getVariantMetaImage(variant);

    const dedupeKey = label.toLowerCase();
    if (!swatches.has(dedupeKey)) {
      swatches.set(dedupeKey, { label, color, image });
    } else if (image && !swatches.get(dedupeKey)?.image) {
      swatches.set(dedupeKey, {
        label,
        color,
        image,
      });
    }
  });

  return Array.from(swatches.values());
}

function cleanProductText(value: string) {
  return value
    .replace(/<\s*li[^>]*>/gi, " | ")
    .replace(/<\s*br\s*\/?\s*>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function getProductHighlights(product: ProductCardData) {
  const specifications = (product.specifications ?? [])
    .map((item) => ({
      label: cleanProductText(String(item.label ?? "")),
      value: cleanProductText(String(item.value ?? "")),
    }))
    .filter((item) => item.label && item.value)
    .slice(0, 4);

  if (specifications.length > 0) return specifications;

  const description = cleanProductText(product.shortDesc ?? "");
  if (!description) return [];

  return description
    .split(/\s*\|\s*|[•\n]+|\.\s+/)
    .map((value) => value.replace(/\.$/, "").trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((value) => ({ label: "", value }));
}

export default function ProductCardCompact({
  product,
  wishlisted = false,
  onWishlistClick,
  onCompareClick,
  compared = false,
  onAddToCart,
  formatPrice = defaultFormatPrice,
  addToCartLabel = "Add To Cart",
  primaryAction = "add-to-cart",
  className,
  imagePriority = false,
}: Props) {
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [buttonAnimate, setButtonAnimate] = useState(false);
  const [activeVariantImage, setActiveVariantImage] = useState<string | null>(
    null,
  );
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const { addToCart } = useCart();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const imageFrameRef = useRef<HTMLDivElement>(null);

  const hasStockSignal =
    product.type === "BUNDLE"
      ? (product.bundleStockLimit !== undefined &&
          product.bundleStockLimit !== null) ||
        (product.stock !== undefined && product.stock !== null) ||
        product.available !== undefined
      : (product.stock !== undefined && product.stock !== null) ||
        product.available !== undefined;
  const effectiveStock =
    product.type === "BUNDLE"
      ? Number(product.bundleStockLimit ?? product.stock ?? 0)
      : Number(product.stock ?? 0);

  const isOutOfStock =
    product.available === false || (hasStockSignal && effectiveStock === 0);
  const isBestSeller = Boolean(product.rank && product.rank <= 3);
  const productHighlights = getProductHighlights(product);
  const colorSwatches = getColorSwatches(product.variants);
  const visibleColorSwatches = colorSwatches.slice(0, 4);
  const hiddenColorCount = Math.max(
    0,
    colorSwatches.length - visibleColorSwatches.length,
  );

  const primaryImageSrc =
    activeVariantImage ||
    colorSwatches[selectedVariantIndex]?.image ||
    product.image ||
    "/placeholder.svg";

  const showOriginal =
    (product.originalPrice ?? 0) > (product.price ?? 0) && !isOutOfStock;

  const savingsAmount = showOriginal
    ? Math.max(0, Number(product.originalPrice) - product.price)
    : 0;
  const showSavingsSticker = savingsAmount > 0 && !isOutOfStock;

  const handleAddToCart = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (isOutOfStock || isAddingToCart) return;

    try {
      setIsAddingToCart(true);
      setButtonAnimate(true);

      const buttonRect = buttonRef.current?.getBoundingClientRect();
      const imageRect = imageFrameRef.current?.getBoundingClientRect();
      const startX = buttonRect ? buttonRect.left + buttonRect.width / 2 : 0;
      const startY = buttonRect ? buttonRect.top + buttonRect.height / 2 : 0;

      // If custom onAddToCart is provided, use it
      if (onAddToCart) {
        await Promise.resolve(onAddToCart());
        // Dispatch event for animation even when using custom callback
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("cart-item-added", {
              detail: {
                startX,
                startY,
                image: product.image || undefined,
                imageRect: imageRect
                  ? {
                      left: imageRect.left,
                      top: imageRect.top,
                      width: imageRect.width,
                      height: imageRect.height,
                    }
                  : undefined,
              },
            }),
          );
        }
      } else {
        // Use context's addToCart with animation data
        addToCart(product.id, 1, undefined, {
          startX,
          startY,
          image: product.image || undefined,
          imageRect: imageRect
            ? {
                left: imageRect.left,
                top: imageRect.top,
                width: imageRect.width,
                height: imageRect.height,
              }
            : undefined,
        });
      }
    } finally {
      setTimeout(() => {
        setIsAddingToCart(false);
      }, 500);
      setTimeout(() => {
        setButtonAnimate(false);
      }, 1000);
    }
  };

  return (
    <div
      className={cn(
        "group relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-[border-color,box-shadow,transform] duration-200",
        "hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_8px_22px_rgba(15,23,42,0.10)]",
        className,
      )}
      onMouseLeave={() => setActiveVariantImage(null)}
    >
      <div
        ref={imageFrameRef}
        className="relative h-[164px] overflow-hidden bg-white sm:h-[190px]"
      >
        <Link
          href={product.href}
          aria-label={`View ${product.name}`}
          className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#174a92]"
        >
          <Image
            key={primaryImageSrc}
            src={primaryImageSrc}
            alt={product.name}
            fill
            className="object-contain p-4 transition-transform duration-300 ease-out group-hover:scale-[1.035] sm:p-5"
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 20vw"
            priority={imagePriority}
          />
        </Link>

        <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-col items-start gap-1.5">
          {showSavingsSticker ? (
            <span className="rounded bg-emerald-700 px-2 py-1 text-[10px] font-bold leading-none text-white shadow-sm sm:text-[11px]">
              Save: {formatPrice(savingsAmount)}
            </span>
          ) : null}
          {isBestSeller ? (
            <span className="inline-flex items-center gap-1 rounded bg-amber-500 px-2 py-1 text-[9px] font-bold uppercase leading-none text-white shadow-sm">
              <Flame className="h-3 w-3" aria-hidden="true" />
              Best Seller
            </span>
          ) : null}
        </div>

        {onWishlistClick ? (
          <button
            type="button"
            onClick={() => void onWishlistClick()}
            className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card/95 text-muted-foreground shadow-sm transition hover:border-rose-400 hover:text-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
            aria-pressed={wishlisted}
          >
            <Heart
              className={cn(
                "h-4 w-4",
                wishlisted && "fill-rose-500 text-rose-500",
              )}
              aria-hidden="true"
            />
          </button>
        ) : null}

        {isOutOfStock ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-card/70 backdrop-blur-[1px]">
            <span className="rounded bg-rose-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm">
              Out of Stock
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col px-3 pb-3 pt-2.5 sm:px-4 sm:pb-4 sm:pt-3">
        <Link
          href={product.href}
          className="min-h-[42px] rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174a92] sm:min-h-[44px]"
        >
          <h3 className="line-clamp-2 text-[13px] font-semibold leading-[1.45] text-foreground transition-colors group-hover:text-primary sm:text-[14px]">
            {product.name}
          </h3>
        </Link>

        <div className="mt-2 min-h-[62px] sm:min-h-[72px]">
          {productHighlights.length > 0 ? (
            <ul className="space-y-0.5 text-[10px] leading-[1.45] text-muted-foreground sm:text-[11px]">
              {productHighlights.map((item, index) => (
                <li
                  key={`${item.label}-${item.value}-${index}`}
                  className="flex min-w-0 items-start gap-2"
                >
                  <span className="mt-[0.42rem] h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                  <span className="line-clamp-1 min-w-0">
                    {item.label ? (
                      <span className="font-medium text-foreground/75">
                        {item.label}: {" "}
                      </span>
                    ) : null}
                    {item.value}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-1 text-[10px] text-muted-foreground sm:text-[11px]">
              {product.sku ? <p className="line-clamp-1">Model: {product.sku}</p> : null}
              <p>{isOutOfStock ? "Currently unavailable" : "Ready to order"}</p>
              {Number(product.ratingCount ?? 0) > 0 ? (
                <p>
                  ★ {Number(product.ratingAvg ?? 0).toFixed(1)} ({Number(product.ratingCount).toLocaleString()} reviews)
                </p>
              ) : null}
            </div>
          )}
        </div>

        {colorSwatches.length > 0 ? (
          <div className="mt-2 flex min-h-5 items-center gap-1.5" aria-label="Available colors">
            {visibleColorSwatches.map((swatch, index) => (
              <button
                key={swatch.label}
                type="button"
                onClick={() => setSelectedVariantIndex(index)}
                onMouseEnter={() => swatch.image && setActiveVariantImage(swatch.image)}
                onFocus={() => swatch.image && setActiveVariantImage(swatch.image)}
                onBlur={() => setActiveVariantImage(null)}
                className={cn(
                  "h-4 w-4 rounded-full border border-black/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.65)] transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174a92] focus-visible:ring-offset-1",
                  selectedVariantIndex === index && "ring-2 ring-[#174a92] ring-offset-1",
                )}
                style={{ backgroundColor: swatch.color }}
                title={swatch.label}
                aria-label={`${swatch.label} color variant`}
                aria-pressed={selectedVariantIndex === index}
              />
            ))}
            {hiddenColorCount > 0 ? (
              <span className="text-[10px] font-medium text-muted-foreground">+{hiddenColorCount}</span>
            ) : null}
          </div>
        ) : null}

        {product.type === "BUNDLE" && product.bundleItems?.length ? (
          <p className="mt-2 line-clamp-1 text-[10px] text-muted-foreground">
            Includes {product.bundleItems.slice(0, 2).map((item) => item.product.name).join(", ")}
            {product.bundleItems.length > 2 ? ` +${product.bundleItems.length - 2}` : ""}
          </p>
        ) : null}

        <div className="mt-auto flex min-h-[36px] flex-wrap items-end justify-center gap-x-2 pt-2 text-center">
          <span className="text-[17px] font-bold leading-none text-rose-600 sm:text-[18px]">
            {formatPrice(product.price)}
          </span>
          {showOriginal ? (
            <span className="text-[11px] leading-none text-muted-foreground line-through sm:text-[12px]">
              {formatPrice(Number(product.originalPrice))}
            </span>
          ) : null}
        </div>

        <div className="mt-2.5 flex gap-2">
          {primaryAction === "view-details" ? (
            <Link
              href={product.href}
              aria-label={`View details for ${product.name}`}
              className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded bg-[#174a92] px-2 text-[11px] font-semibold text-white transition hover:bg-[#103b76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174a92] focus-visible:ring-offset-1 sm:h-9 sm:text-[12px]"
            >
              <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">View Details</span>
            </Link>
          ) : (
            <button
              ref={buttonRef}
              type="button"
              disabled={isOutOfStock || isAddingToCart}
              onClick={handleAddToCart}
              className={cn(
                "flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded px-2 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174a92] focus-visible:ring-offset-1 sm:h-9 sm:text-[12px]",
                isOutOfStock || isAddingToCart
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-[#174a92] text-white hover:bg-[#103b76]",
                buttonAnimate && "animate-bounce-in",
              )}
            >
              {isAddingToCart ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <ShoppingCart className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">
                {isOutOfStock ? "Out of Stock" : addToCartLabel}
              </span>
            </button>
          )}

          {onCompareClick ? (
            <button
              type="button"
              onClick={() => void onCompareClick()}
              aria-pressed={compared}
              className={cn(
                "flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded border px-2 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174a92] focus-visible:ring-offset-1 sm:h-9 sm:text-[12px]",
                compared
                  ? "border-[#174a92] bg-blue-50 text-[#174a92]"
                  : "border-border bg-muted/60 text-foreground/75 hover:border-primary/30 hover:bg-muted",
              )}
            >
              <GitCompareArrows className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{compared ? "Compared" : "Compare"}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
