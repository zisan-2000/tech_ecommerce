import type { Metadata } from "next";
import AllBlogs from "@/components/admin/blog/AllBlogs";
import {
  getSiteSettingsForSeo,
  getSiteUrl,
  toAbsoluteUrl,
} from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettingsForSeo();
  return {
    title: "Technology Guides and Updates",
    description:
      "Read practical guides, product explainers, buying advice and technology updates from " +
      settings.siteTitle +
      ".",
    keywords: [
      "technology guides",
      "computer buying guide",
      "PC components",
      "gadget tips",
      "technology Bangladesh",
    ],
    alternates: { canonical: "/ecommerce/blogs" },
    openGraph: {
      type: "website",
      title: `Technology Guides and Updates | ${settings.siteTitle}`,
      description:
        "Practical buying advice, product explainers and technology updates.",
      url: "/ecommerce/blogs",
      siteName: settings.siteTitle,
      images: [{ url: toAbsoluteUrl(settings.logo), alt: settings.siteTitle }],
    },
  };
}

export default async function BlogsPage() {
  const [settings, siteUrl] = await Promise.all([
    getSiteSettingsForSeo(),
    Promise.resolve(getSiteUrl()),
  ]);

  const blogJsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${siteUrl}/ecommerce/blogs#blog`,
    name: `${settings.siteTitle} Technology Blog`,
    description:
      "Technology guides, product explainers, buying advice and store updates.",
    url: `${siteUrl}/ecommerce/blogs`,
    inLanguage: ["en-BD", "bn-BD"],
    publisher: {
      "@type": "Organization",
      name: settings.siteTitle,
      url: siteUrl,
      logo: {
        "@type": "ImageObject",
        url: toAbsoluteUrl(settings.logo),
      },
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      {
        "@type": "ListItem",
        position: 2,
        name: "Technology blog",
        item: `${siteUrl}/ecommerce/blogs`,
      },
    ],
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <section className="border-b border-border bg-muted/35">
        <div className="container mx-auto px-4 py-10">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">
            Learn and compare
          </p>
          <h1 className="mt-3 text-3xl font-bold">Technology guides and updates</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
            Practical buying advice, product explainers and useful technology
            updates for informed purchase decisions.
          </p>
        </div>
      </section>
      <div className="container mx-auto px-4 py-8">
        <AllBlogs />
      </div>
    </main>
  );
}
