import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { syncVariantWarehouseStock } from "@/lib/inventory";
import {
  getVariantMediaMeta,
  normalizeVariantOptions,
  sortOptionObject,
} from "@/lib/product-variants";
import { ensureVariantCodes } from "@/lib/product-codes";
import { normalizeLowStockThreshold } from "@/lib/stock-status";
import { getAccessContext } from "@/lib/rbac";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { Prisma, type ProductType } from "@/generated/prisma";
import slugify from "slugify";
import { isStorefrontRequest, privateJson, publicJson } from "@/lib/public-cache";
import { storefrontProductSelect } from "@/lib/storefront-product";
import { revalidateStorefrontCatalog } from "@/lib/storefront-catalog-cache";
import { applyFlashSalePricingToProduct } from "@/lib/flash-sale";
import {
  isExpectedProductVersion,
  parseProductAvailabilityPatch,
} from "@/lib/product-availability";
import { parseProductAttributeInput } from "@/lib/product-attribute-input";

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
    deleted: product.deleted ?? false,
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

type VariantPayload = {
  id: number | null;
  sku: string;
  price: number;
  costPrice: number | null;
  stock: number;
  lowStockThreshold: number;
  currency: string;
  digitalAssetId: number | null;
  colorImage: string | null;
  options: Record<string, unknown>;
  active: boolean;
};

/* =========================
   GET SINGLE PRODUCT
========================= */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const storefront = isStorefrontRequest(req);
    const { id: idParam } = await ctx.params;
    const id = Number(idParam);

    if (isNaN(id)) {
      return NextResponse.json(
        { error: "Invalid product id" },
        { status: 400 }
      );
    }

    const where = {
      id,
      deleted: false,
      ...(storefront ? { available: true } : {}),
    };
    const product: any = storefront
      ? await prisma.product.findFirst({
          where,
          select: storefrontProductSelect,
        })
      : await prisma.product.findFirst({
          where,
          include: productInclude,
        });

    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    const colorImageMap = await getVariantColorImageMap(
      Array.isArray(product.variants)
        ? product.variants.map((variant: any) => Number(variant.id))
        : [],
    );

    const data = attachVariantColorImages(product, colorImageMap);
    return storefront
      ? publicJson(applyFlashSalePricingToProduct(data), {
          maxAge: 0,
          staleWhileRevalidate: 0,
        })
      : privateJson(data);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch product" },
      { status: 500 }
    );
  }
}

/* =========================
   UPDATE PRODUCT
========================= */
export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
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

    const { id: idParam } = await ctx.params;
    const id = Number(idParam);

    if (isNaN(id)) {
      return NextResponse.json(
        { error: "Invalid product id" },
        { status: 400 }
      );
    }

    const body = await req.json();

    if (body.available !== undefined) {
      return NextResponse.json(
        {
          error:
            "Use the dedicated product availability PATCH action to activate or deactivate a product",
        },
        { status: 400 },
      );
    }

    const existing = await prisma.product.findFirst({
      where: { id, deleted: false },
      include: productInclude,
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    let slug = existing.slug;

    if (body.name && body.name !== existing.name) {
      slug = slugify(body.name, { lower: true, strict: true });

      const duplicate = await prisma.product.findFirst({
        where: {
          slug,
          NOT: { id },
        },
      });

      if (duplicate) {
        return NextResponse.json(
          { error: "Slug already exists" },
          { status: 400 }
        );
      }
    }

    const effectiveType = (body.type ?? existing.type) as ProductType;
    const nextLowStockThreshold =
      body.lowStockThreshold !== undefined
        ? normalizeLowStockThreshold(body.lowStockThreshold)
        : existing.lowStockThreshold;
    if (body.stock !== undefined && effectiveType !== "PHYSICAL") {
      return NextResponse.json(
        { error: "Stock is only available for PHYSICAL products" },
        { status: 400 }
      );
    }

    const currency = String(body.currency ?? existing.currency ?? "USD")
      .trim()
      .toUpperCase()
      .slice(0, 3);
    const nextBasePrice =
      body.basePrice !== undefined ? Number(body.basePrice) : Number(existing.basePrice);
    if (!Number.isFinite(nextBasePrice) || nextBasePrice < 0) {
      return NextResponse.json(
        { error: "Base price must be a number (0 or more)" },
        { status: 400 },
      );
    }
    const nextBaseCostPrice =
      body.baseCostPrice !== undefined
        ? body.baseCostPrice !== null && body.baseCostPrice !== ""
          ? Number(body.baseCostPrice)
          : null
        : undefined;
    if (
      nextBaseCostPrice !== undefined &&
      nextBaseCostPrice !== null &&
      (!Number.isFinite(nextBaseCostPrice) || nextBaseCostPrice < 0)
    ) {
      return NextResponse.json(
        { error: "Base cost price must be a number (0 or more)" },
        { status: 400 },
      );
    }

    const nextSimpleStock =
      body.stock !== undefined && body.stock !== null ? Number(body.stock) : null;
    if (
      nextSimpleStock !== null &&
      (!Number.isFinite(nextSimpleStock) || nextSimpleStock < 0)
    ) {
      return NextResponse.json(
        { error: "Stock must be a number (0 or more)" },
        { status: 400 },
      );
    }

    const parsedNextAttributes =
      body.productAttributes === undefined
        ? null
        : parseProductAttributeInput(body.productAttributes);
    if (parsedNextAttributes && !parsedNextAttributes.ok) {
      return NextResponse.json(
        { error: parsedNextAttributes.error },
        { status: 400 },
      );
    }
    const nextAttributes = parsedNextAttributes?.value ?? null;
    if (nextAttributes && nextAttributes.length > 0) {
      const attributeCount = await prisma.attribute.count({
        where: { id: { in: nextAttributes.map((item) => item.attributeId) } },
      });
      if (attributeCount !== nextAttributes.length) {
        return NextResponse.json(
          { error: "One or more product attributes do not exist" },
          { status: 400 },
        );
      }
    }

    const hasVariantOptionsPayload = body.variantOptions !== undefined;
    const nextVariantOptions = hasVariantOptionsPayload
      ? normalizeVariantOptions(body.variantOptions)
      : null;
    const variantsInput = Array.isArray(body.variants) ? body.variants : null;
    const hasVariantsPayload = body.variants !== undefined;
    const orderedOptionNames = (nextVariantOptions ?? []).map((option) => option.name);
    const nextVariants: VariantPayload[] | null =
      variantsInput?.map((item: any, index: number) => {
        const price =
          item?.price !== undefined && item?.price !== null
            ? Number(item.price)
            : nextBasePrice;
        const costPrice =
          item?.costPrice !== undefined && item?.costPrice !== null && item?.costPrice !== ""
            ? Number(item.costPrice)
            : nextBaseCostPrice ?? null;
        const stock =
          effectiveType === "PHYSICAL"
            ? item?.stock !== undefined && item?.stock !== null
              ? Number(item.stock)
              : 0
            : 0;
        const skuRaw =
          typeof item?.sku === "string" && item.sku.trim()
            ? item.sku.trim().toUpperCase()
            : `${slug.substring(0, 20)}-V${index + 1}`.slice(0, 64);

        return {
          id: item?.id ? Number(item.id) : null,
          sku: skuRaw.slice(0, 64),
          price,
          costPrice,
          stock,
          lowStockThreshold: normalizeLowStockThreshold(
            item?.lowStockThreshold,
            nextLowStockThreshold,
          ),
          currency,
          active: item?.active !== undefined ? Boolean(item.active) : true,
          digitalAssetId: item?.digitalAssetId ? Number(item.digitalAssetId) : null,
          colorImage:
            typeof item?.colorImage === "string" && item.colorImage.trim()
              ? item.colorImage.trim()
              : null,
          options:
            item?.options && typeof item.options === "object"
              ? sortOptionObject(item.options, orderedOptionNames)
              : {},
        };
      }) ?? null;

    if (
      nextVariants?.some(
        (variant) =>
          !Number.isFinite(variant.price) ||
          variant.price < 0 ||
          (variant.costPrice !== null &&
            (!Number.isFinite(variant.costPrice) || variant.costPrice < 0)) ||
          !Number.isFinite(variant.stock) ||
          variant.stock < 0,
      )
    ) {
      return NextResponse.json(
        { error: "Variant price/stock must be valid numbers" },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          name: body.name ?? existing.name,
          slug,
          type: effectiveType,
          sku:
            body.sku !== undefined
              ? body.sku
                ? String(body.sku).trim().toUpperCase().slice(0, 64)
                : null
              : existing.sku,
          categoryId: body.categoryId ? Number(body.categoryId) : existing.categoryId,
          brandId:
            body.brandId !== undefined
              ? body.brandId
                ? Number(body.brandId)
                : null
              : existing.brandId,
          description: body.description ?? existing.description,
          shortDesc: body.shortDesc ?? existing.shortDesc,
          basePrice: nextBasePrice,
          originalPrice:
            body.originalPrice !== undefined
              ? body.originalPrice
                ? Number(body.originalPrice)
                : null
              : existing.originalPrice,
          currency,
          weight:
            body.weight !== undefined
              ? body.weight
                ? Number(body.weight)
                : null
              : existing.weight,
          lowStockThreshold: nextLowStockThreshold,
          dimensions: body.dimensions ?? existing.dimensions,
          VatClassId:
            body.VatClassId !== undefined
              ? body.VatClassId
                ? Number(body.VatClassId)
                : null
              : existing.VatClassId,
          digitalAssetId:
            body.digitalAssetId !== undefined
              ? body.digitalAssetId
                ? Number(body.digitalAssetId)
                : null
              : existing.digitalAssetId,
          serviceDurationMinutes:
            body.serviceDurationMinutes !== undefined
              ? body.serviceDurationMinutes
                ? Number(body.serviceDurationMinutes)
                : null
              : existing.serviceDurationMinutes,
          serviceLocation: body.serviceLocation ?? existing.serviceLocation,
          serviceOnlineLink: body.serviceOnlineLink ?? existing.serviceOnlineLink,
          available: existing.available,
          featured: body.featured !== undefined ? body.featured : existing.featured,
          image: body.image ?? existing.image,
          gallery: body.gallery ?? existing.gallery,
          videoUrl: body.videoUrl ?? existing.videoUrl,
        },
      });

      if (nextAttributes !== null) {
        await tx.productAttribute.deleteMany({ where: { productId: id } });
        if (nextAttributes.length > 0) {
          await tx.productAttribute.createMany({
            data: nextAttributes.map((item: (typeof nextAttributes)[number]) => ({
              productId: id,
              attributeId: item.attributeId,
              value: item.value,
            })),
          });
        }
      }

      if (nextVariantOptions !== null) {
        await tx.productVariantOptionValue.deleteMany({
          where: {
            option: {
              productId: id,
            },
          },
        });
        await tx.productVariantOption.deleteMany({
          where: { productId: id },
        });

        if (nextVariantOptions.length > 0) {
          for (let optionIndex = 0; optionIndex < nextVariantOptions.length; optionIndex += 1) {
            const option = nextVariantOptions[optionIndex];
            await tx.productVariantOption.create({
              data: {
                productId: id,
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
      }

      const existingVariants = await tx.productVariant.findMany({
        where: { productId: id },
        include: {
          stockLevels: {
            select: { id: true, quantity: true, reserved: true },
          },
          orderItems: {
            select: { id: true },
            take: 1,
          },
        },
        orderBy: { id: "asc" },
      });

      if (body.lowStockThreshold !== undefined && !hasVariantsPayload) {
        const simpleVariant = existingVariants.find(
          (variant) =>
            variant.isDefault &&
            Object.keys((variant.options as Record<string, unknown>) ?? {}).length === 0,
        );

        if (simpleVariant && existingVariants.length === 1) {
          await tx.productVariant.update({
            where: { id: simpleVariant.id },
            data: { lowStockThreshold: nextLowStockThreshold },
          });
        }
      }

      if (hasVariantsPayload && nextVariants && nextVariants.length > 0) {
        const incomingIds = new Set(
          nextVariants
            .map((variant) => variant.id)
            .filter((variantId): variantId is number => !!variantId),
        );

        for (const staleVariant of existingVariants.filter(
          (variant) => !incomingIds.has(variant.id),
        )) {
          const hasInventory = staleVariant.stockLevels.some(
            (level) => Number(level.quantity) > 0 || Number(level.reserved) > 0,
          );
          const hasOrders = staleVariant.orderItems.length > 0;

          if (hasInventory || hasOrders) {
            throw new Error(
              `Cannot remove variant ${staleVariant.sku} because it already has stock or order history`,
            );
          }

          await tx.productVariant.delete({ where: { id: staleVariant.id } });
        }

        for (let index = 0; index < nextVariants.length; index += 1) {
          const variant = nextVariants[index];
          const existingVariant =
            variant.id != null
              ? existingVariants.find(
                  (item: (typeof existingVariants)[number]) => item.id === variant.id,
                )
              : null;

          const savedVariant = existingVariant
            ? await tx.productVariant.update({
                where: { id: existingVariant.id },
                data: {
                  sku: variant.sku,
                  price: variant.price,
                  costPrice: variant.costPrice,
                  currency: variant.currency,
                  stock: 0,
                  lowStockThreshold: variant.lowStockThreshold,
                  isDefault: false,
                  active: variant.active,
                  digitalAssetId: variant.digitalAssetId,
                  options: variant.options as Prisma.InputJsonValue,
                },
              })
            : await tx.productVariant.create({
                data: {
                  productId: id,
                  sku: variant.sku,
                  price: variant.price,
                  costPrice: variant.costPrice,
                  currency: variant.currency,
                  stock: 0,
                  lowStockThreshold: variant.lowStockThreshold,
                  isDefault: false,
                  active: variant.active,
                  digitalAssetId: variant.digitalAssetId,
                  options: variant.options as Prisma.InputJsonValue,
                },
              });

          await tx.$executeRaw`
            UPDATE "ProductVariant"
            SET "colorImage" = ${variant.colorImage}
            WHERE "id" = ${savedVariant.id}
          `;

          await syncVariantWarehouseStock({
            tx,
            productId: id,
            productVariantId: savedVariant.id,
            quantity: effectiveType === "PHYSICAL" ? variant.stock : 0,
            reason: "Admin variant stock sync",
          });

          await ensureVariantCodes(tx, {
            productId: id,
            variantId: savedVariant.id,
          });
        }
      } else if (
        hasVariantsPayload &&
        (effectiveType === "PHYSICAL" || effectiveType === "DIGITAL" || effectiveType === "SERVICE")
      ) {
        const defaultVariant =
          existingVariants.find((variant) => variant.isDefault) ?? existingVariants[0];

        const savedVariant = defaultVariant
          ? await tx.productVariant.update({
              where: { id: defaultVariant.id },
              data: {
                sku:
                  body.sku && String(body.sku).trim()
                    ? String(body.sku).trim().toUpperCase().slice(0, 64)
                    : defaultVariant.sku,
                price: nextBasePrice,
                costPrice:
                  nextBaseCostPrice !== undefined ? nextBaseCostPrice : defaultVariant.costPrice,
                currency,
                stock: 0,
                lowStockThreshold: nextLowStockThreshold,
                isDefault: true,
                active: true,
                digitalAssetId:
                  body.digitalAssetId !== undefined
                    ? body.digitalAssetId
                      ? Number(body.digitalAssetId)
                      : null
                    : defaultVariant.digitalAssetId,
                options: {},
              },
            })
          : await tx.productVariant.create({
              data: {
                productId: id,
                sku:
                  body.sku && String(body.sku).trim()
                    ? String(body.sku).trim().toUpperCase().slice(0, 64)
                    : `${slug.substring(0, 20)}-V1`.toUpperCase(),
                price: nextBasePrice,
                costPrice: nextBaseCostPrice ?? null,
                currency,
                stock: 0,
                lowStockThreshold: nextLowStockThreshold,
                isDefault: true,
                active: true,
                digitalAssetId: body.digitalAssetId ? Number(body.digitalAssetId) : null,
                options: {},
              },
            });

        await tx.productVariant.updateMany({
          where: {
            productId: id,
            NOT: { id: savedVariant.id },
          },
          data: { isDefault: false },
        });

        if (effectiveType === "PHYSICAL") {
          await syncVariantWarehouseStock({
            tx,
            productId: id,
            productVariantId: savedVariant.id,
            quantity: nextSimpleStock ?? 0,
            reason: "Admin stock sync",
          });
        }

        await ensureVariantCodes(tx, {
          productId: id,
          variantId: savedVariant.id,
        });
      }
    });

    const withRelations = await prisma.product.findFirst({
      where: { id, deleted: false },
      include: productInclude,
    });

    const withRelationsWithColorImages = withRelations
      ? attachVariantColorImages(
          withRelations,
          await getVariantColorImageMap(
            Array.isArray(withRelations.variants)
              ? withRelations.variants.map((variant: any) => Number(variant.id))
              : [],
          ),
        )
      : withRelations;

    if (withRelationsWithColorImages) {
      await logActivity({
        action: "update_product",
        entity: "product",
        entityId: withRelationsWithColorImages.id,
        access,
        request: req,
        metadata: {
          message: `Product updated: ${withRelationsWithColorImages.name}`,
        },
        before: toProductLogSnapshot(existing),
        after: toProductLogSnapshot(withRelationsWithColorImages),
      });
    }

    revalidateStorefrontCatalog();

    return NextResponse.json(withRelationsWithColorImages);
  } catch (err) {
    console.error(err);
    const message =
      err instanceof Error ? err.message : "Failed to update product";
    const status =
      typeof message === "string" &&
      (message.startsWith("Cannot remove variant") ||
        message.startsWith("A warehouse is required") ||
        message.startsWith("Stock quantity"))
        ? 400
        : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}

/* =========================
   ACTIVATE / DEACTIVATE PRODUCT
========================= */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
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

    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json(
        { error: "Invalid product id" },
        { status: 400 },
      );
    }

    let requestBody: unknown;
    try {
      requestBody = await req.json();
    } catch {
      return NextResponse.json(
        { error: "A valid JSON body is required" },
        { status: 400 },
      );
    }

    const parsed = parseProductAvailabilityPatch(requestBody);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const existing = await prisma.product.findFirst({
      where: { id, deleted: false },
      include: productInclude,
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 },
      );
    }

    if (
      !isExpectedProductVersion(
        existing.updatedAt,
        parsed.value.expectedUpdatedAt,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "This product changed after the page was loaded. Latest product data has been reloaded; review it and try again.",
        },
        { status: 409 },
      );
    }

    if (parsed.value.available && existing.category.deleted) {
      return NextResponse.json(
        {
          error:
            "This product cannot be activated because its category is inactive",
        },
        { status: 409 },
      );
    }

    if (existing.available === parsed.value.available) {
      if (!existing.available) {
        await prisma.cartItem.deleteMany({ where: { productId: id } });
      }
      const colorImageMap = await getVariantColorImageMap(
        existing.variants.map((variant) => Number(variant.id)),
      );
      return privateJson(attachVariantColorImages(existing, colorImageMap));
    }

    const mutation = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.product.updateMany({
        where: {
          id,
          deleted: false,
          updatedAt: existing.updatedAt,
        },
        data: { available: parsed.value.available },
      });
      const removedCartItems =
        updateResult.count === 1 && !parsed.value.available
          ? await tx.cartItem.deleteMany({ where: { productId: id } })
          : { count: 0 };

      return {
        updatedCount: updateResult.count,
        removedCartItemCount: removedCartItems.count,
      };
    });

    if (mutation.updatedCount !== 1) {
      return NextResponse.json(
        {
          error:
            "This product was changed by another administrator. Latest product data has been reloaded; review it and try again.",
        },
        { status: 409 },
      );
    }

    const updated = await prisma.product.findFirst({
      where: { id, deleted: false },
      include: productInclude,
    });
    if (!updated) {
      return NextResponse.json(
        { error: "Product not found after availability update" },
        { status: 409 },
      );
    }

    const colorImageMap = await getVariantColorImageMap(
      updated.variants.map((variant) => Number(variant.id)),
    );
    const updatedWithColorImages = attachVariantColorImages(
      updated,
      colorImageMap,
    );
    const action = updated.available ? "activate_product" : "deactivate_product";

    await logActivity({
      action,
      entity: "product",
      entityId: updated.id,
      access,
      request: req,
      metadata: {
        message: `Product ${updated.available ? "activated" : "deactivated"}: ${updated.name}`,
        removedCartItemCount: mutation.removedCartItemCount,
      },
      before: toProductLogSnapshot(existing),
      after: toProductLogSnapshot(updatedWithColorImages),
    });

    revalidateStorefrontCatalog();

    return privateJson(updatedWithColorImages);
  } catch (error) {
    console.error("Failed to update product availability", error);
    return NextResponse.json(
      { error: "Failed to update product availability" },
      { status: 500 },
    );
  }
}

/* =========================
   SOFT DELETE PRODUCT
========================= */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
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

    const { id: idParam } = await ctx.params;
    const id = Number(idParam);

    if (isNaN(id)) {
      return NextResponse.json(
        { error: "Invalid product id" },
        { status: 400 }
      );
    }

    const existing = await prisma.product.findFirst({
      where: { id, deleted: false },
      include: productInclude,
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    const deletedProduct = await prisma.product.update({
      where: { id },
      data: { deleted: true },
      include: productInclude,
    });

    await logActivity({
      action: "delete_product",
      entity: "product",
      entityId: deletedProduct.id,
      access,
      request: req,
      metadata: {
        message: `Product deleted: ${deletedProduct.name}`,
      },
      before: toProductLogSnapshot(existing),
      after: toProductLogSnapshot(deletedProduct),
    });

    revalidateStorefrontCatalog();

    return NextResponse.json({
      message: "Product soft deleted successfully",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to delete product" },
      { status: 500 }
    );
  }
}
