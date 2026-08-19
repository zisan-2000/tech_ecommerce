"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  CreditCard,
  GitCompareArrows,
  Heart,
  Mail,
  Minus,
  Phone,
  Plus,
  Share2,
  ShoppingCart,
  Star,
} from "lucide-react";
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

const money = (value: number, currency: string) => {
  if (currency.toUpperCase() === "BDT") {
    return `৳${Math.round(value).toLocaleString("en-US")}`;
  }
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "BDT",
    maximumFractionDigits: 0,
  }).format(value);
};

type PurchasePanelDetails = {
  brandName?: string | null;
  categoryName: string;
  contactNumber?: string | null;
  contactEmail?: string | null;
  attributes: Array<{
    id: number;
    value: string;
    attribute: { name: string };
  }>;
};

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
  details,
}: {
  product: ProductPurchaseData;
  details: PurchasePanelDetails;
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
          : product.variants
              .filter((variant) => variant.active)
              .reduce((sum, variant) => sum + variant.stock, 0);
  const originalPrice = product.originalPrice;
  const savings =
    originalPrice && originalPrice > price ? originalPrice - price : 0;
  const wishlisted = isInWishlist(product.id);
  const model = details.attributes.find((item) =>
    /model/i.test(item.attribute.name),
  )?.value;
  const warranty = details.attributes.find((item) =>
    /warranty/i.test(item.attribute.name),
  )?.value;
  const keySpecifications = details.attributes
    .filter((item) => !/^(model|warranty)$/i.test(item.attribute.name.trim()))
    .slice(0, 4);
  const emiMonthly = price / 12;
  const telephoneHref = details.contactNumber
    ? `tel:${details.contactNumber.replace(/[^\d+]/g, "")}`
    : null;

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
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
        <div className="grid lg:grid-cols-[minmax(340px,0.95fr)_minmax(0,1.25fr)]">
          <div className="border-b border-slate-200 p-4 lg:border-b-0 lg:border-r sm:p-5">
            <div className="relative h-[310px] overflow-hidden rounded-md bg-white sm:h-[390px]">
              {savings > 0 ? (
                <span className="absolute left-2 top-2 z-10 rounded bg-emerald-700 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
                  Save: {money(savings, product.currency)}
                </span>
              ) : null}
              <Image
                src={activeImage ?? "/placeholder.svg"}
                alt={product.name}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 42vw"
                className="object-contain p-4 sm:p-6"
              />
            </div>

            {images.length > 1 ? (
              <div className="mt-3 flex justify-center gap-2 overflow-x-auto pb-1">
                {images.map((image, index) => (
                  <button
                    key={image}
                    type="button"
                    onClick={() => setActiveImage(image)}
                    aria-label={`View product image ${index + 1}`}
                    aria-pressed={activeImage === image}
                    className={`relative h-14 w-14 shrink-0 overflow-hidden rounded border bg-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174a92] sm:h-[60px] sm:w-[60px] ${
                      activeImage === image
                        ? "border-[#174a92] ring-1 ring-[#174a92]"
                        : "border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    <Image
                      src={image}
                      alt=""
                      fill
                      sizes="64px"
                      className="object-contain p-1.5"
                    />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="p-4 sm:p-5">
            <h1 className="text-[18px] font-bold leading-[1.4] text-slate-900 sm:text-[20px]">
              {product.name}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-slate-500">
              <span className="inline-flex items-center gap-0.5" aria-label={`${product.ratingAvg.toFixed(1)} out of 5 stars`}>
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star
                    key={index}
                    className={`h-4 w-4 ${
                      index < Math.round(product.ratingAvg)
                        ? "fill-amber-400 text-amber-400"
                        : "fill-slate-200 text-slate-200"
                    }`}
                    aria-hidden="true"
                  />
                ))}
              </span>
              <span>{product.ratingCount} Reviews</span>
              <button
                type="button"
                onClick={share}
                className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 px-2 text-[11px] font-medium text-[#174a92] hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174a92]"
              >
                <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                Share
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
              <span className="rounded border border-slate-200 px-2.5 py-1.5 text-slate-600">
                Stock: {" "}
                <strong className={stock > 0 ? "text-emerald-700" : "text-rose-600"}>
                  {stock > 0 ? "In Stock" : "Out of Stock"}
                </strong>
              </span>
              <span className="rounded border border-slate-200 px-2.5 py-1.5 text-slate-600">
                PID: <strong className="text-slate-900">P{String(product.id).padStart(9, "0")}</strong>
              </span>
              {selectedVariant?.sku || product.sku ? (
                <span className="rounded border border-slate-200 px-2.5 py-1.5 text-slate-600">
                  SKU: <strong className="text-slate-900">{selectedVariant?.sku || product.sku}</strong>
                </span>
              ) : null}
              {details.brandName ? (
                <span className="rounded border border-slate-200 px-2.5 py-1.5 text-slate-600">
                  Brand: <strong className="text-slate-900">{details.brandName}</strong>
                </span>
              ) : null}
              {model ? (
                <span className="rounded border border-slate-200 px-2.5 py-1.5 text-slate-600">
                  Model: <strong className="text-slate-900">{model}</strong>
                </span>
              ) : null}
              {warranty ? (
                <span className="rounded border border-slate-200 px-2.5 py-1.5 text-slate-600">
                  Warranty: <strong className="text-slate-900">{warranty}</strong>
                </span>
              ) : null}
            </div>

            {keySpecifications.length > 0 ? (
              <ul className="mt-3 space-y-0.5 text-[12px] leading-[1.55] text-slate-600 sm:text-[12px]">
                {keySpecifications.map((item) => (
                  <li key={item.id} className="flex items-start gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-500" />
                    <span>
                      <strong className="font-medium text-slate-700">{item.attribute.name}:</strong>{" "}
                      {item.value}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {product.variants.filter((variant) => variant.active).length > 1 ? (
              <fieldset className="mt-3">
                <legend className="text-[12px] font-bold text-slate-800">Choose an option</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {product.variants
                    .filter((variant) => variant.active)
                    .map((variant) => {
                      const label =
                        Object.entries(simpleOptions(variant.options) ?? {})
                          .map(([key, value]) => `${key}: ${value}`)
                          .join(" · ") ||
                        variant.sku ||
                        `Option ${variant.id}`;
                      return (
                        <button
                          key={variant.id}
                          type="button"
                          onClick={() => selectVariant(variant)}
                          disabled={variant.stock <= 0}
                          className={`flex min-h-10 items-center justify-between rounded border px-3 py-2 text-left text-[11px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174a92] disabled:cursor-not-allowed disabled:opacity-40 ${
                            selectedVariantId === variant.id
                              ? "border-[#174a92] bg-blue-50 text-[#174a92]"
                              : "border-slate-200 hover:border-slate-400"
                          }`}
                        >
                          <span className="truncate">{label}</span>
                          {selectedVariantId === variant.id ? (
                            <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                          ) : (
                            <span className="ml-2 shrink-0 text-[10px] text-slate-400">
                              {variant.stock} left
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              </fieldset>
            ) : null}

            {telephoneHref || details.contactEmail ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {telephoneHref ? (
                  <a
                    href={telephoneHref}
                    className="inline-flex h-9 items-center gap-2 rounded border border-slate-200 px-3 text-[11px] font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  >
                    <Phone className="h-4 w-4 text-[#174a92]" aria-hidden="true" />
                    <span>Hotline</span>
                    <strong className="text-[#174a92]">{details.contactNumber}</strong>
                  </a>
                ) : null}
                {details.contactEmail ? (
                  <a
                    href={`mailto:${details.contactEmail}`}
                    className="inline-flex h-9 items-center gap-2 rounded border border-slate-200 px-3 text-[11px] font-medium text-[#174a92] hover:border-slate-300 hover:bg-slate-50"
                  >
                    <Mail className="h-4 w-4" aria-hidden="true" />
                    {details.contactEmail}
                  </a>
                ) : null}
              </div>
            ) : null}

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
                <p className="text-[11px] font-medium text-slate-500">Discount Price</p>
                <div className="mt-2 flex flex-wrap items-baseline gap-2">
                  <strong className="text-[21px] text-rose-600">
                    {money(price, product.currency)}
                  </strong>
                  {originalPrice && originalPrice > price ? (
                    <span className="text-[12px] text-slate-400 line-through">
                      {money(originalPrice, product.currency)}
                    </span>
                  ) : null}
                </div>
                {savings > 0 ? (
                  <p className="mt-1 text-[11px] font-medium text-emerald-700">
                    You save {money(savings, product.currency)}
                  </p>
                ) : null}
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
                <p className="text-[11px] font-medium text-slate-500">EMI Starts From*</p>
                <strong className="mt-2 block text-[20px] text-[#2563eb]">
                  {money(emiMonthly, product.currency)}
                </strong>
                <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#174a92]">
                  <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                  Up to 12 monthly installments
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <div className="flex h-10 items-center overflow-hidden rounded border border-slate-200">
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  disabled={quantity <= 1}
                  className="flex h-full w-10 items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="flex h-full min-w-12 items-center justify-center border-x border-slate-200 text-[13px] font-semibold">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.min(Math.max(1, stock), value + 1))}
                  disabled={stock <= 0 || quantity >= stock}
                  className="flex h-full w-10 items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                  aria-label="Increase quantity"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <button
                type="button"
                onClick={addProduct}
                disabled={stock <= 0}
                className="inline-flex h-10 min-w-[180px] flex-1 items-center justify-center gap-2 rounded bg-[#174a92] px-5 text-[12px] font-bold text-white transition hover:bg-[#103b76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174a92] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                {stock > 0 ? "Add to Cart" : "Out of Stock"}
              </button>
              <button
                type="button"
                onClick={toggleWishlist}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174a92]"
                aria-pressed={wishlisted}
              >
                <Heart
                  className={`h-4 w-4 ${wishlisted ? "fill-rose-500 text-rose-500" : ""}`}
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">Wishlist</span>
              </button>
              <button
                type="button"
                onClick={toggleCompare}
                className={`inline-flex h-10 items-center justify-center gap-1.5 rounded border border-slate-200 px-3 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174a92] ${
                  compare.isCompared(product.id)
                    ? "bg-blue-50 text-[#174a92]"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
                aria-pressed={compare.isCompared(product.id)}
              >
                <GitCompareArrows className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Compare</span>
              </button>
            </div>

            <div className="mt-2 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={buyNow}
                disabled={stock <= 0}
                className="text-[11px] font-semibold text-[#174a92] hover:underline disabled:text-slate-400"
              >
                Buy now with secure checkout
              </button>
              {compare.count > 0 ? (
                <Link
                  href={compare.href}
                  className="text-[11px] font-semibold text-[#174a92] hover:underline"
                >
                  Compare selected ({compare.count})
                </Link>
              ) : null}
            </div>

            <ProductConversionTools price={price} currency={product.currency} />
          </div>
        </div>
    </section>
  );
}
