"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { cachedFetchJson } from "@/lib/client-cache-fetch";
import { DEFAULT_SITE_TITLE } from "@/lib/site-defaults";
import SpotlightCard from "../SpotlightCard";
import {
  Facebook,
  Instagram,
  Twitter,
  Mail,
  Phone,
  MapPin,
  CircleHelp,
  Shield,
  Truck,
  HeadphonesIcon,
  Send,
  Heart,
  CreditCard,
  Clock,
  ChevronRight,
  Award,
  Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type ApiCategory = {
  id: number | string;
  name: string;
  slug?: string | null;
  parentId?: number | string | null;
};

type SiteSettings = {
  logo?: string | null;
  siteTitle?: string | null;
  footerDescription?: string | null;
  contactNumber?: string | null;
  contactEmail?: string | null;
  address?: string | null;
  facebookLink?: string | null;
  instagramLink?: string | null;
  twitterLink?: string | null;
  tiktokLink?: string | null;
  youtubeLink?: string | null;
};

export default function Footer({
  siteSettingsData,
  categoriesData,
}: {
  siteSettingsData?: SiteSettings;
  categoriesData?: ApiCategory[];
}) {
  const currentYear = new Date().getFullYear();
  const [email, setEmail] = useState("");
  const [isSubscribing, setIsSubscribing] = useState(false);

  // Site settings
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(
    siteSettingsData ?? {},
  );

  // Load site settings
  useEffect(() => {
    const loadSiteSettings = async () => {
      try {
        const data =
          siteSettingsData ??
          (await cachedFetchJson<any>("/api/site?view=storefront", {
            ttlMs: 5 * 60 * 1000,
          }));
        setSiteSettings(data);
      } catch (error) {
        console.error("Failed to load site settings:", error);
      }
    };

    loadSiteSettings();
  }, [siteSettingsData]);

  // ✅ categories from API
  const [categories, setCategories] = useState<
    Array<{ href: string; label: string }>
  >(() =>
    (categoriesData ?? [])
      .filter((category) => category.parentId === null)
      .map((category) => ({
        href: `/ecommerce/products?category=${encodeURIComponent(String(category.slug ?? category.id))}`,
        label: String(category.name ?? ""),
      }))
      .filter((category) => category.label),
  );

  useEffect(() => {
    let mounted = true;

    const loadCategories = async () => {
      try {
        const data =
          categoriesData ??
          ((await cachedFetchJson<ApiCategory[]>("/api/categories?view=storefront", {
            ttlMs: 5 * 60 * 1000,
          })) as ApiCategory[]);
        if (!mounted) return;

        const list = Array.isArray(data) ? data : [];

        // optional: show only root categories (parentId null)
        const roots = list.filter(
          (c) => c.parentId === null || c.parentId === undefined,
        );

        const mapped = roots
          .map((c) => {
            const id = Number(c.id);
            const label = String(c.name ?? "").trim();
            if (!label || !Number.isFinite(id)) return null;

            return {
              href: `/ecommerce/products?category=${encodeURIComponent(String(c.slug ?? id))}`,
              label,
            };
          })
          .filter(Boolean) as Array<{ href: string; label: string }>;

        setCategories(mapped);
      } catch (e) {
        // fail silently in footer
        console.error("Failed to load categories:", e);
      }
    };

    loadCategories();
    return () => {
      mounted = false;
    };
  }, [categoriesData]);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error("Please enter your email address");
      return;
    }

    setIsSubscribing(true);

    try {
      const checkRes = await fetch("/api/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const check = await checkRes.json();

      if (!check.valid) {
        toast.error("This email is not valid or already exists");
        setIsSubscribing(false);
        return;
      }

      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Successfully subscribed!");
        setEmail("");
      } else {
        toast.error(data.error || "Something went wrong while subscribing");
      }
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubscribing(false);
    }
  };

  const features = [
    { icon: Truck, label: "Fast Delivery", desc: "Nationwide delivery options" },
    { icon: Clock, label: "Online Ordering", desc: "Place orders 24/7" },
    { icon: CreditCard, label: "Secure Payment", desc: "Protected payment flow" },
    {
      icon: Award,
      label: "100% Authentic",
      desc: "Guaranteed genuine products",
    },
  ];

  const quickLinks = [
    { href: "/ecommerce/products", label: "All Products" },
    { href: "/ecommerce/flash-sale", label: "Flash Sale" },
    { href: "/ecommerce/blogs", label: "Blogs" },
    { href: "/ecommerce/bestsellers", label: "Bestsellers" },
    { href: "/ecommerce/about", label: "About Us" },
    { href: "/ecommerce/contact", label: "Contact Us" },
  ];

  const customerService = [
    { href: "/ecommerce/shipping", label: "Shipping Policy", icon: Truck },
    {
      href: "/ecommerce/returns",
      label: "Return Policy",
      icon: HeadphonesIcon,
    },
    { href: "/ecommerce/privacy", label: "Privacy Policy", icon: Shield },
    { href: "/ecommerce/faq", label: "FAQ", icon: CircleHelp },
  ];

  const socialLinks = [
    { icon: Facebook, href: siteSettings.facebookLink, label: "Facebook" },
    { icon: Instagram, href: siteSettings.instagramLink, label: "Instagram" },
    { icon: Twitter, href: siteSettings.twitterLink, label: "Twitter" },
    { icon: Youtube, href: siteSettings.youtubeLink, label: "YouTube" },
  ].filter((social): social is typeof social & { href: string } =>
    Boolean(social.href),
  );

  return (
    <footer className="bg-card border-t border-border">
      {/* Features Bar */}
      <div className="border-b border-border bg-muted/30 shadow-sm">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="flex items-center gap-3 group cursor-pointer"
              >
                <div className="p-2 rounded-lg bg-primary/5 text-primary">
                  <feature.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {feature.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {feature.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Footer Content */}
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Brand Column */}
          <div className="lg:col-span-3 space-y-6">
            <Link href="/" className="inline-block group">
              <div className="flex items-center gap-3">
                <div className="bg-primary rounded-2xl text-primary-foreground">
                  <Image
                    src={siteSettings.logo || "/assets/examplelogo.jpg"}
                    alt="Logo"
                    width={50}
                    height={50}
                    className="object-contain rounded-2xl"
                  />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">
                    {siteSettings.siteTitle?.trim() || DEFAULT_SITE_TITLE}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Computers, components and gadgets
                  </p>
                </div>
              </div>
            </Link>

            <p className="text-sm text-muted-foreground leading-relaxed">
              {siteSettings.footerDescription ||
                "Shop computers, components, accessories and gadgets with verified inventory, secure checkout and nationwide delivery."}
            </p>

            <div className="space-y-3">
              <div className="flex items-center gap-3 group cursor-pointer">
                <div className="p-2 rounded-lg bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                  <Phone className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Call us</p>
                  <p className="text-sm font-medium text-foreground">
                    {siteSettings.contactNumber || "Contact number not configured"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 group cursor-pointer">
                <div className="p-2 rounded-lg bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                  <Mail className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Email us</p>
                  <p className="text-sm font-medium text-foreground">
                    {siteSettings.contactEmail || "Contact email not configured"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 group cursor-pointer">
                <div className="p-2 rounded-lg bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 mt-1">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Address</p>
                  <p className="text-sm font-medium text-foreground leading-relaxed">
                    {siteSettings.address || "Business address not configured"}
                  </p>
                </div>
              </div>
            </div>

            {/* Social Links */}
            <div className="flex gap-2">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  className="p-2 rounded-lg bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-all duration-300"
                >
                  <social.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Links Columns */}
          <div className={`lg:col-span-6 grid gap-6 ${categories.length > 0 ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-2'}`}>
            {/* Quick Links */}
            <div className="relative">
              <div className="absolute -left-3 top-0 w-1 h-6 bg-gradient-to-b from-primary to-primary/50 rounded-full" />
              <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Quick Links
              </h3>
              <ul className="space-y-1.5">
                {quickLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground hover:pl-2 flex items-center gap-2 group transition-all duration-300 relative"
                    >
                      <span className="absolute left-0 w-0 h-px bg-primary group-hover:w-4 transition-all duration-300" />
                      <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-all duration-300" />
                      <span className="group-hover:font-medium">{link.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* ✅ Categories (from /api/categories) - Only show if categories exist */}
            {categories.length > 0 && (
              <div className="relative">
                <div className="absolute -left-3 top-0 w-1 h-6 bg-gradient-to-b from-primary to-primary/50 rounded-full" />
                <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  Categories
                </h3>
                <ul className="space-y-1.5">
                  {categories.slice(0, 10).map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground hover:text-foreground hover:pl-2 flex items-center gap-2 group transition-all duration-300 relative"
                      >
                        <span className="absolute left-0 w-0 h-px bg-primary group-hover:w-4 transition-all duration-300" />
                        <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-all duration-300" />
                        <span className="group-hover:font-medium">{link.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Customer Service */}
            <div className="relative">
              <div className="absolute -left-3 top-0 w-1 h-6 bg-gradient-to-b from-primary to-primary/50 rounded-full" />
              <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Customer Service
              </h3>
              <ul className="space-y-1.5">
                {customerService.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground hover:pl-2 flex items-center gap-2 group transition-all duration-300 relative"
                    >
                      <span className="absolute left-0 w-0 h-px bg-primary group-hover:w-4 transition-all duration-300" />
                      <link.icon className="h-3.5 w-3.5 text-primary/70 group-hover:text-primary transition-colors duration-300" />
                      <span className="group-hover:font-medium">{link.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Newsletter Column */}
          <div className="lg:col-span-3">
            <SpotlightCard
              className="!p-0 !border-border !bg-card !rounded-xl overflow-hidden"
              spotlightColor="rgba(0, 229, 255, 0.1)"
            >
              <div className="bg-muted/30 rounded-xl p-6 border border-border">
                <h3 className="text-sm font-semibold text-foreground mb-2">
                  Newsletter
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Subscribe to our newsletter to get the latest updates and
                  exclusive offers.
                </p>

                <form onSubmit={handleSubscribe} className="space-y-3">
                  <div className="relative">
                    <Input
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-background border-border text-foreground placeholder:text-muted-foreground/50 pr-10"
                    />
                    <Send className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  </div>
                  <Button
                    type="submit"
                    disabled={isSubscribing}
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300 disabled:opacity-50"
                  >
                    {isSubscribing ? (
                      <span className="flex items-center gap-2">
                        <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                        Subscribing...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        Subscribe
                        <Send className="h-4 w-4" />
                      </span>
                    )}
                  </Button>
                </form>

                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-center gap-2">
                    <Heart className="h-4 w-4 text-primary" />
                    <p className="text-xs text-muted-foreground">
                      100% Secure Transactions
                    </p>
                  </div>
                </div>
              </div>
            </SpotlightCard>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-border bg-muted/30">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs text-muted-foreground">
              © {currentYear} {siteSettings.siteTitle?.trim() || DEFAULT_SITE_TITLE} All rights reserved.
            </p>

            <div className="flex items-center gap-6">
              {[
                { href: "/ecommerce/privacy", label: "Privacy Policy" },
                { href: "/ecommerce/terms", label: "Terms of Service" },
                { href: "/sitemap.xml", label: "Sitemap" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="px-2 py-1 bg-background border border-border rounded text-xs text-muted-foreground">
                Visa
              </div>
              <div className="px-2 py-1 bg-background border border-border rounded text-xs text-muted-foreground">
                Mastercard
              </div>
              <div className="px-2 py-1 bg-background border border-border rounded text-xs text-muted-foreground">
                bkash
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
