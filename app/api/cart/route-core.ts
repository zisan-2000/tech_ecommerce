// app/api/cart/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { applyFlashSalePricingToProduct } from '@/lib/flash-sale';
import { computeWarehouseAvailableStock } from '@/lib/warehouse-stock';
import { evaluateCartReminderNotifications } from '@/lib/cart-reminder-notifications';

async function findStandardCartItem(
  userId: string,
  productId: number,
  variantId: number | null,
) {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    'SELECT "id" FROM "CartItem" WHERE "userId" = $1 AND "productId" = $2 AND "variantId" IS NOT DISTINCT FROM $3 AND "lineKey" = \'standard\' LIMIT 1',
    userId,
    productId,
    variantId,
  );
  const id = rows[0]?.id;
  return id
    ? prisma.cartItem.findUnique({ where: { id } })
    : null;
}

function warehouseStockOrUnavailable(variant: {
  stockLevels?: Array<{ quantity: number; reserved: number }> | null;
}) {
  return computeWarehouseAvailableStock(variant);
}

// GET cart items - Logged in user only
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { id?: string } | undefined;
    const userId = user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await evaluateCartReminderNotifications({ userId });

    const items = await prisma.cartItem.findMany({
      where: {
        userId,
        product: { available: true, deleted: false },
      },
      include: {
        product: {
          include: {
            variants: {
              orderBy: { id: 'asc' },
            },
            VatClass: true,
            bundleItems: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    image: true,
                    basePrice: true,
                  }
                }
              },
              orderBy: { sortOrder: 'asc' }
            },
          },
        },
        variant: true,
      },
      orderBy: { id: 'asc' },
    });

    return NextResponse.json({
      items: items.map((item) => ({
        ...item,
        product: applyFlashSalePricingToProduct(item.product),
        variant: item.variant
          ? {
              ...item.variant,
              price: applyFlashSalePricingToProduct({
                ...item.product,
                variants: [item.variant],
              }).variants?.[0]?.price ?? Number(item.variant.price),
            }
          : null,
      })),
    });
  } catch (error) {
    console.error('Error fetching cart:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ADD to cart - Logged in user only
// Body: { productId: number, variantId?: number, quantity?: number }
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { id?: string } | undefined;
    const userId = user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const productId = Number(body.productId);
    const variantId =
      body.variantId !== undefined && body.variantId !== null
        ? Number(body.variantId)
        : null;
    const quantity = Number(body.quantity ?? 1);

    if (!productId || Number.isNaN(productId) || quantity <= 0) {
      return NextResponse.json(
        { error: 'Invalid productId or quantity' },
        { status: 400 }
      );
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        variants: {
          include: {
            stockLevels: {
              select: { quantity: true, reserved: true },
            },
          },
          orderBy: { isDefault: 'desc' },
        },
        bundleItems: {
          include: {
            product: {
              include: {
                variants: {
                  include: {
                    stockLevels: {
                      select: { quantity: true, reserved: true },
                    },
                  },
                  orderBy: { isDefault: 'desc' },
                },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!product || product.deleted || !product.available) {
      return NextResponse.json(
        { error: 'Product not available' },
        { status: 404 }
      );
    }

    // Handle bundle stock validation
    if (product.type === 'BUNDLE') {
      if (product.bundleItems.length === 0) {
        return NextResponse.json(
          { error: 'Bundle has no items configured' },
          { status: 400 }
        );
      }

      let derivedBundleStock = Number.POSITIVE_INFINITY;

      for (const bundleItem of product.bundleItems) {
        const childProduct = bundleItem.product;
        const childVariant = childProduct.variants.find(v => v.isDefault) || childProduct.variants[0];

        if (!childVariant) {
          return NextResponse.json(
            { error: `Bundle item "${childProduct.name}" has no inventory configured` },
            { status: 400 }
          );
        }

        const availableStock = warehouseStockOrUnavailable(childVariant);
        if (availableStock === null) {
          return NextResponse.json(
            { error: `Bundle item "${childProduct.name}" has no warehouse inventory configured` },
            { status: 400 }
          );
        }

        const requiredQuantity = bundleItem.quantity * quantity;
        const maxBundlesForItem = Math.floor(availableStock / bundleItem.quantity);
        derivedBundleStock = Math.min(derivedBundleStock, maxBundlesForItem);

        if (availableStock < requiredQuantity) {
          return NextResponse.json(
            { error: `Insufficient stock for bundle item "${childProduct.name}". Required: ${requiredQuantity}, Available: ${availableStock}` },
            { status: 400 }
          );
        }
      }

      const bundleStockLimit =
        product.bundleStockLimit !== null && product.bundleStockLimit !== undefined
          ? Number(product.bundleStockLimit)
          : null;
      const effectiveBundleStock =
        bundleStockLimit !== null
          ? Math.min(derivedBundleStock, bundleStockLimit)
          : derivedBundleStock;

      if (quantity > effectiveBundleStock) {
        return NextResponse.json(
          {
            error: `Requested bundle quantity exceeds available bundle stock. Available: ${effectiveBundleStock}`,
          },
          { status: 400 }
        );
      }

      const existing = await findStandardCartItem(userId, productId, null);

      let cartItem;

      if (existing) {
        const nextQuantity = existing.quantity + quantity;

        let updatedDerivedBundleStock = Number.POSITIVE_INFINITY;
        for (const bundleItem of product.bundleItems) {
          const childProduct = bundleItem.product;
          const childVariant = childProduct.variants.find(v => v.isDefault) || childProduct.variants[0];
          if (!childVariant) {
            return NextResponse.json(
              { error: `Bundle item "${childProduct.name}" has no inventory configured` },
              { status: 400 }
            );
          }

          const availableStock = warehouseStockOrUnavailable(childVariant);
          if (availableStock === null) {
            return NextResponse.json(
              { error: `Bundle item "${childProduct.name}" has no warehouse inventory configured` },
              { status: 400 }
            );
          }

          const requiredQuantity = bundleItem.quantity * nextQuantity;
          const maxBundlesForItem = Math.floor(availableStock / bundleItem.quantity);
          updatedDerivedBundleStock = Math.min(updatedDerivedBundleStock, maxBundlesForItem);

          if (availableStock < requiredQuantity) {
            return NextResponse.json(
              { error: `Insufficient stock for bundle item "${childProduct.name}". Required: ${requiredQuantity}, Available: ${availableStock}` },
              { status: 400 }
            );
          }
        }

        const updatedBundleStockLimit =
          product.bundleStockLimit !== null && product.bundleStockLimit !== undefined
            ? Number(product.bundleStockLimit)
            : null;
        const updatedEffectiveBundleStock =
          updatedBundleStockLimit !== null
            ? Math.min(updatedDerivedBundleStock, updatedBundleStockLimit)
            : updatedDerivedBundleStock;

        if (nextQuantity > updatedEffectiveBundleStock) {
          return NextResponse.json(
            {
              error: `Requested bundle quantity exceeds available bundle stock. Available: ${updatedEffectiveBundleStock}`,
            },
            { status: 400 }
          );
        }

        cartItem = await prisma.cartItem.update({
          where: { id: existing.id },
          data: {
            quantity: nextQuantity,
            lastReminderAt: null,
          },
        });
      } else {
        cartItem = await prisma.cartItem.create({
          data: {
            userId,
            productId,
            variantId: null,
            quantity,
          },
        });
      }

      return NextResponse.json(cartItem, { status: 201 });
    }

    const targetVariant =
      variantId !== null
        ? product.variants.find((variant) => variant.id === variantId) ?? null
        : product.variants.find((variant) => variant.isDefault) ??
          product.variants[0] ??
          null;

    if (!targetVariant) {
      return NextResponse.json(
        { error: 'Product inventory is not configured' },
        { status: 400 }
      );
    }

    if (!targetVariant.active) {
      return NextResponse.json(
        { error: 'Selected variant is inactive' },
        { status: 400 }
      );
    }

    if (targetVariant.productId !== productId) {
      return NextResponse.json(
        { error: 'Variant does not belong to the selected product' },
        { status: 400 }
      );
    }

    const availableStock = warehouseStockOrUnavailable(targetVariant);
    if (product.type === 'PHYSICAL' && availableStock === null) {
      return NextResponse.json(
        { error: 'Warehouse inventory is not configured for the selected variant' },
        { status: 400 }
      );
    }
    if (product.type === 'PHYSICAL' && Number(availableStock) < quantity) {
      return NextResponse.json(
        { error: 'Requested quantity exceeds available stock' },
        { status: 400 }
      );
    }

    const existing = await findStandardCartItem(
      userId,
      productId,
      targetVariant.id,
    );

    let cartItem;

    if (existing) {
      const nextQuantity = existing.quantity + quantity;
      if (product.type === 'PHYSICAL' && Number(availableStock) < nextQuantity) {
        return NextResponse.json(
          { error: 'Requested quantity exceeds available stock' },
          { status: 400 }
        );
      }

      cartItem = await prisma.cartItem.update({
        where: { id: existing.id },
          data: {
            quantity: nextQuantity,
            lastReminderAt: null,
          },
        });
    } else {
      cartItem = await prisma.cartItem.create({
        data: {
          userId,
          productId,
          variantId: targetVariant.id,
          quantity,
        },
      });
    }

    return NextResponse.json(cartItem, { status: 201 });
  } catch (error) {
    console.error('Error adding to cart:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// CLEAR cart - Logged in user only
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { id?: string } | undefined;
    const userId = user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await prisma.cartItem.deleteMany({
      where: { userId },
    });

    return NextResponse.json({ message: 'Cart cleared' });
  } catch (error) {
    console.error('Error clearing cart:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
