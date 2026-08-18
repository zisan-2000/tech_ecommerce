// api/categories/[id]/route.ts

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import slugify from "slugify";
import { revalidateStorefrontCatalog } from "@/lib/storefront-catalog-cache";
import {
  isStorefrontRequest,
  privateJson,
  publicJson,
} from "@/lib/public-cache";

function toCategoryLogSnapshot(category: {
  name: string;
  slug: string;
  image?: string | null;
  parentId?: number | null;
  deleted?: boolean;
}) {
  return {
    name: category.name,
    slug: category.slug,
    image: category.image ?? null,
    parentId: category.parentId ?? null,
    deleted: category.deleted ?? false,
  };
}

/* =========================
   GET SINGLE CATEGORY
========================= */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const storefront = isStorefrontRequest(req);
    const { id: idParam } = await params;
    const id = Number(idParam);

    if (isNaN(id)) {
      return NextResponse.json(
        { error: "Invalid category id" },
        { status: 400 },
      );
    }

    const category = await prisma.category.findFirst({
      where: { id, deleted: false },
      include: {
        parent: true,
        children: {
          where: { deleted: false },
        },
        _count: {
          select: {
            products: {
              where: {
                deleted: false,
                ...(storefront ? { available: true } : {}),
              },
            },
          },
        },
        products: {
          where: {
            deleted: false,
            ...(storefront ? { available: true } : {}),
          },
          include: {
            writer: true,
            brand: true,
          },
        },
      },
    });

    if (!category) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 },
      );
    }

    const response = {
      id: category.id,
      name: category.name,
      slug: category.slug,
      image: category.image, // ✅ added
      parentId: category.parentId,
      parentName: category.parent?.name || null,
      productCount: category._count.products,
      childrenCount: category.children.length,
      products: category.products,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };

    return storefront
      ? publicJson(response, { maxAge: 60, staleWhileRevalidate: 300 })
      : privateJson(response);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch category" },
      { status: 500 },
    );
  }
}

/* =========================
   UPDATE CATEGORY
========================= */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
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

    const { id: idParam } = await params;
    const id = Number(idParam);
    const { name, parentId, image } = await req.json();

    if (isNaN(id)) {
      return NextResponse.json(
        { error: "Invalid category id" },
        { status: 400 },
      );
    }

    const existing = await prisma.category.findFirst({
      where: { id, deleted: false },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 },
      );
    }

    let slug;
    if (name) {
      slug = slugify(name, { lower: true, strict: true });

      const duplicate = await prisma.category.findFirst({
        where: {
          slug,
          NOT: { id },
        },
      });

      if (duplicate) {
        return NextResponse.json(
          { error: "Category name already exists" },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.category.update({
      where: { id },
      data: {
        name: name ?? existing.name,
        slug: slug ?? existing.slug,
        image: image !== undefined ? image : existing.image, // ✅ added
        parentId: parentId ?? existing.parentId,
      },
    });

    await logActivity({
      action: "update",
      entity: "category",
      entityId: updated.id,
      access,
      request: req,
      metadata: {
        message: `Category updated: ${updated.name}`,
      },
      before: toCategoryLogSnapshot(existing),
      after: toCategoryLogSnapshot(updated),
    });

    revalidateStorefrontCatalog();

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to update category" },
      { status: 500 },
    );
  }
}

/* =========================
   SOFT DELETE CATEGORY
========================= */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
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

    const { id: idParam } = await params;
    const id = Number(idParam);

    if (isNaN(id)) {
      return NextResponse.json(
        { error: "Invalid category id" },
        { status: 400 },
      );
    }

    const existing = await prisma.category.findFirst({
      where: { id, deleted: false },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 },
      );
    }

    await prisma.category.update({
      where: { id },
      data: { deleted: true },
    });

    await logActivity({
      action: "delete",
      entity: "category",
      entityId: id,
      access,
      request: req,
      metadata: {
        message: `Category deleted: ${existing.name}`,
      },
      before: toCategoryLogSnapshot(existing),
      after: {
        ...toCategoryLogSnapshot(existing),
        deleted: true,
      },
    });

    revalidateStorefrontCatalog();

    return NextResponse.json({
      message: "Category soft deleted successfully",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to delete category" },
      { status: 500 },
    );
  }
}
