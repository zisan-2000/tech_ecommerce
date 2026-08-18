"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import ProductManager from "@/components/management/ProductManager";
import { clearCachedFetch } from "@/lib/client-cache-fetch";

interface Product {
  id: number;
  name: string;
  description?: string;
  shortDesc?: string | null;
  basePrice: number;
  originalPrice?: number;
  currency?: string;
  type?: "PHYSICAL" | "DIGITAL" | "SERVICE";
  sku?: string | null;
  weight?: number | null;
  dimensions?: any;
  VatClassId?: number | null;
  digitalAssetId?: number | null;
  serviceDurationMinutes?: number | null;
  serviceLocation?: string | null;
  serviceOnlineLink?: string | null;
  image?: string;
  gallery?: string[];
  videoUrl?: string | null;
  available: boolean;
  updatedAt: string;
  featured?: boolean;
  categoryId?: number;
  brandId?: number | null;
  writerId?: number | null;
  publisherId?: number | null;
  category?: Category;
  brand?: Brand;
  writer?: Writer | null;
  publisher?: Publisher | null;
  variants?: any[];
}

interface Category {
  id: number;
  name: string;
}

interface Brand {
  id: number;
  name: string;
}

interface Writer {
  id: number;
  name: string;
}

interface Publisher {
  id: number;
  name: string;
}

interface VatClass {
  id: number;
  name: string;
  code: string;
}

interface DigitalAsset {
  id: number;
  title: string;
}

interface ProductsPageCache {
  products: Product[];
  categories: Category[];
  brands: Brand[];
  writers: Writer[];
  publishers: Publisher[];
  vatClasses: VatClass[];
  digitalAssets: DigitalAsset[];
}

let productsPageCache: ProductsPageCache | null = null;

function invalidateStorefrontProductCache() {
  clearCachedFetch("GET:/api/products");
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem("home_page_processed_data");
  }
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>(
    () => productsPageCache?.products ?? [],
  );
  const [categories, setCategories] = useState<Category[]>(
    () => productsPageCache?.categories ?? [],
  );
  const [brands, setBrands] = useState<Brand[]>(
    () => productsPageCache?.brands ?? [],
  );
  const [writers, setWriters] = useState<Writer[]>(
    () => productsPageCache?.writers ?? [],
  );
  const [publishers, setPublishers] = useState<Publisher[]>(
    () => productsPageCache?.publishers ?? [],
  );
  const [vatClasses, setVatClasses] = useState<VatClass[]>(
    () => productsPageCache?.vatClasses ?? [],
  );
  const [digitalAssets, setDigitalAssets] = useState<DigitalAsset[]>(
    () => productsPageCache?.digitalAssets ?? [],
  );
  const [loading, setLoading] = useState(() => !productsPageCache);

  const loadAll = useCallback(async () => {
    if (productsPageCache) {
      setProducts(productsPageCache.products);
      setCategories(productsPageCache.categories);
      setBrands(productsPageCache.brands);
      setWriters(productsPageCache.writers);
      setPublishers(productsPageCache.publishers);
      setVatClasses(productsPageCache.vatClasses);
      setDigitalAssets(productsPageCache.digitalAssets);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [p, c, b, w, pub, vat, da] = await Promise.all([
        fetch("/api/products").then((r) => r.json()),
        fetch("/api/categories").then((r) => r.json()),
        fetch("/api/brands").then((r) => r.json()),
        fetch("/api/writers").then((r) => r.json()),
        fetch("/api/publishers").then((r) => r.json()),
        fetch("/api/vat-classes").then((r) => r.json()),
        fetch("/api/digital-assets").then((r) => r.json()),
      ]);

      productsPageCache = {
        products: p,
        categories: c,
        brands: b,
        writers: w,
        publishers: pub,
        vatClasses: vat,
        digitalAssets: da,
      };

      setProducts(p);
      setCategories(c);
      setBrands(b);
      setWriters(w);
      setPublishers(pub);
      setVatClasses(vat);
      setDigitalAssets(da);
    } catch (error) {
      console.error("Error loading products:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const createProduct = useCallback(async (data: unknown) => {
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Create failed");
    }

    const newProduct = await res.json();

    setProducts((prev) => [newProduct, ...prev]);
    if (productsPageCache) {
      productsPageCache = {
        ...productsPageCache,
        products: [newProduct, ...productsPageCache.products],
      };
    }
    invalidateStorefrontProductCache();
  }, []);

  const updateProduct = useCallback(async (id: number, data: unknown) => {
    const res = await fetch(`/api/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Update failed");
    }

    const updated = await res.json();

    setProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
    if (productsPageCache) {
      productsPageCache = {
        ...productsPageCache,
        products: productsPageCache.products.map((p) =>
          p.id === id ? updated : p,
        ),
      };
    }
    invalidateStorefrontProductCache();

    return updated;
  }, []);

  const updateProductAvailability = useCallback(
    async (id: number, available: boolean, expectedUpdatedAt: string) => {
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ available, expectedUpdatedAt }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          const latestResponse = await fetch("/api/products", {
            cache: "no-store",
          });
          if (latestResponse.ok) {
            const latestProducts = (await latestResponse.json()) as Product[];
            setProducts(latestProducts);
            if (productsPageCache) {
              productsPageCache = {
                ...productsPageCache,
                products: latestProducts,
              };
            }
          }
        }

        throw new Error(
          payload?.error || "Failed to update product availability",
        );
      }

      const updated = payload as Product;
      setProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
      if (productsPageCache) {
        productsPageCache = {
          ...productsPageCache,
          products: productsPageCache.products.map((p) =>
            p.id === id ? updated : p,
          ),
        };
      }
      invalidateStorefrontProductCache();
      return updated;
    },
    [],
  );

  const deleteProduct = useCallback(async (id: number) => {
    await fetch(`/api/products/${id}`, { method: "DELETE" });

    setProducts((prev) => prev.filter((p) => p.id !== id));
    if (productsPageCache) {
      productsPageCache = {
        ...productsPageCache,
        products: productsPageCache.products.filter((p) => p.id !== id),
      };
    }
    invalidateStorefrontProductCache();
  }, []);

  const memoizedProducts = useMemo(() => products, [products]);
  const memoizedCategories = useMemo(() => categories, [categories]);
  const memoizedBrands = useMemo(() => brands, [brands]);
  const memoizedWriters = useMemo(() => writers, [writers]);
  const memoizedPublishers = useMemo(() => publishers, [publishers]);
  const memoizedVatClasses = useMemo(() => vatClasses, [vatClasses]);
  const memoizedDigitalAssets = useMemo(() => digitalAssets, [digitalAssets]);

  return (
    <div className="min-h-screen bg-background">
      <ProductManager
        products={memoizedProducts}
        categories={memoizedCategories}
        brands={memoizedBrands}
        writers={memoizedWriters}
        publishers={memoizedPublishers}
        vatClasses={memoizedVatClasses}
        digitalAssets={memoizedDigitalAssets}
        loading={loading}
        onCreate={createProduct}
        onUpdate={updateProduct}
        onAvailabilityChange={updateProductAvailability}
        onDelete={deleteProduct}
      />
    </div>
  );
}
