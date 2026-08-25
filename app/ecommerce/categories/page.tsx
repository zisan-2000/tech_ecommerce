import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Boxes, Package } from "lucide-react";
import { getStorefrontCatalogFacets } from "@/lib/storefront-catalog";
import { getSiteSettingsForSeo } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettingsForSeo();

  return {
    title: { absolute: `Shop by Category — ${settings.siteTitle}` },
    description:
      "Browse computers, components, accessories and gadgets by category.",
    alternates: { canonical: "/ecommerce/categories" },
  };
}

export default async function CategoriesPage() {
  const { categories } = await getStorefrontCatalogFacets();
  const childrenByParent = new Map<number, typeof categories>();
  for (const category of categories) {
    if (category.parentId === null) continue;
    const children = childrenByParent.get(category.parentId) ?? [];
    children.push(category);
    childrenByParent.set(category.parentId, children);
  }
  const roots = categories.filter((category) => category.parentId === null);

  return (
    <div className="min-h-screen bg-background">
      <div className="container px-3 py-6 sm:px-6 lg:py-10">
        <section className="rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-accent/10 px-5 py-8 sm:px-8 sm:py-12">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-primary">
            <Boxes className="h-4 w-4" aria-hidden="true" />
            Departments
          </span>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">
            Shop by category
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Start with a department, then narrow the catalog using brand, price,
            type and stock filters.
          </p>
        </section>

        {roots.length ? (
          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {roots.map((category) => {
              const children = childrenByParent.get(category.id) ?? [];
              return (
                <article
                  key={category.id}
                  className="group overflow-hidden rounded-3xl border bg-card shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                >
                  <Link
                    href={`/ecommerce/products?category=${encodeURIComponent(category.slug)}`}
                    className="block"
                  >
                    <div className="relative aspect-[16/8] overflow-hidden bg-muted">
                      {category.image ? (
                        <Image
                          src={category.image}
                          alt={category.name}
                          fill
                          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                          className="object-cover transition duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/15 to-accent/20">
                          <Package className="h-14 w-14 text-primary/60" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 text-white">
                        <div>
                          <h2 className="text-xl font-black">{category.name}</h2>
                          <p className="mt-1 text-xs text-white/80">
                            {category.productCount} products
                          </p>
                        </div>
                        <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
                      </div>
                    </div>
                  </Link>

                  {children.length ? (
                    <div className="flex flex-wrap gap-2 p-4">
                      {children.slice(0, 8).map((child) => (
                        <Link
                          key={child.id}
                          href={`/ecommerce/products?category=${encodeURIComponent(child.slug)}`}
                          className="rounded-full border bg-background px-3 py-1.5 text-xs font-semibold transition hover:border-primary hover:text-primary"
                        >
                          {child.name} ({child.productCount})
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-8 rounded-3xl border border-dashed p-12 text-center text-muted-foreground">
            No categories are available yet.
          </div>
        )}
      </div>
    </div>
  );
}
