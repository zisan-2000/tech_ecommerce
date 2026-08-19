import type { MetadataRoute } from "next";
import { getSiteSettingsForSeo } from "@/lib/seo";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getSiteSettingsForSeo();

  return {
    name: settings.siteTitle,
    short_name: settings.siteTitle.slice(0, 24),
    description: settings.siteDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    categories: ["shopping", "technology"],
    icons: [
      {
        src: settings.logo,
        sizes: "any",
        purpose: "any",
      },
    ],
  };
}
