import { prisma } from "@/lib/prisma";
import { requireProductManager } from "@/lib/product-management-access";
import { NextResponse } from "next/server";

/* =========================
   DELETE ATTRIBUTE VALUE
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

    const existing = await prisma.attributeValue.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await prisma.attributeValue.delete({ where: { id } });
    return NextResponse.json({ message: "Deleted successfully" });
  } catch (error) {
    console.error("DELETE ATTRIBUTE VALUE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to delete attribute value" },
      { status: 500 },
    );
  }
}

