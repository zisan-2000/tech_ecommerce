"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, GitCompareArrows, Heart, Minus, Plus, Share2, ShieldCheck, Truck } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/components/ecommarce/CartContext";
import { useWishlist } from "@/components/ecommarce/WishlistContext";
import ProductConversionTools from "@/components/ecommarce/product-detail/ProductConversionTools";
import { useProductCompare } from "@/hooks/use-product-compare";
import { useSession } from "@/lib/auth-client";
import {
  getDefaultPurchaseVariant,
  type ProductPurchaseData,
  type ProductPurchaseVariant,
} from "@/lib/product-purchase";

const money = (value: number, currency: string) =>
  new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "BDT",
    maximumFractionDigits: 0,
  }).format(value);

function simpleOptions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, option]) => ["string", "number"].includes(typeof option))
      .map(([key, option]) => [key, String(option)]),
  );
}

export default function ProductPurchasePanel({
  product,
}: {
  product: ProductPurchaseData;
}) {
  const router = useRouter();
  const { status } = useSession();
  const { addToCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const compare = useProductCompare();
  const defaultVariant = getDefaultPurchaseVariant(product.variants);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(
    defaultVariant?.id ?? null,
  );
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState<string | null>(
    defaultVariant?.colorImage ?? product.image ?? product.gallery[0] ?? null,
  );
  const selectedVariant =
    product.variants.find((variant) => variant.id === selectedVariantId) ?? null;
  const images = useMemo(
    () =>
      Array.from(
        new Set(
          [
            selectedVariant?.colorImage,
            product.image,
            ...product.gallery,
            ...product.variants.map((variant) => variant.colorImage),
          ].filter((image): image is string => Boolean(image?.trim())),
        ),
      ),
    [product.gallery, product.image, product.variants, selectedVariant],
  );
  const price = selectedVariant?.price ?? product.basePrice;
  const stock =
    product.type === "BUNDLE"
      ? product.bundleStockLimit ?? 0
      : product.type === "DIGITAL" || product.type === "SERVICE"
        ? 99
        : selectedVariant
          ? selectedVariant.stock
          : product.variants.reduce((sum, variant) => sum + variant.stock, 0);
  const originalPrice = product.originalPrice;
  const savings =
    originalPrice && originalPrice > price ? originalPrice - price : 0;
  const wishlisted = isInWishlist(product.id);

  const selectVariant = (variant: ProductPurchaseVariant) => {
    setSelectedVariantId(variant.id);
    setQuantity(1);
    if (variant.colorImage) setActiveImage(variant.colorImage);
  };

  const addSelectedProduct = () =>
    addToCart(product.id, Math.min(quantity, stock), selectedVariant?.id ?? null, {
      image: activeImage ?? product.image ?? undefined,
      product: {
        id: product.id,
        name: product.name,
        price: product.basePrice,
        image: activeImage ?? product.image,
        variants: product.variants.map((variant) => ({
          id: variant.id,
          price: variant.price,
          sku: variant.sku,
          options: simpleOptions(variant.options),
        })),
      },
    });

  const addProduct = async () => {
    if (stock <= 0) return;
    if (await addSelectedProduct()) toast.success(`“${product.name}” added to cart.`);
    else toast.error("Product could not be added to cart.");
  };

  const buyNow = async () => {
    if (stock <= 0) return;
    if (await addSelectedProduct()) router.push("/ecommerce/checkout");
    else toast.error("Product could not be added to cart.");
  };

  const toggleCompare = () => {
    const result = compare.toggle(product.id);
    if (result.limitReached) {
      toast.error("You can compare up to 4 products.");
      return;
    }
    toast.success(result.added ? "Added to comparison." : "Removed from comparison.");
  };

  const toggleWishlist = async () => {
    if (status !== "authenticated") {
      router.push(
        `/signin?callbackUrl=${encodeURIComponent(`/ecommerce/products/${product.id}`)}`,
      );
      return;
    }
    try {
      const response = await fetch(
        wishlisted ? `/api/wishlist?productId=${product.id}` : "/api/wishlist",
        wishlisted
          ? { method: "DELETE" }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ productId: product.id }),
            },
      );
      if (!response.ok) throw new Error("Wishlist update failed");
      if (wishlisted) removeFromWishlist(product.id);
      else addToWishlist(product.id);
      toast.success(wishlisted ? "Removed from wishlist." : "Added to wishlist.");
    } catch (error) {
      console.error(error);
      toast.error("Wishlist update failed.");
    }
  };

  const share = async () => {
    try {
      const url = window.location.href;
      if (navigator.share) await navigator.share({ title: product.name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Product link copied.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Product link could not be shared.");
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,.95fr)]">
      <div>
        <div className="relative aspect-square overflow-hidden rounded-3xl border bg-card">
          <Image
            src={activeImage ?? "/placeholder.svg"}
            alt={product.name}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 52vw"
            className="object-contain p-6 sm:p-10"
          />
        </div>
        {images.length > 1 ? (
          <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
            {images.map((image) => (
              <button
                key={image}
                type="button"
                onClick={() => setActiveImage(image)}
                aria-label="View product image"
                className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border bg-card ${
                  activeImage === image ? "border-primary ring-2 ring-primary/20" : ""
                }`}
              >
                <Image src={image} alt="" fill sizes="80px" className="object-contain p-2" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-3xl border bg-card p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-3 py-1 font-bold ${stock > 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}`}>
            {stock > 0 ? "In stock" : "Out of stock"}
          </span>
          {selectedVariant?.sku || product.sku ? <span className="rounded-full bg-muted px-3 py-1">SKU: {selectedVariant?.sku || product.sku}</span> : null}
        </div>
        <h1 className="mt-4 text-2xl font-black leading-tight sm:text-3xl">
          {product.name}
        </h1>
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="text-amber-500">★</span>
          <strong className="text-foreground">{product.ratingAvg.toFixed(1)}</strong>
          <span>({product.ratingCount} reviews)</span>
        </div>

        <div className="mt-6 rounded-2xl bg-primary/5 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <span className="text-3xl font-black text-primary">{money(price, product.currency)}</span>
            {originalPrice && originalPrice > price ? (
              <span className="pb-1 text-lg text-muted-foreground line-through">{money(originalPrice, product.currency)}</span>
            ) : null}
          </div>
          {savings > 0 ? <p className="mt-1 text-sm font-semibold text-emerald-600">You save {money(savings, product.currency)}</p> : null}
        </div>

        {product.variants.length ? (
          <fieldset className="mt-6">
            <legend className="text-sm font-bold">Choose an option</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {product.variants.filter((variant) => variant.active).map((variant) => {
                const label = Object.entries(simpleOptions(variant.options) ?? {})
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(" · ") || variant.sku;
                return (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => selectVariant(variant)}
                    disabled={variant.stock <= 0}
                    className={`flex items-center justify-between rounded-xl border px-3 py-3 text-left text-sm transition disabled:opacity-40 ${selectedVariantId === variant.id ? "border-primary bg-primary/10" : "hover:border-primary/50"}`}
                  >
                    <span className="truncate">{label}</span>
                    {selectedVariantId === variant.id ? <Check className="h-4 w-4 text-primary" /> : <span className="text-xs text-muted-foreground">{variant.stock} left</span>}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <div className="flex h-12 items-center rounded-xl border">
            <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="h-full px-4" aria-label="Decrease quantity"><Minus className="h-4 w-4" /></button>
            <span className="min-w-10 text-center font-bold">{quantity}</span>
            <button type="button" onClick={() => setQuantity((value) => Math.min(Math.max(1, stock), value + 1))} className="h-full px-4" aria-label="Increase quantity"><Plus className="h-4 w-4" /></button>
          </div>
          <button type="button" onClick={addProduct} disabled={stock <= 0} className="h-12 flex-1 rounded-xl bg-primary px-6 font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
            {stock > 0 ? "Add to cart" : "Out of stock"}
          </button>
          <button type="button" onClick={toggleWishlist} className="h-12 w-12 rounded-xl border" aria-label="Toggle wishlist"><Heart className={`mx-auto h-5 w-5 ${wishlisted ? "fill-red-500 text-red-500" : ""}`} /></button>
          <button type="button" onClick={share} className="h-12 w-12 rounded-xl border" aria-label="Share product"><Share2 className="mx-auto h-5 w-5" /></button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={buyNow}
            disabled={stock <= 0}
            className="h-11 rounded-xl border border-primary font-bold text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            Buy now
          </button>
          <button
            type="button"
            onClick={toggleCompare}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border font-bold ${compare.isCompared(product.id) ? "border-primary bg-primary/10 text-primary" : "hover:border-primary/50"}`}
          >
            <GitCompareArrows className="h-4 w-4" />
            {compare.isCompared(product.id) ? "Remove comparison" : "Add to compare"}
          </button>
        </div>
        {compare.count > 0 ? (
          <Link href={compare.href} className="mt-2 block text-right text-xs font-bold text-primary hover:underline">
            Compare selected products ({compare.count})
          </Link>
        ) : null}

        <ProductConversionTools price={price} currency={product.currency} />

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="flex gap-3 rounded-xl border p-3"><Truck className="h-5 w-5 text-primary" /><div><p className="text-sm font-bold">Nationwide delivery</p><p className="text-xs text-muted-foreground">Shipping calculated at checkout</p></div></div>
          <div className="flex gap-3 rounded-xl border p-3"><ShieldCheck className="h-5 w-5 text-primary" /><div><p className="text-sm font-bold">Secure purchase</p><p className="text-xs text-muted-foreground">Verified catalog and checkout</p></div></div>
        </div>
      </div>
    </div>
  );
}
