import { prisma } from "@/lib/prisma";
import { requireProductManager } from "@/lib/product-management-access";
import { NextResponse } from "next/server";

/* =========================
   CREATE ATTRIBUTE VALUE
========================= */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = await requireProductManager();
    if (denied) return denied;

    const { id: idParam } = await params;
    const attributeId = Number(idParam);
    if (!attributeId || Number.isNaN(attributeId)) {
      return NextResponse.json(
        { error: "Invalid attribute id" },
        { status: 400 },
      );
    }

    const body = await req.json();
    const value = String(body.value || "").trim();
    if (!value || value.length > 200) {
      return NextResponse.json(
        { error: "Value must be between 1 and 200 characters" },
        { status: 400 },
      );
    }
    const [attribute, duplicate] = await Promise.all([
      prisma.attribute.findUnique({
        where: { id: attributeId },
        select: { id: true },
      }),
      prisma.attributeValue.findFirst({
        where: { attributeId, value },
        select: { id: true },
      }),
    ]);
    if (!attribute) {
      return NextResponse.json({ error: "Attribute not found" }, { status: 404 });
    }
    if (duplicate) {
      return NextResponse.json(
        { error: "This attribute value already exists" },
        { status: 409 },
      );
    }

    const created = await prisma.attributeValue.create({
      data: { attributeId, value },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("POST ATTRIBUTE VALUE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to create attribute value" },
      { status: 500 },
    );
  }
}

