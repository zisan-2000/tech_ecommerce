import type React from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Rubik } from "next/font/google";
import { Syne } from "next/font/google";
import { Lexend } from "next/font/google";
import "@fontsource/noto-sans-bengali/400.css";
import "@fontsource/noto-sans-bengali/500.css";
import "@fontsource/noto-sans-bengali/600.css";
import "@fontsource/noto-sans-bengali/700.css";
import "./globals.css";
import { ThemeProvider } from "@/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import TreeProvider from "@/providers/treeProvider";
import { CartProvider } from "@/components/ecommarce/CartContext";
import { WishlistProvider } from "@/components/ecommarce/WishlistContext";
import { Providers } from "./providers";
import SupportChatWidget from "@/components/chat/SupportChatWidget";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import ScrollToTopButton from "@/components/ecommarce/ScrollToTopButton";
import { buildDefaultMetadata, getSiteUrl, getSiteSettingsForSeo } from "@/lib/seo";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
  display: "swap",
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal"],
  display: "swap",
});

const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  style: ["normal"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  return buildDefaultMetadata();
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const siteUrl = getSiteUrl();
  const siteSettings = await getSiteSettingsForSeo();
  
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}#website`,
    url: siteUrl,
    name: siteSettings.siteTitle,
    description: siteSettings.siteDescription,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string"
    }
  };

  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl}#organization`,
    name: siteSettings.siteTitle,
    url: siteUrl,
    logo: {
      "@type": "ImageObject",
      url: `${siteUrl}${siteSettings.logo}`,
      width: 512,
      height: 512
    },
    description: siteSettings.siteDescription,
    contactPoint: siteSettings.contactEmail ? {
      "@type": "ContactPoint",
      telephone: siteSettings.contactNumber,
      contactType: "customer service",
      availableLanguage: ["en", "bn"]
    } : undefined,
    address: siteSettings.address ? {
      "@type": "PostalAddress",
      streetAddress: siteSettings.address,
      addressCountry: "BD"
    } : undefined,
    sameAs: [
      // Add social media links when available
    ].filter(Boolean)
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} ${rubik.variable} ${syne.variable} ${lexend.variable} antialiased min-h-screen flex flex-col`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteJsonLd),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
        <ThemeProvider>
          <Providers>
            <AnalyticsTracker />
            <TreeProvider>
              <CartProvider>
                <WishlistProvider>
                  <main className="flex-1">{children}</main>
                  <ScrollToTopButton />
                  <SupportChatWidget />
                </WishlistProvider>
              </CartProvider>
            </TreeProvider>
          </Providers>
          <Toaster position="bottom-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
