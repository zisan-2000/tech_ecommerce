import type { Metadata } from "next";
import StorefrontHome from "@/components/ecommarce/StorefrontHome";
import {
  emptyStorefrontHomeData,
  getStorefrontHomeData,
} from "@/lib/storefront-home";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Tech Ecommerce — Computers, Components & Gadgets",
  description:
    "Shop computers, components, accessories and gadgets with nationwide delivery across Bangladesh.",
  alternates: { canonical: "/" },
};

async function loadStorefrontHome() {
  try {
    return { data: await getStorefrontHomeData(), loadError: false };
  } catch (error) {
    console.error("STOREFRONT HOME DATA ERROR:", error);
    return { data: emptyStorefrontHomeData(), loadError: true };
  }
}

export default async function HomePage() {
  const storefront = await loadStorefrontHome();
  return <StorefrontHome {...storefront} />;
}
