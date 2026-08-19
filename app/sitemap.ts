import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const now = new Date();
  const staticRouteDefinitions = [
    { path: "", changeFrequency: "daily", priority: 1 },
    { path: "/ecommerce/products", changeFrequency: "daily", priority: 0.9 },
    { path: "/ecommerce/categories", changeFrequency: "weekly", priority: 0.8 },
    { path: "/ecommerce/brands", changeFrequency: "weekly", priority: 0.8 },
    { path: "/ecommerce/flash-sale", changeFrequency: "daily", priority: 0.85 },
    { path: "/ecommerce/pc-builder", changeFrequency: "daily", priority: 0.85 },
    { path: "/ecommerce/bestsellers", changeFrequency: "daily", priority: 0.8 },
    { path: "/ecommerce/blogs", changeFrequency: "weekly", priority: 0.7 },
    { path: "/ecommerce/about", changeFrequency: "monthly", priority: 0.5 },
    { path: "/ecommerce/contact", changeFrequency: "monthly", priority: 0.6 },
    { path: "/ecommerce/faq", changeFrequency: "monthly", priority: 0.5 },
    { path: "/ecommerce/shipping", changeFrequency: "monthly", priority: 0.5 },
    { path: "/ecommerce/returns", changeFrequency: "monthly", priority: 0.5 },
    { path: "/ecommerce/privacy", changeFrequency: "yearly", priority: 0.3 },
    { path: "/ecommerce/terms", changeFrequency: "yearly", priority: 0.3 },
  ] as const;
  const staticRoutes: MetadataRoute.Sitemap = staticRouteDefinitions.map((route) => ({
    url: `${siteUrl}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  try {
    const [products, blogs, brands, categories] = await Promise.all([
      prisma.product.findMany({
        where: { deleted: false, available: true },
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.blog.findMany({
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.brand.findMany({
        where: { deleted: false },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.category.findMany({
        where: { deleted: false },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    return [
      ...staticRoutes,
      ...products.map((product) => ({
        url: `${siteUrl}/ecommerce/products/${product.id}`,
        lastModified: product.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
      ...blogs.map((blog) => ({
        url: `${siteUrl}/ecommerce/blogs/${encodeURIComponent(blog.slug)}`,
        lastModified: blog.updatedAt,
        changeFrequency: "monthly" as const,
        priority: 0.65,
      })),
      ...brands.map((brand) => ({
        url: `${siteUrl}/ecommerce/brands/${encodeURIComponent(brand.slug)}`,
        lastModified: brand.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
      ...categories.map((category) => ({
        url: `${siteUrl}/ecommerce/products?category=${encodeURIComponent(category.slug)}`,
        lastModified: category.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    ];
  } catch (error) {
    console.error("Sitemap data loading failed", error);
    return staticRoutes;
  }
}
