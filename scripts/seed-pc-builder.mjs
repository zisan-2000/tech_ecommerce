import nextEnv from "@next/env";
import { PrismaClient } from "../generated/prisma/index.js";
import {
  STOREFRONT_BRANDS,
  STOREFRONT_CATEGORIES,
  STOREFRONT_PRODUCTS,
} from "../prisma/seed-data/storefront/constants.ts";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const prisma = new PrismaClient();
const CATEGORY_KEYS = new Set([
  "processor",
  "motherboard",
  "ram",
  "graphics",
  "storage",
  "power",
  "case",
  "cooler",
]);
const products = STOREFRONT_PRODUCTS.filter((item) =>
  CATEGORY_KEYS.has(item.categoryKey),
);

async function ensureWarehouse() {
  const current = await prisma.warehouse.findFirst({
    where: { isDefault: true },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (current) return current;
  return prisma.warehouse.upsert({
    where: { code: "STOREFRONT-DHK" },
    update: { isDefault: true },
    create: {
      code: "STOREFRONT-DHK",
      name: "Storefront Dhaka Warehouse",
      isDefault: true,
      country: "BD",
      division: "Dhaka",
      district: "Dhaka",
      area: "Tejgaon",
      address: {
        line1: "Technology Distribution Center",
        area: "Tejgaon",
        city: "Dhaka",
        country: "Bangladesh",
      },
    },
    select: { id: true },
  });
}

async function seed() {
  const requiredCategories = STOREFRONT_CATEGORIES.filter(
    (category) =>
      category.key === "components" || CATEGORY_KEYS.has(category.key),
  );
  const categoryIds = {};
  for (const category of requiredCategories) {
    const parentId = category.parentKey
      ? categoryIds[category.parentKey] ?? null
      : null;
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

  const brandKeys = new Set(products.map((item) => item.brandKey));
  const brandIds = {};
  for (const brand of STOREFRONT_BRANDS.filter((item) => brandKeys.has(item.key))) {
    const record = await prisma.brand.upsert({
      where: { slug: brand.slug },
      update: { name: brand.name, deleted: false },
      create: { name: brand.name, slug: brand.slug, deleted: false },
      select: { id: true },
    });
    brandIds[brand.key] = record.id;
  }

  const warehouse = await ensureWarehouse();
  for (const item of products) {
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.upsert({
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
        select: { id: true },
      });

      await tx.productAttribute.deleteMany({ where: { productId: product.id } });
      for (const [name, value] of Object.entries(item.specs)) {
        const existing = await tx.attribute.findFirst({
          where: { name },
          select: { id: true },
        });
        const attribute =
          existing ??
          (await tx.attribute.create({
            data: { name },
            select: { id: true },
          }));
        await tx.productAttribute.create({
          data: {
            productId: product.id,
            attributeId: attribute.id,
            value,
          },
        });
      }

      const optionValues = new Map();
      for (const variant of item.variants) {
        for (const [name, value] of Object.entries(variant.options)) {
          if (!optionValues.has(name)) optionValues.set(name, new Set());
          optionValues.get(name).add(value);
        }
      }
      const optionNames = [...optionValues.keys()];
      await tx.productVariantOption.deleteMany({
        where: {
          productId: product.id,
          ...(optionNames.length ? { name: { notIn: optionNames } } : {}),
        },
      });
      let optionPosition = 0;
      for (const [name, values] of optionValues) {
        const option = await tx.productVariantOption.upsert({
          where: { productId_name: { productId: product.id, name } },
          update: { position: optionPosition },
          create: { productId: product.id, name, position: optionPosition },
          select: { id: true },
        });
        await tx.productVariantOptionValue.deleteMany({
          where: { optionId: option.id, value: { notIn: [...values] } },
        });
        let valuePosition = 0;
        for (const value of values) {
          await tx.productVariantOptionValue.upsert({
            where: { optionId_value: { optionId: option.id, value } },
            update: { position: valuePosition },
            create: { optionId: option.id, value, position: valuePosition },
          });
          valuePosition += 1;
        }
        optionPosition += 1;
      }

      const seededSkus = item.variants.map((variant) => variant.sku);
      await tx.productVariant.updateMany({
        where: { productId: product.id, sku: { notIn: seededSkus } },
        data: { active: false },
      });
      for (const variantSeed of item.variants) {
        const existingVariant = await tx.productVariant.findFirst({
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
          ? await tx.productVariant.update({
              where: { id: existingVariant.id },
              data,
              select: { id: true },
            })
          : await tx.productVariant.create({
              data: { productId: product.id, ...data },
              select: { id: true },
            });
        await tx.stockLevel.upsert({
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
    });
  }

  console.log(
    `PC Builder demo ready: ${products.length} products across ${CATEGORY_KEYS.size} categories.`,
  );
}

seed()
  .catch((error) => {
    console.error("PC Builder seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
