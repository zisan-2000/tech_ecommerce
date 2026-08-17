import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, BadgeCheck } from "lucide-react";
import { getStorefrontCatalogFacets } from "@/lib/storefront-catalog";

export const metadata: Metadata = {
  title: "Shop by Brand — Tech Ecommerce",
  description: "Explore available computers, components and gadgets by brand.",
  alternates: { canonical: "/ecommerce/brands" },
};

export default async function BrandsPage() {
  const { brands } = await getStorefrontCatalogFacets();
  const availableBrands = brands.filter((brand) => brand.productCount > 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="container px-3 py-6 sm:px-6 lg:py-10">
        <section className="rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-accent/10 px-5 py-8 sm:px-8 sm:py-12">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-primary">
            <BadgeCheck className="h-4 w-4" aria-hidden="true" />
            Brand directory
          </span>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">
            Shop trusted brands
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Open any brand to see its live catalog with the same category, price,
            availability and sorting controls.
          </p>
        </section>

        {availableBrands.length ? (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5">
            {availableBrands.map((brand) => (
              <Link
                key={brand.id}
                href={`/ecommerce/products?brand=${encodeURIComponent(brand.slug)}`}
                className="group flex min-h-44 flex-col items-center justify-between rounded-3xl border bg-card p-5 text-center shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
              >
                <div className="relative h-20 w-full">
                  {brand.logo ? (
                    <Image
                      src={brand.logo}
                      alt={`${brand.name} logo`}
                      fill
                      sizes="180px"
                      className="object-contain transition duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-2xl bg-primary/10 text-2xl font-black text-primary">
                      {brand.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="mt-4 w-full">
                  <h2 className="truncate font-bold">{brand.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {brand.productCount} products
                  </p>
                </div>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary">
                  View products
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-3xl border border-dashed p-12 text-center text-muted-foreground">
            No brands with active products are available yet.
          </div>
        )}
      </div>
    </div>
  );
}
