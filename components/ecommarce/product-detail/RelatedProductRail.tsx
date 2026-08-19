import Image from "next/image";
import Link from "next/link";
import type { StorefrontCatalogProduct } from "@/lib/storefront-catalog";

function money(value: number) {
  return `৳${Math.round(value).toLocaleString("en-US")}`;
}

export default function RelatedProductRail({
  products,
  categoryHref,
}: {
  products: StorefrontCatalogProduct[];
  categoryHref: string;
}) {
  if (products.length === 0) return null;

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-[0_1px_3px_rgba(15,23,42,0.08)]">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3.5">
        <h2 className="text-[14px] font-bold text-foreground">Related Products</h2>
        <Link
          href={categoryHref}
          className="text-[11px] font-semibold text-primary hover:underline"
        >
          View all
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col divide-y divide-border overflow-y-auto px-3 [scrollbar-color:hsl(var(--scrollbar-thumb))_transparent] [scrollbar-width:thin]">
        {products.slice(0, 8).map((product) => {
          const savings =
            product.originalPrice && product.originalPrice > product.price
              ? product.originalPrice - product.price
              : 0;

          return (
            <Link
              key={product.id}
              href={`/ecommerce/products/${product.id}`}
              className="group grid min-h-[96px] flex-1 grid-cols-[62px_minmax(0,1fr)] content-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#174a92]"
            >
              <span className="relative h-[62px] w-[62px] overflow-hidden rounded border border-slate-200 bg-white">
                <Image
                  src={product.image || "/placeholder.svg"}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-contain p-1.5 transition-transform duration-200 group-hover:scale-105"
                />
              </span>
              <span className="min-w-0">
              <span className="line-clamp-2 text-[11px] font-semibold leading-[1.45] text-foreground group-hover:text-primary">
                  {product.name}
                </span>
                <span className="mt-1.5 flex flex-wrap items-baseline gap-2">
                  <strong className="text-[13px] text-rose-600">
                    {money(product.price)}
                  </strong>
                  {product.originalPrice && product.originalPrice > product.price ? (
                    <span className="text-[10px] text-muted-foreground line-through">
                      {money(product.originalPrice)}
                    </span>
                  ) : null}
                </span>
                {savings > 0 ? (
                  <span className="mt-0.5 block text-[10px] font-medium text-emerald-700">
                    Save: {money(savings)}
                  </span>
                ) : null}
              </span>
            </Link>
          );
        })}
      </div>

      <Link
        href={categoryHref}
        className="flex h-11 shrink-0 items-center justify-center border-t border-border bg-muted text-[11px] font-bold text-primary transition hover:bg-accent"
      >
        Browse all related products
      </Link>
    </aside>
  );
}
