"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Flame, Heart, Loader2, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "@/components/ecommarce/CartContext";
import { useMobile } from "@/hooks/use-mobile";

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
  onWishlistClick?: () => void | Promise<void>;
  onAddToCart?: () => void | Promise<void>;
  formatPrice?: (value: number) => string;
  className?: string;
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

function Stars({ value }: { value: number }) {
  const v = Math.max(0, Math.min(5, value || 0));
  const full = Math.floor(v);
  const half = v - full >= 0.5;

  return (
    <div className="flex items-center gap-0.5 leading-none">
      {Array.from({ length: 5 }).map((_, i) => {
        const isFull = i < full;
        const isHalf = i === full && half;

        return (
          <span
            key={i}
            className={cn(
              "text-[16px] sm:text-[18px] leading-none transition-colors",
              isFull || isHalf ? "text-amber-400" : "text-muted-foreground/30",
            )}
          >
            {isHalf ? "½" : "★"}
          </span>
        );
      })}
    </div>
  );
}

export default function ProductCardCompact({
  product,
  wishlisted = false,
  onWishlistClick,
  onAddToCart,
  formatPrice = defaultFormatPrice,
  addToCartLabel = "Add To Cart",
  className,
}: Props) {
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [buttonAnimate, setButtonAnimate] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [activeVariantImage, setActiveVariantImage] = useState<string | null>(
    null,
  );
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const isMobile = useMobile();
  const { addToCart } = useCart();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const imageFrameRef = useRef<HTMLDivElement>(null);

  const effectiveStock =
    product.type === "BUNDLE"
      ? Number(product.bundleStockLimit ?? product.stock ?? 0)
      : Number(product.stock ?? 0);

  const isOutOfStock = effectiveStock === 0;
  const ratingAvg = Number(product.ratingAvg ?? 0);
  const ratingCount = Number(product.ratingCount ?? 0);
  const totalSold = Number(product.totalSold ?? 0);
  const isBestSeller = Boolean(product.rank && product.rank <= 3);
  const colorSwatches = getColorSwatches(product.variants);
  const visibleColorSwatches = colorSwatches.slice(0, 4);
  const hiddenColorCount = Math.max(
    0,
    colorSwatches.length - visibleColorSwatches.length,
  );

  const primaryImageSrc = isMobile
    ? colorSwatches[selectedVariantIndex]?.image ||
      product.image ||
      "/placeholder.svg"
    : activeVariantImage || product.image || "/placeholder.svg";

  const showOriginal =
    (product.originalPrice ?? 0) > (product.price ?? 0) && !isOutOfStock;

  const savingsPercent =
    product.discountPct && product.discountPct > 0
      ? product.discountPct
      : showOriginal
        ? Math.round(
            ((Number(product.originalPrice) - product.price) /
              Number(product.originalPrice)) *
              100,
          )
        : 0;

  const showSavingsSticker =
    savingsPercent > 0 && !isOutOfStock && !isBestSeller;

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
        "group relative flex h-full w-full overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-muted/40 shadow-[0_8px_20px_rgba(15,23,42,0.08)] transition-all duration-300 hover:shadow-xl",
        "hover:-translate-y-1.5",
        className,
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setActiveVariantImage(null);
      }}
    >
      <Link href={product.href} className="flex h-full w-full flex-col">
        <div className="flex h-full flex-col">
          {/* Image Section */}
          <div
            ref={imageFrameRef}
            className="relative aspect-square overflow-hidden bg-gradient-to-br from-muted/30 to-muted/10"
          >
            {/* Wishlist Button */}
            {onWishlistClick && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onWishlistClick();
                }}
                className={cn(
                  "absolute left-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-border/50 bg-background/80 backdrop-blur-sm transition-all duration-300",
                  "hover:scale-110 hover:bg-background",
                  "focus:outline-none focus:ring-2 focus:ring-primary/50",
                )}
                aria-label={
                  wishlisted ? "Remove from wishlist" : "Add to wishlist"
                }
              >
                <Heart
                  className={cn(
                    "h-4 w-4 transition-all duration-300",
                    wishlisted
                      ? "fill-rose-500 text-rose-500"
                      : "text-muted-foreground group-hover:text-rose-500",
                  )}
                />
              </button>
            )}

            {/* Best Seller Badge */}
            {isBestSeller && (
              <div className="absolute right-3 top-3 z-20">
                <div className="flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 shadow-md animate-pulse-glow">
                  <Flame className="h-3 w-3 text-white animate-pulse" />
                  <span className="text-[10px] font-bold text-white uppercase tracking-wide">
                    Best Seller
                  </span>
                </div>
              </div>
            )}

            {/* Discount Sticker */}
            {showSavingsSticker && (
              <div className="absolute right-3 top-3 z-20">
                <div className="relative flex h-[35px] w-[35px] items-center justify-center sm:h-[52px] sm:w-[52px]">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary to-secondary shadow-lg ring-2 ring-white/90 [clip-path:polygon(50%_0%,61%_10%,75%_5%,82%_18%,95%_25%,90%_40%,100%_50%,90%_60%,95%_75%,82%_82%,75%_95%,61%_90%,50%_100%,39%_90%,25%_95%,18%_82%,5%_75%,10%_60%,0%_50%,10%_40%,5%_25%,18%_18%,25%_5%,39%_10%)]" />
                  <span className="relative text-[10px] font-extrabold leading-none text-white drop-shadow-sm sm:text-[14px]">
                    {savingsPercent}%
                  </span>
                  <span className="absolute -bottom-3 text-[8px] font-medium text-primary sm:-bottom-4 sm:text-[9px]">
                    OFF
                  </span>
                </div>
              </div>
            )}

            {/* Out of Stock Badge */}
            {isOutOfStock && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <span className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg">
                  Out of Stock
                </span>
              </div>
            )}

            {/* Product Image */}
            <div className="relative h-full w-full overflow-hidden">
              <Image
                key={primaryImageSrc}
                src={primaryImageSrc}
                alt={product.name}
                fill
                className={cn(
                  "object-cover transition-all duration-500 ease-out",
                  "group-hover:scale-110",
                  isHovered ? "scale-105" : "scale-100",
                )}
                sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 20vw"
              />
            </div>

            {/* Quick View Overlay (Optional) */}
            {isHovered && !isOutOfStock && (
              <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/60 to-transparent py-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <div className="flex justify-center">
                  <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-foreground backdrop-blur-sm">
                    Quick View
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Content Section */}
          <div className="flex flex-1 flex-col px-3 pb-3 pt-2.5 sm:px-4 sm:pb-3.5 sm:pt-3">
            {isMobile && (
              <div className="mb-2 min-h-[44px]">
                {colorSwatches.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    {colorSwatches.map((swatch, index) => (
                      <button
                        key={swatch.label}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedVariantIndex(index);
                        }}
                        className={cn(
                          "relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg border-2 bg-background shadow-sm transition-colors",
                          selectedVariantIndex === index
                            ? "border-primary"
                            : "border-border/60",
                        )}
                        aria-label={`${swatch.label} color variant`}
                      >
                        {swatch.image ? (
                          <Image
                            src={swatch.image}
                            alt={swatch.label}
                            fill
                            className="object-cover"
                            sizes="40px"
                          />
                        ) : (
                          <div
                            className="h-full w-full"
                            style={{ backgroundColor: swatch.color }}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-10 items-center text-[11px] text-muted-foreground">
                    <span>1 variant available</span>
                  </div>
                )}
              </div>
            )}
            {/* Product Title */}
            <div className="min-h-[42px] sm:min-h-[48px]">
              <h3 className="line-clamp-2 text-[16px] font-semibold leading-tight text-foreground transition-colors group-hover:text-primary sm:text-[18px]">
                {product.name}
              </h3>
            </div>

            <div className="flex items-center justify-between">
              {/* Rating */}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Stars value={ratingAvg} />
                {ratingCount > 0 && (
                  <span className="text-[12px] text-muted-foreground sm:text-[14px]">
                    ({ratingCount})
                  </span>
                )}
                {totalSold > 0 ? (
                  <span className="text-[11px] text-muted-foreground sm:text-[12px]">
                    • {totalSold.toLocaleString()} sold
                  </span>
                ) : null}
              </div>
              {colorSwatches.length > 0 && (
                <div className="mt-1 flex items-center gap-1.5">
                  {!isMobile && (
                    <>
                      {visibleColorSwatches.map((swatch) => (
                        <span
                          key={swatch.label}
                          className={cn(
                            "h-3.5 w-3.5 rounded-full border border-black/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.35)] sm:h-4 sm:w-4",
                            swatch.image ? "cursor-pointer" : "",
                          )}
                          style={{ backgroundColor: swatch.color }}
                          title={swatch.label}
                          aria-label={`${swatch.label} color variant`}
                          tabIndex={swatch.image ? 0 : -1}
                          onMouseEnter={() => {
                            if (swatch.image)
                              setActiveVariantImage(swatch.image);
                          }}
                          onFocus={() => {
                            if (swatch.image)
                              setActiveVariantImage(swatch.image);
                          }}
                          onBlur={() => setActiveVariantImage(null)}
                        />
                      ))}
                      {hiddenColorCount > 0 && (
                        <span className="text-[12px] font-medium text-muted-foreground sm:text-[13px]">
                          +{hiddenColorCount}
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Bundle Info */}
            {product.type === "BUNDLE" && (
              <div className="mt-1.5 space-y-1">
                {product.bundleSavings && (
                  <div className="text-[11px] font-semibold text-emerald-600 sm:text-[12px]">
                    Save {product.bundleSavings}
                  </div>
                )}
                {product.bundleItems && product.bundleItems.length > 0 && (
                  <div className="line-clamp-1 text-[10px] text-muted-foreground sm:text-[11px]">
                    {product.bundleItems
                      .slice(0, 2)
                      .map((item) => item.product.name)
                      .join(", ")}
                    {product.bundleItems.length > 2 &&
                      ` +${product.bundleItems.length - 2}`}
                  </div>
                )}
              </div>
            )}

            {/* Price Section */}
            <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
              <span className="text-[18px] font-bold text-primary sm:text-[20px]">
                {formatPrice(product.price)}
              </span>
              {showOriginal && (
                <span className="text-[12px] text-muted-foreground line-through sm:text-[13px]">
                  {formatPrice(Number(product.originalPrice))}
                </span>
              )}
            </div>

            {/* Add to Cart Button */}
            <div className="mt-auto pt-2.5 sm:pt-3">
              <button
                ref={buttonRef}
                type="button"
                disabled={isOutOfStock || isAddingToCart}
                onClick={handleAddToCart}
                className={cn(
                  "flex h-[36px] w-full items-center justify-center gap-2 rounded-lg text-[13px] font-semibold transition-all duration-300 sm:h-[40px] sm:text-[14px]",
                  "hover:gap-3",
                  isOutOfStock || isAddingToCart
                    ? "cursor-not-allowed bg-muted text-muted-foreground"
                    : "bg-transparent text-primary border border-primary shadow-md hover:bg-primary/90 hover:text-white hover:shadow-lg",
                  buttonAnimate ? "animate-bounce-in" : "",
                )}
              >
                {isAddingToCart ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4" />
                ) : (
                  <>
                    <ShoppingCart className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span>{addToCartLabel}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
