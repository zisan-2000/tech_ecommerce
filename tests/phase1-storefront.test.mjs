import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeStorefrontCategories,
  normalizeStorefrontProducts,
  normalizeStorefrontReviews,
} from "../lib/storefront-client-data.ts";
import {
  CATALOG_MAX_PAGE,
  catalogCanonicalUrl,
  catalogProductStock,
  catalogSearchTerms,
  catalogUrl,
  isIndexableCatalogView,
  parseCatalogFilters,
  resolveCatalogFilters,
} from "../lib/storefront-catalog.ts";
import { STOREFRONT_CATEGORIES } from "../prisma/seed-data/storefront/constants.ts";

test("storefront menu seed contains real third-level cable categories", () => {
  const cableCategory = STOREFRONT_CATEGORIES.find(
    (category) => category.key === "cable",
  );
  assert.ok(cableCategory);

  const childSlugs = STOREFRONT_CATEGORIES.filter(
    (category) => category.parentKey === cableCategory.key,
  ).map((category) => category.slug);

  assert.deepEqual(childSlugs, [
    "hdmi-cable",
    "displayport-cable",
    "usb-cable",
    "usb-type-c-cable",
    "vga-dvi-cable",
    "audio-cable",
    "network-cable",
    "power-cable",
    "converter-adapter",
  ]);
});

test("storefront categories are normalized into stable tab values", () => {
  assert.deepEqual(
    normalizeStorefrontCategories({
      data: [{ id: 7, name: "Laptops", slug: null }],
    }),
    [{ id: 7, name: "Laptops", slug: "" }],
  );
});

test("storefront products exclude unavailable records and derive variant stock", () => {
  const products = normalizeStorefrontProducts([
    {
      id: 1,
      name: "Gaming Laptop",
      slug: "gaming-laptop",
      categoryId: 7,
      basePrice: "125,000",
      currency: "BDT",
      variants: [{ stock: 2 }, { stock: "3" }],
    },
    { id: 2, name: "Hidden", available: false },
    { id: 3, name: "Deleted", deleted: true },
  ]);

  assert.equal(products.length, 1);
  assert.equal(products[0].basePrice, 125_000);
  assert.equal(products[0].stock, 5);
});

test("bundle stock uses the explicit bundle limit", () => {
  const [bundle] = normalizeStorefrontProducts([
    {
      id: 9,
      name: "Desktop Bundle",
      type: "BUNDLE",
      bundleStockLimit: "4",
      variants: [{ stock: 99 }],
    },
  ]);

  assert.equal(bundle.stock, 4);
});

test("best-selling normalization keeps only products with sales", () => {
  const products = normalizeStorefrontProducts(
    [
      { id: 1, name: "No sales", soldCount: 0 },
      { id: 2, name: "Popular", totalSold: 12 },
    ],
    { requireSold: true },
  );

  assert.deepEqual(products.map((product) => product.id), [2]);
});

test("review payloads accept the API wrapper shape", () => {
  const reviews = normalizeStorefrontReviews({
    reviews: [{ id: 3, productId: 2, rating: "5" }],
  });

  assert.equal(reviews[0].productId, 2);
  assert.equal(reviews[0].rating, "5");
});

test("catalog filters normalize repeated brands and bounded paging", () => {
  const filters = parseCatalogFilters({
    q: "  laptop  ",
    brand: ["asus", "asus,msi"],
    type: "physical",
    page: "-2",
    perPage: "999",
    inStock: "1",
  });

  assert.equal(filters.q, "laptop");
  assert.deepEqual(filters.brands, ["asus", "msi"]);
  assert.equal(filters.type, "PHYSICAL");
  assert.equal(filters.page, 1);
  assert.equal(filters.perPage, 24);
  assert.equal(filters.inStock, true);
});

test("catalog filters correct an inverted price range", () => {
  const filters = parseCatalogFilters({ minPrice: "5000", maxPrice: "1000" });
  assert.equal(filters.minPrice, 1000);
  assert.equal(filters.maxPrice, 5000);
});

test("catalog filters bound untrusted slugs, money and deep pagination", () => {
  const filters = parseCatalogFilters({
    q: "  HP\u0000   gaming   laptop  ",
    category: "Gaming-Laptop",
    brand: ["HP,hp", "not a slug", "ASUS"],
    minPrice: "1e3",
    maxPrice: "100000000",
    page: "999999",
  });

  assert.equal(filters.q, "HP gaming laptop");
  assert.equal(filters.category, "gaming-laptop");
  assert.deepEqual(filters.brands, ["hp", "asus"]);
  assert.equal(filters.minPrice, null);
  assert.equal(filters.maxPrice, null);
  assert.equal(filters.page, CATALOG_MAX_PAGE);
});

test("catalog search tokenizes terms and escapes SQL LIKE wildcards", () => {
  assert.deepEqual(catalogSearchTerms("HP 15% _gaming"), [
    "HP",
    "15\\%",
    "\\_gaming",
  ]);
  assert.equal(catalogSearchTerms("a b c d e f g h i j").length, 8);
});

test("catalog resolves numeric categories and removes unknown facet values", () => {
  const filters = parseCatalogFilters({
    category: "7",
    brand: ["hp", "unknown"],
  });
  const resolved = resolveCatalogFilters(filters, {
    categories: [{ id: 7, slug: "gaming-laptop" }],
    brands: [{ slug: "hp" }],
  });

  assert.equal(resolved.category, "gaming-laptop");
  assert.deepEqual(resolved.brands, ["hp"]);
});

test("catalog SEO only indexes stable landing views", () => {
  const category = parseCatalogFilters({ category: "laptop" });
  const filtered = parseCatalogFilters({
    category: "laptop",
    brand: "hp",
    minPrice: "50000",
    sort: "price-asc",
  });

  assert.equal(isIndexableCatalogView(category), true);
  assert.equal(isIndexableCatalogView(filtered), false);
  assert.equal(catalogCanonicalUrl(filtered), "/ecommerce/products?category=laptop");
});

test("catalog bundle stock is constrained by child inventory and quantity", () => {
  const bundle = {
    type: "BUNDLE",
    bundleStockLimit: 10,
    variants: [],
    bundleItems: [
      {
        quantity: 2,
        product: {
          available: true,
          deleted: false,
          variants: [{ stock: 7 }],
        },
      },
      {
        quantity: 1,
        product: {
          available: true,
          deleted: false,
          variants: [{ stock: 5 }],
        },
      },
    ],
  };

  assert.equal(catalogProductStock(bundle), 3);
  bundle.bundleItems[1].product.available = false;
  assert.equal(catalogProductStock(bundle), 0);
});

test("catalog physical stock never exposes negative inventory", () => {
  assert.equal(
    catalogProductStock({
      type: "PHYSICAL",
      bundleStockLimit: null,
      bundleItems: [],
      variants: [{ stock: -5 }, { stock: 4 }],
    }),
    4,
  );
});

test("catalog URLs preserve filters and omit defaults", () => {
  const filters = parseCatalogFilters({
    category: "laptops",
    brand: ["asus", "msi"],
    sort: "popular",
    page: "3",
  });
  const url = catalogUrl(filters, { page: 1 });

  assert.match(url, /^\/ecommerce\/products\?/);
  assert.match(url, /category=laptops/);
  assert.match(url, /brand=asus/);
  assert.match(url, /brand=msi/);
  assert.match(url, /sort=popular/);
  assert.doesNotMatch(url, /page=/);
});
