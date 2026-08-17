import { NextResponse } from "next/server";

export async function GET() {
  const siteUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";

  let categories: any[] = [];
  try {
    const res = await fetch(`${siteUrl}/api/categories`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`Failed to fetch categories: ${res.status}`);
    const data = await res.json();
    categories = Array.isArray(data) ? data : (data?.categories || []);
  } catch (error) {
    console.error("Error fetching categories for sitemap:", error);
    categories = [];
  }

  const urls = categories
    .map(
      (cat: any) => `
      <url>
        <loc>${siteUrl}/ecommerce/products?category=${encodeURIComponent(String(cat.slug ?? cat.id))}</loc>
        <lastmod>${new Date().toISOString()}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.7</priority>
      </url>`
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${urls}
  </urlset>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml",
    },
  });
}
