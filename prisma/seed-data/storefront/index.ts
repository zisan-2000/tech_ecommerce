import bcrypt from "bcrypt";
import type { PrismaClient } from "../../../generated/prisma";
import {
  STOREFRONT_BANNERS,
  STOREFRONT_BRANDS,
  STOREFRONT_CATEGORIES,
  STOREFRONT_PRODUCTS,
  STOREFRONT_QUESTIONS,
  STOREFRONT_REVIEW_COMMENTS,
} from "./constants";
import type { StorefrontSeedSummary } from "./types";

const DEMO_CUSTOMERS = [
  {
    email: "customer.one@storefront.demo",
    name: "Arafat Rahman",
    phone: "01711000001",
  },
  {
    email: "customer.two@storefront.demo",
    name: "Nusrat Jahan",
    phone: "01811000002",
  },
] as const;

async function ensureAdmin(prisma: PrismaClient, adminUserId?: string | null) {
  if (adminUserId) {
    const admin = await prisma.user.findUnique({
      where: { id: adminUserId },
      select: { id: true },
    });
    if (admin) return admin;
  }

  const passwordHash = await bcrypt.hash("admin123", 10);
  return prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {
      name: "Admin User",
      role: "admin",
      passwordHash,
      emailVerified: new Date(),
      banned: false,
    },
    create: {
      email: "admin@example.com",
      name: "Admin User",
      role: "admin",
      passwordHash,
      emailVerified: new Date(),
      banned: false,
    },
    select: { id: true },
  });
}

async function ensureCustomers(prisma: PrismaClient) {
  const passwordHash = await bcrypt.hash("Demo123!", 10);
  const customers = [];

  for (const customer of DEMO_CUSTOMERS) {
    customers.push(
      await prisma.user.upsert({
        where: { email: customer.email },
        update: {
          name: customer.name,
          phone: customer.phone,
          role: "user",
          passwordHash,
          emailVerified: new Date(),
          banned: false,
          note: "Storefront demo customer",
        },
        create: {
          email: customer.email,
          name: customer.name,
          phone: customer.phone,
          role: "user",
          passwordHash,
          emailVerified: new Date(),
          banned: false,
          note: "Storefront demo customer",
        },
        select: { id: true, name: true, email: true },
      }),
    );
  }

  return customers;
}

async function ensureWarehouse(prisma: PrismaClient) {
  const defaultWarehouse = await prisma.warehouse.findFirst({
    where: { isDefault: true },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (defaultWarehouse) return defaultWarehouse;

  return prisma.warehouse.upsert({
    where: { code: "STOREFRONT-DHK" },
    update: {
      name: "Storefront Dhaka Warehouse",
      isDefault: true,
      country: "BD",
      division: "Dhaka",
      district: "Dhaka",
      area: "Tejgaon",
    },
    create: {
      code: "STOREFRONT-DHK",
      name: "Storefront Dhaka Warehouse",
      isDefault: true,
      country: "BD",
      division: "Dhaka",
      district: "Dhaka",
      area: "Tejgaon",
      address: {
        line1: "Demo Technology Distribution Center",
        area: "Tejgaon",
        city: "Dhaka",
        country: "Bangladesh",
      },
    },
    select: { id: true },
  });
}

async function ensureShippingRates(
  prisma: PrismaClient,
  warehouseId: number,
) {
  const rates = [
    {
      area: "Dhaka",
      district: "Dhaka",
      baseCost: 80,
      freeMinOrder: 5000,
      estimatedDays: 1,
      priority: 10,
    },
    {
      area: "Outside Dhaka",
      district: "Outside Dhaka",
      baseCost: 130,
      freeMinOrder: 10000,
      estimatedDays: 3,
      priority: 20,
    },
  ];

  for (const rate of rates) {
    const existing = await prisma.shippingRate.findFirst({
      where: {
        country: "BD",
        area: rate.area,
        deliveryType: "STANDARD",
        warehouseId,
      },
      select: { id: true },
    });
    const data = {
      country: "BD",
      area: rate.area,
      district: rate.district,
      baseCost: rate.baseCost,
      freeMinOrder: rate.freeMinOrder,
      estimatedDays: rate.estimatedDays,
      priority: rate.priority,
      deliveryType: "STANDARD",
      isActive: true,
      warehouseId,
      weightSlabs: [
        { maxKg: 5, extraCost: 0 },
        { maxKg: 15, extraCost: 80 },
        { maxKg: null, extraCost: 180 },
      ],
    };

    if (existing) {
      await prisma.shippingRate.update({ where: { id: existing.id }, data });
    } else {
      await prisma.shippingRate.create({ data });
    }
  }
}

async function ensureSitePresentation(prisma: PrismaClient) {
  const existingSettings = await prisma.sitesettings.findFirst({
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (!existingSettings) {
    await prisma.sitesettings.create({
      data: {
        siteTitle: "TechHub BD Demo",
        logo: "/logo.svg",
        footerDescription:
          "Computers, components, gadgets and home technology from a single demo storefront.",
        contactNumber: "+880 1700-000000",
        contactEmail: "hello@techhub.demo",
        address: "Dhaka, Bangladesh",
      },
    });
  }

  for (const banner of STOREFRONT_BANNERS) {
    const existing = await prisma.banner.findFirst({
      where: { title: banner.title },
      select: { id: true },
    });
    if (existing) {
      await prisma.banner.update({ where: { id: existing.id }, data: banner });
    } else {
      await prisma.banner.create({ data: banner });
    }
  }

  await prisma.coupon.upsert({
    where: { code: "DEMO10" },
    update: {
      discountType: "percentage",
      discountValue: 10,
      minOrderValue: 3000,
      maxDiscount: 1500,
      usageLimit: 500,
      isValid: true,
      expiresAt: new Date("2028-12-31T17:59:59.000Z"),
    },
    create: {
      code: "DEMO10",
      discountType: "percentage",
      discountValue: 10,
      minOrderValue: 3000,
      maxDiscount: 1500,
      usageLimit: 500,
      isValid: true,
      expiresAt: new Date("2028-12-31T17:59:59.000Z"),
    },
  });
}

async function enforceTechOnlyStorefront(
  prisma: PrismaClient,
  techProductIds: number[],
  techCategoryIds: number[],
  techBrandIds: number[],
) {
  const techBannerTitles = STOREFRONT_BANNERS.map((banner) => banner.title);

  // Keep operational/SCM records intact for admin workflows, but archive them
  // from every public storefront query, which already filters these flags.
  const [products, categories, brands, banners] = await prisma.$transaction([
    prisma.product.updateMany({
      where: { id: { notIn: techProductIds }, deleted: false },
      data: { deleted: true, available: false, featured: false },
    }),
    prisma.category.updateMany({
      where: { id: { notIn: techCategoryIds }, deleted: false },
      data: { deleted: true },
    }),
    prisma.brand.updateMany({
      where: { id: { notIn: techBrandIds }, deleted: false },
      data: { deleted: true },
    }),
    prisma.banner.updateMany({
      where: { title: { notIn: techBannerTitles }, isActive: true },
      data: { isActive: false },
    }),
  ]);

  return {
    archivedProducts: products.count,
    archivedCategories: categories.count,
    archivedBrands: brands.count,
    archivedBanners: banners.count,
  };
}

export async function seedStorefrontCategories(
  prisma: PrismaClient,
): Promise<Record<string, number>> {
  const categoryIds: Record<string, number> = {};

  for (const category of STOREFRONT_CATEGORIES) {
    const parentId = category.parentKey
      ? categoryIds[category.parentKey]
      : null;
    if (category.parentKey && !parentId) {
      throw new Error(
        `Storefront category parent not seeded: ${category.parentKey}`,
      );
    }
    const record = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        image: category.image,
        parentId,
        deleted: false,
      },
      create: {
        name: category.name,
        slug: category.slug,
        image: category.image,
        parentId,
        deleted: false,
      },
      select: { id: true },
    });
    categoryIds[category.key] = record.id;
  }

  return categoryIds;
}

export async function seedStorefrontDemo(
  prisma: PrismaClient,
  adminUserId?: string | null,
): Promise<StorefrontSeedSummary> {
  console.log("🛍️  Seeding technology storefront demo...");

  const [admin, customers, warehouse] = await Promise.all([
    ensureAdmin(prisma, adminUserId),
    ensureCustomers(prisma),
    ensureWarehouse(prisma),
  ]);

  const categoryIds = await seedStorefrontCategories(prisma);

  const brandIds: Record<string, number> = {};
  for (const brand of STOREFRONT_BRANDS) {
    const existing = await prisma.brand.findFirst({
      where: { OR: [{ slug: brand.slug }, { name: brand.name }] },
      select: { id: true },
    });
    const record = existing
      ? await prisma.brand.update({
          where: { id: existing.id },
          data: { name: brand.name, slug: brand.slug, deleted: false },
          select: { id: true },
        })
      : await prisma.brand.create({
          data: { name: brand.name, slug: brand.slug, deleted: false },
          select: { id: true },
        });
    brandIds[brand.key] = record.id;
  }

  const attributeIds: Record<string, number> = {};
  const productIds: Record<string, number> = {};
  const variantIds: Record<string, number> = {};

  for (const [productPosition, item] of STOREFRONT_PRODUCTS.entries()) {
    const isDemoFlashSale = productPosition < 8;
    const demoFlashPrice = isDemoFlashSale
      ? Math.max(1, Math.round(item.basePrice * (0.84 + productPosition * 0.01)))
      : null;
    const demoFlashStartsAt = isDemoFlashSale
      ? new Date(Date.now() - 60 * 60 * 1000)
      : null;
    const demoFlashEndsAt = isDemoFlashSale
      ? new Date(Date.now() + (productPosition + 1) * 24 * 60 * 60 * 1000)
      : null;
    const product = await prisma.product.upsert({
      where: { slug: item.slug },
      update: {
        name: item.name,
        sku: item.sku,
        type: "PHYSICAL",
        categoryId: categoryIds[item.categoryKey],
        brandId: brandIds[item.brandKey],
        description: item.description,
        shortDesc: item.shortDesc,
        basePrice: item.basePrice,
        originalPrice: item.originalPrice ?? null,
        flashSaleEnabled: isDemoFlashSale,
        flashSalePrice: demoFlashPrice,
        flashSaleStartsAt: demoFlashStartsAt,
        flashSaleEndsAt: demoFlashEndsAt,
        flashSaleSortOrder: productPosition,
        currency: "BDT",
        weight: item.weight ?? null,
        dimensions: item.dimensions,
        available: true,
        featured: item.featured ?? false,
        image: item.image,
        gallery: item.gallery ?? [],
        soldCount: item.soldCount,
        deleted: false,
        lowStockThreshold: 5,
      },
      create: {
        name: item.name,
        slug: item.slug,
        sku: item.sku,
        type: "PHYSICAL",
        categoryId: categoryIds[item.categoryKey],
        brandId: brandIds[item.brandKey],
        description: item.description,
        shortDesc: item.shortDesc,
        basePrice: item.basePrice,
        originalPrice: item.originalPrice ?? null,
        flashSaleEnabled: isDemoFlashSale,
        flashSalePrice: demoFlashPrice,
        flashSaleStartsAt: demoFlashStartsAt,
        flashSaleEndsAt: demoFlashEndsAt,
        flashSaleSortOrder: productPosition,
        currency: "BDT",
        weight: item.weight ?? null,
        dimensions: item.dimensions,
        available: true,
        featured: item.featured ?? false,
        image: item.image,
        gallery: item.gallery ?? [],
        soldCount: item.soldCount,
        deleted: false,
        lowStockThreshold: 5,
        createdAt: new Date(Date.UTC(2026, 6, 1 + productPosition)),
      },
      select: { id: true },
    });
    productIds[item.key] = product.id;

    await prisma.productAttribute.deleteMany({
      where: { productId: product.id },
    });
    for (const [name, value] of Object.entries(item.specs)) {
      if (!attributeIds[name]) {
        const existing = await prisma.attribute.findFirst({
          where: { name },
          select: { id: true },
        });
        const attribute =
          existing ??
          (await prisma.attribute.create({
            data: { name },
            select: { id: true },
          }));
        attributeIds[name] = attribute.id;
      }
      await prisma.productAttribute.create({
        data: {
          productId: product.id,
          attributeId: attributeIds[name],
          value,
        },
      });
    }

    const optionValues = new Map<string, Set<string>>();
    for (const variantSeed of item.variants) {
      for (const [name, value] of Object.entries(variantSeed.options)) {
        if (!optionValues.has(name)) optionValues.set(name, new Set());
        optionValues.get(name)?.add(value);
      }
    }
    const seededOptionNames = [...optionValues.keys()];
    if (seededOptionNames.length) {
      await prisma.productVariantOption.deleteMany({
        where: {
          productId: product.id,
          name: { notIn: seededOptionNames },
        },
      });
    } else {
      await prisma.productVariantOption.deleteMany({
        where: { productId: product.id },
      });
    }
    let optionPosition = 0;
    for (const [name, values] of optionValues) {
      const option = await prisma.productVariantOption.upsert({
        where: { productId_name: { productId: product.id, name } },
        update: { position: optionPosition },
        create: { productId: product.id, name, position: optionPosition },
        select: { id: true },
      });
      await prisma.productVariantOptionValue.deleteMany({
        where: { optionId: option.id, value: { notIn: [...values] } },
      });
      let valuePosition = 0;
      for (const value of values) {
        await prisma.productVariantOptionValue.upsert({
          where: { optionId_value: { optionId: option.id, value } },
          update: { position: valuePosition },
          create: { optionId: option.id, value, position: valuePosition },
        });
        valuePosition += 1;
      }
      optionPosition += 1;
    }

    for (const variantSeed of item.variants) {
      const existingVariant = await prisma.productVariant.findFirst({
        where: { productId: product.id, sku: variantSeed.sku },
        select: { id: true },
      });
      const data = {
        sku: variantSeed.sku,
        price: variantSeed.price,
        costPrice: variantSeed.costPrice,
        currency: "BDT",
        stock: variantSeed.stock,
        options: variantSeed.options,
        colorImage: variantSeed.colorImage ?? null,
        isDefault: variantSeed.isDefault ?? false,
        active: true,
        lowStockThreshold: 5,
      };
      const variant = existingVariant
        ? await prisma.productVariant.update({
            where: { id: existingVariant.id },
            data,
            select: { id: true },
          })
        : await prisma.productVariant.create({
            data: { productId: product.id, ...data },
            select: { id: true },
          });
      variantIds[variantSeed.sku] = variant.id;

      await prisma.stockLevel.upsert({
        where: {
          warehouseId_productVariantId: {
            warehouseId: warehouse.id,
            productVariantId: variant.id,
          },
        },
        update: { quantity: variantSeed.stock, reserved: 0 },
        create: {
          warehouseId: warehouse.id,
          productVariantId: variant.id,
          quantity: variantSeed.stock,
          reserved: 0,
        },
      });
    }
  }

  const bundleSlug = "ryzen-5-complete-gaming-setup-bundle";
  const bundle = await prisma.product.upsert({
    where: { slug: bundleSlug },
    update: {
      name: "Ryzen 5 Complete Gaming Setup Bundle",
      sku: "DEMO-BUNDLE-GAME-001",
      type: "BUNDLE",
      categoryId: categoryIds.desktop_gaming,
      brandId: brandIds.amd,
      description:
        "A client-demo bundle containing the Ryzen 5 7500F gaming desktop, a 27-inch QHD monitor and an RGB mechanical keyboard. Individual products remain visible and purchasable separately.",
      shortDesc: "Gaming desktop, QHD monitor and RGB keyboard in one value bundle.",
      basePrice: 112500,
      originalPrice: 117290,
      currency: "BDT",
      available: true,
      featured: true,
      image: "/upload/products/1772530789360-amd-gaming-pc-amd-ryzen-5-7500f-gaming-desktop-pc-cover.webp",
      gallery: [
        "/upload/products/1773201015138-geesuu-monitor-blazewheel-mg270l2q-cover.webp",
        "/upload/products/1772531232004-pc-power-keyboard-k87-rgb-cover.webp",
      ],
      soldCount: 14,
      bundleStockLimit: 5,
      deleted: false,
    },
    create: {
      name: "Ryzen 5 Complete Gaming Setup Bundle",
      slug: bundleSlug,
      sku: "DEMO-BUNDLE-GAME-001",
      type: "BUNDLE",
      categoryId: categoryIds.desktop_gaming,
      brandId: brandIds.amd,
      description:
        "A client-demo bundle containing the Ryzen 5 7500F gaming desktop, a 27-inch QHD monitor and an RGB mechanical keyboard. Individual products remain visible and purchasable separately.",
      shortDesc: "Gaming desktop, QHD monitor and RGB keyboard in one value bundle.",
      basePrice: 112500,
      originalPrice: 117290,
      currency: "BDT",
      available: true,
      featured: true,
      image: "/upload/products/1772530789360-amd-gaming-pc-amd-ryzen-5-7500f-gaming-desktop-pc-cover.webp",
      gallery: [
        "/upload/products/1773201015138-geesuu-monitor-blazewheel-mg270l2q-cover.webp",
        "/upload/products/1772531232004-pc-power-keyboard-k87-rgb-cover.webp",
      ],
      soldCount: 14,
      bundleStockLimit: 5,
      deleted: false,
      createdAt: new Date("2026-07-25T00:00:00.000Z"),
    },
    select: { id: true },
  });
  productIds.bundle = bundle.id;

  const bundleChildren = [
    { productId: productIds.pc7500f, quantity: 1, sortOrder: 1 },
    { productId: productIds.monitor, quantity: 1, sortOrder: 2 },
    { productId: productIds.keyboard, quantity: 1, sortOrder: 3 },
  ];
  for (const child of bundleChildren) {
    await prisma.productBundleItem.upsert({
      where: {
        bundleId_productId: {
          bundleId: bundle.id,
          productId: child.productId,
        },
      },
      update: { quantity: child.quantity, sortOrder: child.sortOrder },
      create: { bundleId: bundle.id, ...child },
    });
  }

  let reviewCount = 0;
  let questionCount = 0;
  for (const [productIndex, item] of STOREFRONT_PRODUCTS.entries()) {
    const productId = productIds[item.key];
    for (const [customerIndex, customer] of customers.entries()) {
      const rating = customerIndex === 0 ? 5 : productIndex % 3 === 0 ? 4 : 5;
      const existing = await prisma.review.findFirst({
        where: { productId, userId: customer.id },
        select: { id: true },
      });
      const data = {
        rating,
        comment: STOREFRONT_REVIEW_COMMENTS[customerIndex],
        feature: productIndex < 8,
        createdAt: new Date(Date.UTC(2026, 6, 5 + productIndex, customerIndex)),
      };
      if (existing) {
        await prisma.review.update({ where: { id: existing.id }, data });
      } else {
        await prisma.review.create({
          data: { productId, userId: customer.id, ...data },
        });
      }
      reviewCount += 1;
    }

    const aggregate = await prisma.review.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await prisma.product.update({
      where: { id: productId },
      data: {
        ratingAvg: aggregate._avg.rating ?? 0,
        ratingCount: aggregate._count.rating,
      },
    });

    if (productIndex < 8) {
      const questionSeed = STOREFRONT_QUESTIONS[productIndex % STOREFRONT_QUESTIONS.length];
      const customer = customers[productIndex % customers.length];
      const existing = await prisma.productQuestion.findFirst({
        where: { productId, userId: customer.id, question: questionSeed.question },
        select: { id: true },
      });
      const data = {
        answer: questionSeed.answer,
        answeredById: admin.id,
        answeredAt: new Date(Date.UTC(2026, 6, 12 + productIndex)),
      };
      if (existing) {
        await prisma.productQuestion.update({ where: { id: existing.id }, data });
      } else {
        await prisma.productQuestion.create({
          data: {
            productId,
            userId: customer.id,
            question: questionSeed.question,
            createdAt: new Date(Date.UTC(2026, 6, 11 + productIndex)),
            ...data,
          },
        });
      }
      questionCount += 1;
    }
  }

  await Promise.all([
    ensureShippingRates(prisma, warehouse.id),
    ensureSitePresentation(prisma),
  ]);

  const archived = await enforceTechOnlyStorefront(
    prisma,
    Object.values(productIds),
    Object.values(categoryIds),
    Object.values(brandIds),
  );

  const summary: StorefrontSeedSummary = {
    categories: STOREFRONT_CATEGORIES.length,
    brands: STOREFRONT_BRANDS.length,
    products: STOREFRONT_PRODUCTS.length + 1,
    variants: Object.keys(variantIds).length,
    reviews: reviewCount,
    questions: questionCount,
    banners: STOREFRONT_BANNERS.length,
    ...archived,
  };
  console.log("✅ Technology storefront demo ready:", summary);
  console.log("🔐 Demo customer: customer.one@storefront.demo / Demo123!");
  console.log("🎟️  Demo coupon: DEMO10");
  return summary;
}
