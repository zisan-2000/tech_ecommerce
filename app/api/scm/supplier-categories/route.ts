import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  hasSupplierManageAccess,
  hasSupplierReadAccess,
  toCleanText,
} from "../suppliers/shared";

function normalizeCategoryCode(raw: unknown, fallbackName: string) {
  const source = toCleanText(raw, 50) || fallbackName;
  return source
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasSupplierReadAccess(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const search = request.nextUrl.searchParams.get("search")?.trim() || "";
    const activeParam = request.nextUrl.searchParams.get("active");
    const isActive =
      activeParam === "true" ? true : activeParam === "false" ? false : undefined;

    const categories = await prisma.supplierCategory.findMany({
      where: {
        ...(typeof isActive === "boolean" ? { isActive } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { code: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            suppliers: true,
            rfqTargets: true,
          },
        },
      },
    });

    return NextResponse.json(
      categories.map((category) => ({
        id: category.id,
        code: category.code,
        name: category.name,
        description: category.description,
        isActive: category.isActive,
        supplierCount: category._count.suppliers,
        targetedRfqCount: category._count.rfqTargets,
        createdAt: category.createdAt.toISOString(),
        updatedAt: category.updatedAt.toISOString(),
      })),
    );
  } catch (error) {
    console.error("SCM SUPPLIER CATEGORIES GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load supplier categories." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasSupplierManageAccess(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name =
      toCleanText(body.name, 80) ||
      toCleanText(body.categoryName, 80) ||
      toCleanText(body.title, 80);
    if (!name) {
      return NextResponse.json({ error: "Category name is required." }, { status: 400 });
    }

    const code = normalizeCategoryCode(body.code, name);
    if (!code) {
      return NextResponse.json({ error: "Category code is required." }, { status: 400 });
    }

    const created = await prisma.supplierCategory.create({
      data: {
        code,
        name,
        description: toCleanText(body.description, 255) || null,
        isActive: body.isActive === undefined ? true : Boolean(body.isActive),
        createdById: access.userId,
      },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await logActivity({
      action: "create",
      entity: "supplier_category",
      entityId: created.id,
      access,
      request,
      metadata: {
        message: `Created supplier category ${created.name} (${created.code})`,
      },
      after: {
        code: created.code,
        name: created.name,
        description: created.description,
        isActive: created.isActive,
      },
    });

    return NextResponse.json(
      {
        ...created,
        supplierCount: 0,
        targetedRfqCount: 0,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("SCM SUPPLIER CATEGORIES POST ERROR:", error);
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "Supplier category code already exists." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: error?.message || "Failed to create supplier category." },
      { status: 500 },
    );
  }
}

