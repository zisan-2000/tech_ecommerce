import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { privateJson } from "@/lib/public-cache";
import { logActivity } from "@/lib/activity-log";
import { parseFlashSaleConfiguration } from "@/lib/flash-sale";
import { revalidateStorefrontCatalog } from "@/lib/storefront-catalog-cache";

async function ensureAccess() {
  const session = await getServerSession(authOptions);
  const access = await getAccessContext(
    session?.user as { id?: string; role?: string } | undefined,
  );
  if (!access.userId) return { ok: false as const, status: 401 };
  if (!access.has("products.manage")) return { ok: false as const, status: 403 };
  return { ok: true as const, access };
}

function snapshot(product: {
  id: number;
  name: string;
  basePrice: unknown;
  flashSaleEnabled: boolean;
  flashSalePrice: unknown | null;
  flashSaleStartsAt: Date | null;
  flashSaleEndsAt: Date | null;
  flashSaleSortOrder: number;
  updatedAt: Date;
}) {
  return {
    id: product.id,
    name: product.name,
    basePrice: Number(product.basePrice),
    flashSaleEnabled: product.flashSaleEnabled,
    flashSalePrice:
      product.flashSalePrice === null ? null : Number(product.flashSalePrice),
    flashSaleStartsAt: product.flashSaleStartsAt?.toISOString() ?? null,
    flashSaleEndsAt: product.flashSaleEndsAt?.toISOString() ?? null,
    flashSaleSortOrder: product.flashSaleSortOrder,
    updatedAt: product.updatedAt.toISOString(),
  };
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ productId: string }> },
) {
  try {
    const allowed = await ensureAccess();
    if (!allowed.ok) {
      return NextResponse.json(
        { error: allowed.status === 401 ? "Unauthorized" : "Forbidden" },
        { status: allowed.status },
      );
    }

    const { productId } = await context.params;
    const id = Number(productId);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
    }

    const existing = await prisma.product.findFirst({
      where: { id, deleted: false },
      select: {
        id: true,
        name: true,
        available: true,
        basePrice: true,
        flashSaleEnabled: true,
        flashSalePrice: true,
        flashSaleStartsAt: true,
        flashSaleEndsAt: true,
        flashSaleSortOrder: true,
        updatedAt: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const body: unknown = await request.json();
    const parsed = parseFlashSaleConfiguration(body, existing.basePrice);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    if (!parsed.value.expectedUpdatedAt) {
      return NextResponse.json(
        { error: "Product version is required; refresh and try again" },
        { status: 400 },
      );
    }
    if (parsed.value.enabled && !existing.available) {
      return NextResponse.json(
        { error: "Activate the product before enabling its flash sale" },
        { status: 409 },
      );
    }

    const changedAt = new Date();
    const result = await prisma.product.updateMany({
      where: {
        id,
        deleted: false,
        updatedAt: parsed.value.expectedUpdatedAt,
      },
      data: {
        flashSaleEnabled: parsed.value.enabled,
        flashSalePrice: parsed.value.salePrice,
        flashSaleStartsAt: parsed.value.startsAt,
        flashSaleEndsAt: parsed.value.endsAt,
        flashSaleSortOrder: parsed.value.sortOrder,
        updatedAt: changedAt,
      },
    });
    if (result.count !== 1) {
      return NextResponse.json(
        { error: "This product changed in another session. Refresh and try again." },
        { status: 409 },
      );
    }

    const updated = await prisma.product.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        name: true,
        basePrice: true,
        flashSaleEnabled: true,
        flashSalePrice: true,
        flashSaleStartsAt: true,
        flashSaleEndsAt: true,
        flashSaleSortOrder: true,
        updatedAt: true,
      },
    });

    await logActivity({
      action: "configure_flash_sale",
      entity: "product",
      entityId: id,
      access: allowed.access,
      request,
      before: snapshot(existing),
      after: snapshot(updated),
      metadata: { message: `Flash sale configured for ${existing.name}` },
    });
    revalidateStorefrontCatalog();
    return privateJson(snapshot(updated));
  } catch (error) {
    console.error("FLASH SALE UPDATE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to update the flash sale" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ productId: string }> },
) {
  try {
    const allowed = await ensureAccess();
    if (!allowed.ok) {
      return NextResponse.json(
        { error: allowed.status === 401 ? "Unauthorized" : "Forbidden" },
        { status: allowed.status },
      );
    }

    const { productId } = await context.params;
    const id = Number(productId);
    const body = (await request.json().catch(() => ({}))) as {
      expectedUpdatedAt?: unknown;
    };
    const expectedUpdatedAt = new Date(String(body.expectedUpdatedAt ?? ""));
    if (!Number.isInteger(id) || id <= 0 || Number.isNaN(expectedUpdatedAt.getTime())) {
      return NextResponse.json(
        { error: "A valid product id and product version are required" },
        { status: 400 },
      );
    }

    const existing = await prisma.product.findFirst({
      where: { id, deleted: false },
      select: {
        id: true,
        name: true,
        basePrice: true,
        flashSaleEnabled: true,
        flashSalePrice: true,
        flashSaleStartsAt: true,
        flashSaleEndsAt: true,
        flashSaleSortOrder: true,
        updatedAt: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const changedAt = new Date();
    const result = await prisma.product.updateMany({
      where: { id, deleted: false, updatedAt: expectedUpdatedAt },
      data: {
        flashSaleEnabled: false,
        flashSalePrice: null,
        flashSaleStartsAt: null,
        flashSaleEndsAt: null,
        flashSaleSortOrder: 0,
        updatedAt: changedAt,
      },
    });
    if (result.count !== 1) {
      return NextResponse.json(
        { error: "This product changed in another session. Refresh and try again." },
        { status: 409 },
      );
    }

    const updated = {
      ...existing,
      flashSaleEnabled: false,
      flashSalePrice: null,
      flashSaleStartsAt: null,
      flashSaleEndsAt: null,
      flashSaleSortOrder: 0,
      updatedAt: changedAt,
    };
    await logActivity({
      action: "remove_flash_sale",
      entity: "product",
      entityId: id,
      access: allowed.access,
      request,
      before: snapshot(existing),
      after: snapshot(updated),
      metadata: { message: `Flash sale removed from ${existing.name}` },
    });
    revalidateStorefrontCatalog();
    return privateJson(snapshot(updated));
  } catch (error) {
    console.error("FLASH SALE DELETE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to remove the flash sale" },
      { status: 500 },
    );
  }
}
