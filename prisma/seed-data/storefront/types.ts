import type { PrismaClient } from "../../../generated/prisma";

export type StorefrontSeedClient = PrismaClient;

export type StorefrontCategorySeed = {
  key: string;
  name: string;
  slug: string;
  image: string;
  parentKey?: string;
};

export type StorefrontBrandSeed = {
  key: string;
  name: string;
  slug: string;
};

export type StorefrontVariantSeed = {
  sku: string;
  price: number;
  costPrice: number;
  stock: number;
  options: Record<string, string>;
  isDefault?: boolean;
  colorImage?: string;
};

export type StorefrontProductSeed = {
  key: string;
  name: string;
  slug: string;
  sku: string;
  categoryKey: string;
  brandKey: string;
  description: string;
  shortDesc: string;
  basePrice: number;
  originalPrice?: number;
  image: string;
  gallery?: string[];
  weight?: number;
  dimensions?: Record<string, number>;
  featured?: boolean;
  soldCount: number;
  specs: Record<string, string>;
  variants: StorefrontVariantSeed[];
};

export type StorefrontSeedSummary = {
  categories: number;
  brands: number;
  products: number;
  variants: number;
  reviews: number;
  questions: number;
  banners: number;
  archivedProducts: number;
  archivedCategories: number;
  archivedBrands: number;
  archivedBanners: number;
};
