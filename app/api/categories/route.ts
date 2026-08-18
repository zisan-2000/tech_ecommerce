// api/categories/route.ts

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import slugify from "slugify";
import { isStorefrontRequest, privateJson, publicJson } from "@/lib/public-cache";
import { revalidateStorefrontCatalog } from "@/lib/storefront-catalog-cache";

function toCategoryLogSnapshot(category: {
  name: string;
  slug: string;
  image?: string | null;
  parentId?: number | null;
}) {
  return {
    name: category.name,
    slug: category.slug,
    image: category.image ?? null,
    parentId: category.parentId ?? null,
  };
}

/* =========================
   GET ALL CATEGORIES
========================= */
export async function GET(req: Request) {
  try {
    const categories = await prisma.category.findMany({
      where: { deleted: false },
      orderBy: { id: "desc" },
      include: {
        parent: true,
        children: {
          where: { deleted: false },
        },
        _count: {
          select: {
            products: {
              where: { deleted: false },
            },
          },
        },
      },
    });

    const categoryMap = new Map(
      categories.map((category) => [category.id, category]),
    );
    const childMap = new Map<number, number[]>();

    categories.forEach((category) => {
      if (!category.parentId) return;
      const siblings = childMap.get(category.parentId) ?? [];
      siblings.push(category.id);
      childMap.set(category.parentId, siblings);
    });

    const totals = new Map<number, number>();

    const computeTotalProductCount = (categoryId: number): number => {
      if (totals.has(categoryId)) {
        return totals.get(categoryId)!;
      }

      const category = categoryMap.get(categoryId);
      if (!category) return 0;

      const children = childMap.get(categoryId) ?? [];
      const childrenTotal = children.reduce((sum, childId) => {
        return sum + computeTotalProductCount(childId);
      }, 0);
      const total = category._count.products + childrenTotal;

      totals.set(categoryId, total);
      return total;
    };

    const formatted = categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      image: c.image,
      parentId: c.parentId,
      parentName: c.parent?.name || null,
      productCount: computeTotalProductCount(c.id),
      childrenCount: c.children.length,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,

      // ✅ added: deleted field
      deleted: c.deleted,
    }));

    return isStorefrontRequest(req)
      ? publicJson(formatted, { maxAge: 300, staleWhileRevalidate: 1800 })
      : privateJson(formatted);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

/* =========================
   CREATE CATEGORY
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

    const { name, parentId, image } = await req.json();

    if (!name) {
      return NextResponse.json(
        { error: "Category name is required" },
        { status: 400 }
      );
    }

    const slug = slugify(name, { lower: true, strict: true });

    const existing = await prisma.category.findUnique({
      where: { slug },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Category already exists" },
        { status: 400 }
      );
    }

    const category = await prisma.category.create({
      data: {
        name,
        slug,
        image: image || null,
        parentId: parentId || null,
      },
    });

    await logActivity({
      action: "create",
      entity: "category",
      entityId: category.id,
      access,
      request: req,
      metadata: {
        message: `Category created: ${category.name}`,
      },
      after: toCategoryLogSnapshot(category),
    });

    revalidateStorefrontCatalog();

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to create category" },
      { status: 500 }
    );
  }
}
