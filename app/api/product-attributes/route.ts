import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import { revalidateStorefrontCatalog } from "@/lib/storefront-catalog-cache";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

async function authorizeProductManager() {
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
  return null;
}

/* =========================
   GET PRODUCT ATTRIBUTES
   Required query: ?productId=1
========================= */
export async function GET(req: Request) {
  try {
    const denied = await authorizeProductManager();
    if (denied) return denied;

    const url = new URL(req.url);
    const productIdParam = url.searchParams.get("productId");
    const productId = productIdParam ? Number(productIdParam) : null;

    if (!productId || Number.isNaN(productId)) {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400 },
      );
    }

    const attrs = await prisma.productAttribute.findMany({
      where: { productId },
      orderBy: { id: "desc" },
      include: {
        attribute: true,
      },
    });

    return NextResponse.json(attrs);
  } catch (error) {
    console.error("GET PRODUCT ATTRIBUTES ERROR:", error);
    return NextResponse.json(
      { error: "Failed to fetch product attributes" },
      { status: 500 },
    );
  }
}

/* =========================
   CREATE PRODUCT ATTRIBUTE
========================= */
export async function POST(req: Request) {
  try {
    const denied = await authorizeProductManager();
    if (denied) return denied;

    const body = await req.json();

    const productId = Number(body.productId);
    const attributeId = Number(body.attributeId);
    const value = String(body.value || "").trim();

    if (!productId || Number.isNaN(productId)) {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400 },
      );
    }

    if (!attributeId || Number.isNaN(attributeId)) {
      return NextResponse.json(
        { error: "attributeId is required" },
        { status: 400 },
      );
    }

    if (!value || value.length > 500) {
      return NextResponse.json(
        { error: "Value must be between 1 and 500 characters" },
        { status: 400 },
      );
    }

    const [product, attribute, existing] = await Promise.all([
      prisma.product.findFirst({
        where: { id: productId, deleted: false },
        select: { id: true },
      }),
      prisma.attribute.findUnique({
        where: { id: attributeId },
        select: { id: true },
      }),
      prisma.productAttribute.findFirst({
        where: { productId, attributeId },
        orderBy: { id: "desc" },
        select: { id: true },
      }),
    ]);
    if (!product || !attribute) {
      return NextResponse.json(
        { error: "Product or attribute not found" },
        { status: 404 },
      );
    }

    const created = existing
      ? await prisma.productAttribute.update({
          where: { id: existing.id },
          data: { value },
          include: { attribute: true },
        })
      : await prisma.productAttribute.create({
          data: { productId, attributeId, value },
          include: { attribute: true },
        });

    revalidateStorefrontCatalog();

    return NextResponse.json(created, { status: existing ? 200 : 201 });
  } catch (error) {
    console.error("POST PRODUCT ATTRIBUTE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to create product attribute" },
      { status: 500 },
    );
  }
}

