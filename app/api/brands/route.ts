// api/brands/route.ts

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import slugify from "slugify";
import { isStorefrontRequest, privateJson, publicJson } from "@/lib/public-cache";

function toBrandLogSnapshot(brand: {
  name: string;
  slug: string;
  logo?: string | null;
}) {
  return {
    name: brand.name,
    slug: brand.slug,
    logo: brand.logo ?? null,
  };
}

/* =========================
   GET ALL BRANDS
========================= */
export async function GET(req: Request) {
  try {
    const brands = await prisma.brand.findMany({
      where: { deleted: false },
      orderBy: { id: "desc" },
      include: {
        _count: {
          select: {
            products: {
              where: { deleted: false },
            },
          },
        },
      },
    });

    const data = brands.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        logo: b.logo,
        productCount: b._count.products,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      }));
    return isStorefrontRequest(req)
      ? publicJson(data, { maxAge: 300, staleWhileRevalidate: 1800 })
      : privateJson(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch brands" },
      { status: 500 }
    );
  }
}

/* =========================
   CREATE BRAND
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

    const { name, logo } = await req.json();

    if (!name)
      return NextResponse.json(
        { error: "Brand name required" },
        { status: 400 }
      );

    const slug = slugify(name, { lower: true, strict: true });

    const exists = await prisma.brand.findUnique({
      where: { slug },
    });

    if (exists)
      return NextResponse.json(
        { error: "Brand already exists" },
        { status: 400 }
      );

    const brand = await prisma.brand.create({
      data: {
        name,
        slug,
        logo: logo || null,
      },
    });

    await logActivity({
      action: "create",
      entity: "brand",
      entityId: brand.id,
      access,
      request: req,
      metadata: {
        message: `Brand created: ${brand.name}`,
      },
      after: toBrandLogSnapshot(brand),
    });

    return NextResponse.json(brand, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create brand" },
      { status: 500 }
    );
  }
}
