"use client";

import { useSession } from "@/lib/auth-client";
import type { StorefrontHomeData } from "@/lib/storefront-home";
import Header from "@/components/ecommarce/header";
import Hero from "@/components/ecommarce/hero";
import FeatureStrip from "@/components/ecommarce/FeatureCard";
import FeaturedCategories from "@/components/ecommarce/FeaturedCategories";
import FlashSale from "@/components/ecommarce/FlashSale";
import NewArrivals from "@/components/ecommarce/NewArrivals";
import BrandSlider from "@/components/ecommarce/BrandSlider";
import FeaturedProducts from "@/components/ecommarce/FeaturedProducts";
import PromotionBanner from "@/components/ecommarce/PromotionBanner";
import BestSelling from "@/components/ecommarce/BestSelling";
import PopupBanner from "@/components/ecommarce/PopupBanner";
import FloatingCartButton from "@/components/ecommarce/FloatingCartButton";
import ReviewCarousel from "@/components/ecommarce/ReviewCarosol";
import Footer from "@/components/ecommarce/footer";

export default function StorefrontHome({
  data,
  loadError = false,
}: {
  data: StorefrontHomeData;
  loadError?: boolean;
}) {
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";
  const heroBanners = data.banners.map((banner) => ({
    ...banner,
    href: banner.buttonLink ?? undefined,
  }));

  return (
    <div className="storefront-type min-h-screen w-full bg-background">
      <Header
        siteSettingsData={data.siteSettings}
        categoriesData={data.categories}
      />

      <main className="container mx-auto">
        {loadError ? (
          <div className="mx-3 mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:mx-6">
            Some storefront data is temporarily unavailable. Please refresh shortly.
          </div>
        ) : null}

        <Hero bannersData={heroBanners} />
        <FeatureStrip />
        <FeaturedCategories categoriesData={data.categories} />
        <FlashSale
          productsData={data.flashSaleProducts}
          isAuthenticated={isAuthenticated}
        />
        <NewArrivals
          productsData={data.products}
          categoriesData={data.categories}
          reviewsData={[]}
          isAuthenticated={isAuthenticated}
        />
        <BrandSlider />
        <FeaturedProducts
          productsData={data.products}
          categoriesData={data.categories}
          reviewsData={[]}
          isAuthenticated={isAuthenticated}
        />
        <PromotionBanner banners={data.banners} />
        <BestSelling
          limit={20}
          topSellingData={data.topSellingProducts}
          reviewsData={[]}
          isAuthenticated={isAuthenticated}
        />
        <PopupBanner banners={data.banners} />
      </main>

      <FloatingCartButton />
      <ReviewCarousel />
      <Footer
        siteSettingsData={data.siteSettings}
        categoriesData={data.categories}
      />
    </div>
  );
}
