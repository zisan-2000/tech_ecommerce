// app/api/writers/[id]/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isStorefrontRequest, privateJson, publicJson } from "@/lib/public-cache";

type ParamsType = {
  params: Promise<{ id: string }>;
};

// GET single writer
export async function GET(req: Request, context: ParamsType) {
  const { id } = await context.params;

  try {
    const writer = await prisma.writer.findUnique({
      where: { id: Number(id) },
      select: {
        id: true,
        name: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { products: true },
        },
      },
    });

    if (!writer)
      return NextResponse.json({ error: "Writer not found" }, { status: 404 });

    return isStorefrontRequest(req)
      ? publicJson(writer, { maxAge: 300, staleWhileRevalidate: 1800 })
      : privateJson(writer);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch writer" },
      { status: 500 }
    );
  }
}

// UPDATE writer
export async function PUT(req: Request, context: ParamsType) {
  const { id } = await context.params;

  try {
    const body = await req.json();

    const writer = await prisma.writer.update({
      where: { id: Number(id) },
      data: {
        name: body.name,
        image: body.image ?? null,

        products: body.products
          ? {
              connect: body.products.map((p: any) => ({
                id: Number(p.id),
              })),
            }
          : undefined,
      },
      select: {
        id: true,
        name: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { products: true },
        },
      },
    });

    return NextResponse.json(writer);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update writer" },
      { status: 500 }
    );
  }
}

// DELETE writer (soft delete)
export async function DELETE(req: Request, context: ParamsType) {
  const { id } = await context.params;

  try {
    await prisma.writer.update({
      where: { id: Number(id) },
      data: { deleted: true }, // ✅ soft delete flag
    });

    return NextResponse.json({
      message: "Writer deleted successfully",
      softDeleted: true,
    });
  } catch (err) {
    console.error("Writer soft delete error:", err);
    return NextResponse.json(
      { error: "Failed to delete writer" },
      { status: 500 }
    );
  }
}
