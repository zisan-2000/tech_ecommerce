import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { 
  calculateBundlePricing, 
  validateBundleConfiguration, 
  mergeDuplicateBundleItems,
  type BundleItem,
  type DiscountType 
} from '@/lib/bundle';
import { revalidateStorefrontCatalog } from '@/lib/storefront-catalog-cache';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const bundleId = parseInt(id);

    if (isNaN(bundleId)) {
      return NextResponse.json(
        { error: 'Invalid bundle ID' },
        { status: 400 }
      );
    }

    const bundle = await prisma.product.findFirst({
      where: {
        id: bundleId,
        type: 'BUNDLE',
        deleted: false
      },
      include: {
        bundleItems: {
          include: {
            product: {
              include: {
                variants: {
                  where: { active: true },
                  orderBy: { isDefault: 'desc' }
                }
              }
            }
          },
          orderBy: { sortOrder: 'asc' }
        },
        category: true,
        brand: true,
        VatClass: true
      }
    });

    if (!bundle) {
      return NextResponse.json(
        { error: 'Bundle not found' },
        { status: 404 }
      );
    }

    // Calculate bundle statistics
    const regularTotal = bundle.bundleItems.reduce((total, item) => {
      const price = item.product.variants[0]?.price || item.product.basePrice;
      return total + (Number(price) * item.quantity);
    }, 0);
    
    const discountAmount = regularTotal - Number(bundle.basePrice);
    const discountPercentage = regularTotal > 0 ? (discountAmount / regularTotal) * 100 : 0;

    const bundleWithStats = {
      ...bundle,
      _stats: {
        itemCount: bundle.bundleItems.length,
        regularTotal,
        discountedPrice: Number(bundle.basePrice),
        discountAmount,
        discountPercentage: Math.round(discountPercentage * 100) / 100,
        savings: discountAmount > 0 ? `${Math.round(discountPercentage * 100) / 100}%` : 'No discount'
      }
    };

    return NextResponse.json(bundleWithStats);
  } catch (error) {
    console.error('Error fetching bundle:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bundle' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const bundleId = parseInt(id);

    if (isNaN(bundleId)) {
      return NextResponse.json(
        { error: 'Invalid bundle ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    
    const {
      name,
      description,
      shortDesc,
      categoryId,
      brandId,
      vatClassId,
      image,
      gallery,
      discountType,
      discountValue,
      manualPrice,
      items,
      bundleStockLimit,
      available,
      featured,
      currency
    } = body;

    // Check if bundle exists
    const existingBundle = await prisma.product.findFirst({
      where: {
        id: bundleId,
        type: 'BUNDLE',
        deleted: false
      }
    });

    if (!existingBundle) {
      return NextResponse.json(
        { error: 'Bundle not found' },
        { status: 404 }
      );
    }

    // Validate required fields
    if (!name || !description || !categoryId || !items || items.length < 2) {
      return NextResponse.json(
        { error: 'Missing required fields. Bundle must have at least 2 items.' },
        { status: 400 }
      );
    }

    // Validate discount type
    if (!['PERCENTAGE', 'FIXED', 'MANUAL'].includes(discountType)) {
      return NextResponse.json(
        { error: 'Invalid discount type' },
        { status: 400 }
      );
    }

    // Convert items to BundleItem format
    const bundleItems: BundleItem[] = items.map((item: any) => ({
      product: item.product,
      variant: item.variant,
      quantity: item.quantity
    }));

    // Merge duplicate items
    const mergedItems = mergeDuplicateBundleItems(bundleItems);

    // Validate bundle configuration
    const validation = validateBundleConfiguration(
      mergedItems,
      discountType as DiscountType,
      discountValue,
      manualPrice
    );

    if (!validation.isValid) {
      return NextResponse.json(
        { error: 'Invalid bundle configuration', details: validation.errors },
        { status: 400 }
      );
    }

    // Calculate pricing
    const pricing = calculateBundlePricing({
      items: mergedItems,
      discountType: discountType as DiscountType,
      discountValue,
      manualPrice
    });

    // Generate new slug if name changed
    let slug = existingBundle.slug;
    if (name !== existingBundle.name) {
      slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      // Check if slug already exists (excluding current bundle)
      const slugConflict = await prisma.product.findFirst({
        where: {
          slug,
          id: { not: bundleId }
        }
      });

      if (slugConflict) {
        return NextResponse.json(
          { error: 'A product with this name already exists' },
          { status: 409 }
        );
      }
    }

    // Update bundle and items in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update the bundle product
      const bundle = await tx.product.update({
        where: { id: bundleId },
        data: {
          name,
          slug,
          description,
          shortDesc,
          categoryId,
          brandId,
          basePrice: pricing.discountedPrice,
          originalPrice: pricing.regularTotal,
          currency,
          image,
          gallery: gallery || [],
          bundleStockLimit:
            bundleStockLimit !== null &&
            bundleStockLimit !== undefined &&
            Number(bundleStockLimit) > 0
              ? Number(bundleStockLimit)
              : null,
          available,
          featured,
          VatClassId: vatClassId || null,
        }
      });

      // Delete existing bundle items
      await tx.productBundleItem.deleteMany({
        where: { bundleId }
      });

      // Create new bundle items
      const bundleItemsData = mergedItems.map((item, index) => ({
        bundleId: bundle.id,
        productId: item.product.id,
        quantity: item.quantity,
        sortOrder: index
      }));

      await tx.productBundleItem.createMany({
        data: bundleItemsData
      });

      return bundle;
    });

    revalidateStorefrontCatalog();

    return NextResponse.json({
      success: true,
      bundle: result,
      pricing
    });

  } catch (error) {
    console.error('Error updating bundle:', error);
    return NextResponse.json(
      { error: 'Failed to update bundle' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const bundleId = parseInt(id);

    if (isNaN(bundleId)) {
      return NextResponse.json(
        { error: 'Invalid bundle ID' },
        { status: 400 }
      );
    }

    // Check if bundle exists
    const existingBundle = await prisma.product.findFirst({
      where: {
        id: bundleId,
        type: 'BUNDLE',
        deleted: false
      },
      include: {
        bundleItems: true
      }
    });

    if (!existingBundle) {
      return NextResponse.json(
        { error: 'Bundle not found' },
        { status: 404 }
      );
    }

    // Check if bundle has any orders
    const orderItemsCount = await prisma.orderItem.count({
      where: { productId: bundleId }
    });

    if (orderItemsCount > 0) {
      // Soft delete if bundle has orders
      await prisma.product.update({
        where: { id: bundleId },
        data: {
          deleted: true,
          available: false
        }
      });

      revalidateStorefrontCatalog();

      return NextResponse.json({
        success: true,
        message: 'Bundle soft deleted due to existing orders'
      });
    } else {
      // Hard delete if no orders
      await prisma.$transaction(async (tx) => {
        // Delete bundle items
        await tx.productBundleItem.deleteMany({
          where: { bundleId }
        });

        // Delete bundle product
        await tx.product.delete({
          where: { id: bundleId }
        });
      });

      revalidateStorefrontCatalog();

      return NextResponse.json({
        success: true,
        message: 'Bundle permanently deleted'
      });
    }

  } catch (error) {
    console.error('Error deleting bundle:', error);
    return NextResponse.json(
      { error: 'Failed to delete bundle' },
      { status: 500 }
    );
  }
}
