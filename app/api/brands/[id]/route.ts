// api/brands/[id]/route.ts

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import slugify from "slugify";
import { revalidateStorefrontCatalog } from "@/lib/storefront-catalog-cache";

function toBrandLogSnapshot(brand: {
  name: string;
  slug: string;
  logo?: string | null;
  deleted?: boolean;
}) {
  return {
    name: brand.name,
    slug: brand.slug,
    logo: brand.logo ?? null,
    deleted: brand.deleted ?? false,
  };
}

/* =========================
   UPDATE BRAND
========================= */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
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
    const { name, logo } = await req.json();

    const existing = await prisma.brand.findFirst({
      where: { id, deleted: false },
    });

    if (!existing)
      return NextResponse.json(
        { error: "Brand not found" },
        { status: 404 }
      );

    let slug;
    if (name) {
      slug = slugify(name, { lower: true, strict: true });

      const duplicate = await prisma.brand.findFirst({
        where: {
          slug,
          NOT: { id },
        },
      });

      if (duplicate)
        return NextResponse.json(
          { error: "Brand already exists" },
          { status: 400 }
        );
    }

    const updated = await prisma.brand.update({
      where: { id },
      data: {
        name: name ?? existing.name,
        slug: slug ?? existing.slug,
        logo: logo !== undefined ? logo : existing.logo,
      },
    });

    await logActivity({
      action: "update",
      entity: "brand",
      entityId: updated.id,
      access,
      request: req,
      metadata: {
        message: `Brand updated: ${updated.name}`,
      },
      before: toBrandLogSnapshot(existing),
      after: toBrandLogSnapshot(updated),
    });

    revalidateStorefrontCatalog();

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      { error: "Failed to update brand" },
      { status: 500 }
    );
  }
}

/* =========================
   SOFT DELETE
========================= */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
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

    const existing = await prisma.brand.findFirst({
      where: { id, deleted: false },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Brand not found" },
        { status: 404 }
      );
    }

    await prisma.brand.update({
      where: { id },
      data: { deleted: true },
    });

    await logActivity({
      action: "delete",
      entity: "brand",
      entityId: id,
      access,
      request: req,
      metadata: {
        message: `Brand deleted: ${existing.name}`,
      },
      before: toBrandLogSnapshot(existing),
      after: {
        ...toBrandLogSnapshot(existing),
        deleted: true,
      },
    });

    revalidateStorefrontCatalog();

    return NextResponse.json({ message: "Brand deleted" });
  } catch {
    return NextResponse.json(
      { error: "Delete failed" },
      { status: 500 }
    );
  }
}
