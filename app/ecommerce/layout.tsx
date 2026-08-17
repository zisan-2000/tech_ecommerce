import { cache, Suspense, type ReactNode } from "react";
import Header from "@/components/ecommarce/header";
import Footer from "@/components/ecommarce/footer";
import FloatingCartButton from "@/components/ecommarce/FloatingCartButton";
import { getStorefrontCatalogFacets } from "@/lib/storefront-catalog";

const getNavigation = cache(getStorefrontCatalogFacets);

async function StorefrontHeader() {
  const navigation = await getNavigation();
  return (
    <Header
      siteSettingsData={navigation.siteSettings}
      productsData={[]}
      categoriesData={navigation.categories}
    />
  );
}

async function StorefrontFooter() {
  const navigation = await getNavigation();
  return (
    <Footer
      siteSettingsData={navigation.siteSettings}
      categoriesData={navigation.categories}
    />
  );
}

export default function EcommerceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full">
      <div className="flex min-h-screen flex-col">
        <Suspense
          fallback={<div className="h-20 border-b bg-background" aria-hidden />}
        >
          <StorefrontHeader />
        </Suspense>
        <div className="flex-1">{children}</div>
        <FloatingCartButton />
        <Suspense
          fallback={<div className="h-72 border-t bg-card" aria-hidden />}
        >
          <StorefrontFooter />
        </Suspense>
      </div>
    </div>
  );
}
