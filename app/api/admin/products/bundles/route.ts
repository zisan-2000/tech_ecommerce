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
import {
  calculateBundleBuildCapacity,
  normalizeBundleSku,
  normalizeBundleStockQuantity,
  syncBundleDefaultVariant,
} from '@/lib/bundle-inventory';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status'); // active, inactive, all

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      type: 'BUNDLE',
      deleted: false,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status === 'active') {
      where.available = true;
    } else if (status === 'inactive') {
      where.available = false;
    }

    // Get bundles with their items
    const [bundles, totalCount] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        include: {
          bundleItems: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  basePrice: true,
                  image: true,
                  available: true,
                }
              }
            },
            orderBy: { sortOrder: 'asc' }
          },
          category: {
            select: { id: true, name: true }
          },
          brand: {
            select: { id: true, name: true }
          },
          variants: {
            include: {
              stockLevels: {
                include: {
                  warehouse: {
                    select: {
                      id: true,
                      name: true,
                      code: true,
                      isDefault: true
                    }
                  }
                },
                orderBy: { warehouseId: 'asc' }
              }
            },
            where: { active: true },
            orderBy: { isDefault: 'desc' }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.product.count({ where })
    ]);

    // Calculate bundle statistics
    const bundlesWithStats = bundles.map(bundle => {
      const itemCount = bundle.bundleItems.length;
      const regularTotal = bundle.bundleItems.reduce((total, item) => {
        return total + (Number(item.product.basePrice) * item.quantity);
      }, 0);
      
      const discountAmount = regularTotal - Number(bundle.basePrice);
      const discountPercentage = regularTotal > 0 ? (discountAmount / regularTotal) * 100 : 0;

      return {
        ...bundle,
        _stats: {
          itemCount,
          regularTotal,
          discountedPrice: Number(bundle.basePrice),
          discountAmount,
          discountPercentage: Math.round(discountPercentage * 100) / 100,
          savings: discountAmount > 0 ? `${Math.round(discountPercentage * 100) / 100}%` : 'No discount'
        }
      };
    });

    return NextResponse.json({
      bundles: bundlesWithStats,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching bundles:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bundles' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      name,
      description,
      shortDesc,
      sku,
      categoryId,
      brandId,
      brandIds,
      image,
      gallery,
      discountType,
      discountValue,
      manualPrice,
      items,
      bundleStockLimit,
      available = true,
      featured = false,
      currency = 'USD',
      warehouseId,
      vatClassId
    } = body;

    // Validate required fields
    if (!name || !description || !categoryId || !items || items.length < 2) {
      return NextResponse.json(
        { error: 'Missing required fields. Bundle must have at least 2 items.' },
        { status: 400 }
      );
    }

    const parsedWarehouseId = Number(warehouseId);
    if (!Number.isInteger(parsedWarehouseId) || parsedWarehouseId <= 0) {
      return NextResponse.json(
        { error: 'Please select a valid warehouse' },
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

    // Generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const bundleSku = normalizeBundleSku(sku, slug);
    const requestedStockQuantity = normalizeBundleStockQuantity(bundleStockLimit);

    if (requestedStockQuantity === undefined) {
      return NextResponse.json(
        { error: 'Bundle stock must be a whole number greater than or equal to 0' },
        { status: 400 }
      );
    }

    // Check if slug already exists
    const existingProduct = await prisma.product.findUnique({
      where: { slug }
    });

    if (existingProduct) {
      return NextResponse.json(
        { error: 'A product with this name already exists' },
        { status: 409 }
      );
    }

    const existingSku = await prisma.product.findFirst({
      where: {
        sku: bundleSku,
      },
      select: { id: true },
    });

    if (existingSku) {
      return NextResponse.json(
        { error: 'A product with this SKU already exists' },
        { status: 409 }
      );
    }

    // Create bundle product and items in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const maxBuildCapacity = await calculateBundleBuildCapacity({
        tx,
        items: mergedItems,
        warehouseId: parsedWarehouseId,
      });
      const bundleStockQuantity =
        requestedStockQuantity !== null
          ? requestedStockQuantity
          : maxBuildCapacity;

      if (bundleStockQuantity > maxBuildCapacity) {
        throw new Error(
          `Bundle stock cannot exceed available build capacity (${maxBuildCapacity})`
        );
      }

      // Create the bundle product
      const bundle = await tx.product.create({
        data: {
          name,
          slug,
          description,
          shortDesc,
          type: 'BUNDLE',
          sku: bundleSku,
          categoryId,
          brandId: brandId || null,
          basePrice: pricing.discountedPrice,
          originalPrice: pricing.regularTotal,
          currency,
          image,
          gallery: gallery || [],
          bundleStockLimit: bundleStockQuantity,
          available,
          featured,
          VatClassId: vatClassId || null, // Use provided VAT class or null
        }
      });

      await syncBundleDefaultVariant({
        tx,
        productId: bundle.id,
        sku: bundleSku,
        price: pricing.discountedPrice,
        currency,
        stockQuantity: bundleStockQuantity,
        warehouseId: parsedWarehouseId,
        reason: 'Admin bundle initial stock',
      });

      // Create bundle items
      const bundleItemsData = mergedItems.map((item, index) => ({
        bundleId: bundle.id,
        productId: item.product.id,
        quantity: item.quantity,
        sortOrder: index,
        // Store warehouse info in metadata or as a separate field if needed
        // For now, we'll handle warehouse validation at creation time
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
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating bundle:', error);
    if (
      error instanceof Error &&
      error.message.startsWith('Bundle stock cannot exceed')
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create bundle' },
      { status: 500 }
    );
  }
}

