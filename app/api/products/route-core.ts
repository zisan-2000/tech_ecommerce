import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { syncVariantWarehouseStock } from "@/lib/inventory";
import {
  getVariantMediaMeta,
  normalizeVariantOptions,
  sortOptionObject,
} from "@/lib/product-variants";
import { normalizeLowStockThreshold } from "@/lib/stock-status";
import { ensureVariantCodes } from "@/lib/product-codes";
import { getAccessContext } from "@/lib/rbac";
import { Prisma } from "@/generated/prisma";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import slugify from "slugify";
import {
  isStorefrontRequest,
  privateJson,
  publicJson,
} from "@/lib/public-cache";
import { storefrontProductSelect } from "@/lib/storefront-product";
import { revalidateStorefrontCatalog } from "@/lib/storefront-catalog-cache";
import { applyFlashSalePricingToProduct } from "@/lib/flash-sale";
import { parseProductAttributeInput } from "@/lib/product-attribute-input";

const createVariantSku = (slug: string, index: number) =>
  `${slug.substring(0, 20)}-V${index + 1}-${Math.random()
    .toString(36)
    .slice(2, 5)}`.toUpperCase();

function normalizeCartReminderMinutes(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 525600) {
    return undefined;
  }
  return minutes;
}

async function getVariantColorImageMap(variantIds: number[]) {
  const uniqueIds = Array.from(new Set(variantIds.filter(Number.isFinite)));
  if (uniqueIds.length === 0) return new Map<number, string | null>();

  const rows = await prisma.$queryRaw<Array<{ id: number; colorImage: string | null }>>(
    Prisma.sql`SELECT "id", "colorImage" FROM "ProductVariant" WHERE "id" IN (${Prisma.join(uniqueIds)})`,
  );

  return new Map(
    rows.map((row) => [Number(row.id), row.colorImage ?? null]),
  );
}

function attachVariantColorImages<T extends { variants?: any[] | null }>(
  product: T,
  colorImageMap: Map<number, string | null>,
) {
  if (!Array.isArray(product.variants)) return product;

  return {
    ...product,
    variants: product.variants.map((variant) => {
      const mediaMeta = getVariantMediaMeta(variant.options);
      return {
        ...variant,
        colorImage:
          colorImageMap.get(Number(variant.id)) ?? mediaMeta?.image ?? null,
        gallery: mediaMeta?.gallery ?? [],
      };
    }),
  };
}

const productInclude = {
  category: true,
  brand: true,
  VatClass: true,
  variantOptions: {
    orderBy: { position: "asc" },
    include: {
      values: {
        orderBy: { position: "asc" },
      },
    },
  },
  variants: {
    orderBy: { id: "asc" },
    include: {
      codes: {
        where: { isPrimary: true, status: "ACTIVE" },
        orderBy: { id: "asc" },
      },
      stockLevels: {
        include: {
          warehouse: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
    },
  },
  attributes: {
    include: {
      attribute: true,
    },
  },
} as const;

function toProductLogSnapshot(product: any) {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku ?? null,
    type: product.type,
    category: product.category?.name ?? null,
    brand: product.brand?.name ?? null,
    VatClassId: product.VatClassId ?? null,
    basePrice: Number(product.basePrice),
    originalPrice: product.originalPrice === null ? null : Number(product.originalPrice),
    currency: product.currency,
    available: product.available,
    featured: product.featured,
    lowStockThreshold: product.lowStockThreshold,
    variantOptions: Array.isArray(product.variantOptions)
      ? product.variantOptions.map((option: any) => ({
          name: option.name,
          values: Array.isArray(option.values)
            ? option.values.map((value: any) => value.value)
            : [],
        }))
      : [],
    variants: Array.isArray(product.variants)
      ? product.variants.map((variant: any) => ({
          id: variant.id,
          sku: variant.sku,
          price: Number(variant.price),
          stock: Number(variant.stock),
          lowStockThreshold: variant.lowStockThreshold,
          active: variant.active,
          isDefault: variant.isDefault,
          colorImage: variant.colorImage ?? null,
          gallery: getVariantMediaMeta(variant.options)?.gallery ?? [],
          options: variant.options ?? {},
        }))
      : [],
  };
}

/* =========================
   GET PRODUCTS
========================= */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const storefront = isStorefrontRequest(req);
    const brandId = searchParams.get('brandId');
    const brandSlug = searchParams.get('brandSlug');

    let whereClause: any = {
      deleted: false,
      ...(storefront ? { available: true } : {}),
    };

    // Filter by brand if brandId or brandSlug is provided
    if (brandId) {
      whereClause.brandId = Number(brandId);
    } else if (brandSlug) {
      // First find the brand by slug
      const brand = await prisma.brand.findUnique({
        where: { slug: brandSlug },
        select: { id: true }
      });
      if (brand) {
        whereClause.brandId = brand.id;
      } else {
        // If brand not found, return empty array
        return NextResponse.json([]);
      }
    }

    // Header search only needs a tiny catalog projection. Returning the full
    // product graph (variants, bundles and relations) on every storefront page
    // wastes bandwidth and client parsing time.
    if (storefront && searchParams.get("fields") === "summary") {
      const summaries = await prisma.product.findMany({
        where: whereClause,
        orderBy: { id: "desc" },
        select: {
          id: true,
          name: true,
          image: true,
        },
      });

      return publicJson(summaries, {
        maxAge: 0,
        staleWhileRevalidate: 0,
      });
    }

    const products: any[] = storefront
      ? await prisma.product.findMany({
          where: whereClause,
          orderBy: { id: "desc" },
          select: {
            ...storefrontProductSelect,
            _count: { select: { reviews: true } },
          },
        })
      : await prisma.product.findMany({
          where: whereClause,
          orderBy: { id: "desc" },
          include: {
            ...productInclude,
            _count: { select: { reviews: true } },
          },
        });
    const colorImageMap = await getVariantColorImageMap(
      products.flatMap((product) =>
        Array.isArray(product.variants)
          ? product.variants.map((variant: any) => Number(variant.id))
          : [],
      ),
    );

    const ratingAggregates = await prisma.review.groupBy({
      by: ["productId"],
      where: { productId: { in: products.map((product) => product.id) } },
      _avg: { rating: true },
    });
    const ratingByProduct = new Map(
      ratingAggregates.map((row) => [row.productId, row._avg.rating ?? 0]),
    );
    const productsWithRatings = products.map((product) => ({
      ...attachVariantColorImages(product, colorImageMap),
      ratingAvg: ratingByProduct.get(product.id) ?? 0,
      ratingCount: product._count.reviews,
    }));

    return storefront
      ? publicJson(
          productsWithRatings.map((product) =>
            applyFlashSalePricingToProduct(product),
          ),
          { maxAge: 0, staleWhileRevalidate: 0 },
        )
      : privateJson(productsWithRatings);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load products" },
      { status: 500 }
    );
  }
}

/* =========================
   CREATE PRODUCT
========================= */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.has("products.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();

    if (!body.name || !body.categoryId || !body.basePrice) {
      return NextResponse.json(
        { error: "Name, category and base price required" },
        { status: 400 }
      );
    }

    const slug = slugify(body.name, { lower: true, strict: true });
    
    // Ensure slug doesn't exceed database limits (typically 255 chars)
    const truncatedSlug = slug.substring(0, 250);
    
    const existing = await prisma.product.findUnique({
      where: { slug: truncatedSlug },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Slug already exists" },
        { status: 400 }
      );
    }

    const initialStock =
      body.stock !== undefined && body.stock !== null ? Number(body.stock) : 0;
    if (!Number.isFinite(initialStock) || initialStock < 0) {
      return NextResponse.json(
        { error: "Stock must be a number (0 or more)" },
        { status: 400 }
      );
    }

    const currency = String(body.currency || "USD")
      .trim()
      .toUpperCase()
      .slice(0, 3);
    if (currency.length !== 3) {
      return NextResponse.json(
        { error: "Currency must be a 3-letter code (e.g., USD, BDT)" },
        { status: 400 },
      );
    }
    const basePrice = Number(body.basePrice);
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      return NextResponse.json(
        { error: "Base price must be a number (0 or more)" },
        { status: 400 }
      );
    }
    const baseCostPrice =
      body.baseCostPrice !== undefined && body.baseCostPrice !== null && body.baseCostPrice !== ""
        ? Number(body.baseCostPrice)
        : null;
    if (baseCostPrice !== null && (!Number.isFinite(baseCostPrice) || baseCostPrice < 0)) {
      return NextResponse.json(
        { error: "Base cost price must be a number (0 or more)" },
        { status: 400 }
      );
    }

    const type = body.type || "PHYSICAL";
    const lowStockThreshold = normalizeLowStockThreshold(body.lowStockThreshold);
    const variantOptions = normalizeVariantOptions(body.variantOptions);
    const parsedProductAttributes = parseProductAttributeInput(
      body.productAttributes ?? [],
    );
    if (!parsedProductAttributes.ok) {
      return NextResponse.json(
        { error: parsedProductAttributes.error },
        { status: 400 },
      );
    }
    const productAttributes = parsedProductAttributes.value;
    if (productAttributes.length > 0) {
      const attributeCount = await prisma.attribute.count({
        where: {
          id: { in: productAttributes.map((item) => item.attributeId) },
        },
      });
      if (attributeCount !== productAttributes.length) {
        return NextResponse.json(
          { error: "One or more product attributes do not exist" },
          { status: 400 },
        );
      }
    }

    const variantsInput = Array.isArray(body.variants) ? body.variants : [];
    const orderedOptionNames = variantOptions.map((option) => option.name);
    const parsedVariants = variantsInput
      .map((item: any, index: number) => {
        const price =
          item?.price !== undefined && item?.price !== null
            ? Number(item.price)
            : basePrice;
        const costPrice =
          item?.costPrice !== undefined && item?.costPrice !== null && item?.costPrice !== ""
            ? Number(item.costPrice)
            : baseCostPrice;
        const stock =
          type === "PHYSICAL"
            ? item?.stock !== undefined && item?.stock !== null
              ? Number(item.stock)
              : 0
            : 0;
        const skuRaw =
          typeof item?.sku === "string" && item.sku.trim()
            ? item.sku.trim()
            : createVariantSku(truncatedSlug, index);
        const sku = skuRaw.slice(0, 64);
        const variantCurrency =
          typeof item?.currency === "string" && item.currency.trim()
            ? item.currency.trim().toUpperCase().slice(0, 3)
            : currency;
        const variantLowStockThreshold = normalizeLowStockThreshold(
          item?.lowStockThreshold,
          lowStockThreshold,
        );
        if (variantCurrency.length !== 3) {
          return null;
        }
        return {
          sku,
          price,
          costPrice,
          stock,
          currency: variantCurrency,
          lowStockThreshold: variantLowStockThreshold,
          isDefault: false,
          active: item?.active !== undefined ? Boolean(item.active) : true,
          colorImage:
            typeof item?.colorImage === "string" && item.colorImage.trim()
              ? item.colorImage.trim()
              : null,
          options:
            item?.options && typeof item.options === "object"
              ? sortOptionObject(item.options, orderedOptionNames)
              : {},
          digitalAssetId: item?.digitalAssetId ? Number(item.digitalAssetId) : null,
        };
      })
      .filter((item: { sku: string } | null) => !!item && !!item.sku);

    const invalidVariant = parsedVariants.find(
      (item: { price: number; costPrice: number | null; stock: number }) =>
        !Number.isFinite(item.price) ||
        item.price < 0 ||
        (item.costPrice !== null &&
          (!Number.isFinite(item.costPrice) || item.costPrice < 0)) ||
        !Number.isFinite(item.stock) ||
        item.stock < 0
    );
    if (invalidVariant) {
      return NextResponse.json(
        { error: "Variant price/stock must be valid numbers" },
        { status: 400 }
      );
    }
    const cartReminderMinutes = normalizeCartReminderMinutes(
      body.cartReminderMinutes,
    );
    if (cartReminderMinutes === undefined) {
      return NextResponse.json(
        { error: "Cart reminder must be between 1 minute and 1 year" },
        { status: 400 },
      );
    }

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: body.name,
          slug: truncatedSlug,
          type,
          sku:
            typeof body.sku === "string" && body.sku.trim()
              ? body.sku.trim().slice(0, 64)
              : null,

          categoryId: Number(body.categoryId),
          brandId: body.brandId ? Number(body.brandId) : null,


          description: body.description || "",
          shortDesc: body.shortDesc || null,

          basePrice,
          originalPrice: body.originalPrice
            ? Number(body.originalPrice)
            : null,
          currency,

          weight: body.weight ? Number(body.weight) : null,
          dimensions: body.dimensions || null,
          VatClassId: body.VatClassId ? Number(body.VatClassId) : null,
          lowStockThreshold,

          digitalAssetId: body.digitalAssetId
            ? Number(body.digitalAssetId)
            : null,
          serviceDurationMinutes: body.serviceDurationMinutes
            ? Number(body.serviceDurationMinutes)
            : null,
          serviceLocation: body.serviceLocation || null,
          serviceOnlineLink: body.serviceOnlineLink || null,

          available: body.available ?? true,
          featured: body.featured ?? false,
          cartReminderMinutes,

          image: body.image || null,
          gallery: body.gallery || [],
          videoUrl: body.videoUrl || null,
        },
      });

      if (productAttributes.length > 0) {
        await tx.productAttribute.createMany({
          data: productAttributes.map(
            (item: { attributeId: number; value: string }) => ({
              productId: created.id,
              attributeId: item.attributeId,
              value: item.value,
            })
          ),
        });
      }

      if (variantOptions.length > 0) {
        for (let optionIndex = 0; optionIndex < variantOptions.length; optionIndex += 1) {
          const option = variantOptions[optionIndex];
          await tx.productVariantOption.create({
            data: {
              productId: created.id,
              name: option.name,
              position: optionIndex,
              values: {
                create: option.values.map((value, valueIndex) => ({
                  value,
                  position: valueIndex,
                })),
              },
            },
          });
        }
      }

      if (parsedVariants.length > 0) {
        for (const variant of parsedVariants) {
          const createdVariant = await tx.productVariant.create({
            data: {
              productId: created.id,
              sku: variant.sku,
              price: variant.price,
              costPrice: variant.costPrice,
              currency: variant.currency,
              stock: 0,
              lowStockThreshold: variant.lowStockThreshold,
              isDefault: false,
              active: variant.active,
              digitalAssetId: variant.digitalAssetId,
              options: variant.options,
            },
          });

          if (variant.colorImage !== null) {
            await tx.$executeRaw`
              UPDATE "ProductVariant"
              SET "colorImage" = ${variant.colorImage}
              WHERE "id" = ${createdVariant.id}
            `;
          }

          await syncVariantWarehouseStock({
            tx,
            productId: created.id,
            productVariantId: createdVariant.id,
            quantity: variant.stock,
            reason: "Admin variant initial stock",
          });

          await ensureVariantCodes(tx, {
            productId: created.id,
            variantId: createdVariant.id,
          });
        }
      } else {
        const fallbackVariant = await tx.productVariant.create({
          data: {
            productId: created.id,
            sku:
              typeof body.sku === "string" && body.sku.trim()
                ? body.sku.trim().slice(0, 64)
                : createVariantSku(truncatedSlug, 0).slice(0, 64),
            price: basePrice,
            costPrice: baseCostPrice,
            currency,
            stock: 0,
            lowStockThreshold,
            isDefault: true,
            active: true,
            options: {},
          },
        });

        await ensureVariantCodes(tx, {
          productId: created.id,
          variantId: fallbackVariant.id,
        });

        if (type === "PHYSICAL") {
          await syncVariantWarehouseStock({
            tx,
            productId: created.id,
            productVariantId: fallbackVariant.id,
            quantity: initialStock,
            reason: "Admin variant initial stock",
          });
        }
      }

      return tx.product.findUnique({
        where: { id: created.id },
        include: productInclude,
      });
    });

    if (!product) {
      return NextResponse.json(
        { error: "Failed to create product" },
        { status: 500 }
      );
    }

    const colorImageMap = await getVariantColorImageMap(
      Array.isArray(product.variants)
        ? product.variants.map((variant: any) => Number(variant.id))
        : [],
    );
    const productWithColorImages = attachVariantColorImages(
      product,
      colorImageMap,
    );

    await logActivity({
      action: "create_product",
      entity: "product",
      entityId: product.id,
      access,
      request: req,
      metadata: {
        message: `Product created: ${product.name}`,
      },
      after: toProductLogSnapshot(productWithColorImages),
    });

    revalidateStorefrontCatalog();

    return NextResponse.json(productWithColorImages, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to create product" },
      { status: 500 }
    );
  }
}
