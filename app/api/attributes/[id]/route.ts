import { prisma } from "@/lib/prisma";
import { requireProductManager } from "@/lib/product-management-access";
import { revalidateStorefrontCatalog } from "@/lib/storefront-catalog-cache";
import { NextResponse } from "next/server";

/* =========================
   UPDATE ATTRIBUTE
========================= */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireProductManager();
    if (denied) return denied;

    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name || name.length > 100) {
      return NextResponse.json(
        { error: "Name must be between 1 and 100 characters" },
        { status: 400 },
      );
    }
    const duplicate = await prisma.attribute.findFirst({
      where: { name, id: { not: id } },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: "An attribute with this name already exists" },
        { status: 409 },
      );
    }

    const updated = await prisma.attribute.update({
      where: { id },
      data: { name },
    });

    revalidateStorefrontCatalog();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT ATTRIBUTE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to update attribute" },
      { status: 500 },
    );
  }
}

/* =========================
   DELETE ATTRIBUTE
========================= */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireProductManager();
    if (denied) return denied;

    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.productAttribute.deleteMany({ where: { attributeId: id } });
      await tx.attributeValue.deleteMany({ where: { attributeId: id } });
      await tx.attribute.delete({ where: { id } });
    });

    revalidateStorefrontCatalog();

    return NextResponse.json({ message: "Deleted successfully" });
  } catch (error) {
    console.error("DELETE ATTRIBUTE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to delete attribute" },
      { status: 500 },
    );
  }
}

