export type Product = {
  id: number | string;
  name: string;
  slug?: string | null;
  sku?: string | null;
  model?: string | null;
  type?: 'PHYSICAL' | 'DIGITAL' | 'SERVICE' | 'BUNDLE' | null;
  available?: boolean;
  featured?: boolean;
  image: string | null;
  gallery?: string[] | null;
  basePrice: number;
  originalPrice: number | null;
  currency?: string | null;
  description?: string | null;
  shortDesc?: string | null;
  attributes?: Array<{
    id?: number | string;
    value: string;
    attribute: { id?: number | string; name: string };
  }>;
  dimensions?: any;
  weight?: number | null;
  categoryId?: number | null;
  category?: { id: number; name: string } | null;
  brand?: { id: number; name: string } | null;
  variants?: Variant[];
  ratingAvg?: number | null;
  ratingCount?: number | null;
  bundleItemCount?: number | null;
  bundleSavings?: string | null;
  rank?: number | null;
};

export type Variant = {
  id: number | string;
  stock?: number | null;
  price?: number | string | null;
  sku?: string | null;
  image?: string | null;
  colorImage?: string | null;
  gallery?: string[] | null;
  originalPrice?: number | string | null;
  options?: Record<string, unknown>;
};
