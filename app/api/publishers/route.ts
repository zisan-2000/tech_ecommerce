//api/publishers

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isStorefrontRequest, privateJson, publicJson } from "@/lib/public-cache";

export async function GET(req: Request) {
  try {
    const publishers = await prisma.publisher.findMany({
      where: { deleted: false },
      orderBy: { id: "desc" },
      select: {
        id: true,
        name: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            products: {
              where: {
                deleted: false,
                available: true,
                publisher: { deleted: false },
                writer: { deleted: false },
                category: { deleted: false },
              },
            },
          },
        },
      },
    });

    const formatted = publishers.map((p: any) => ({
      ...p,
      productCount: p._count.products,
    }));

    return isStorefrontRequest(req)
      ? publicJson(formatted, { maxAge: 300, staleWhileRevalidate: 1800 })
      : privateJson(formatted);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load publishers" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const publisher = await prisma.publisher.create({
      data: {
        name: body.name,
        image: body.image ?? null,
        deleted: false,
      },
    });

    return NextResponse.json(publisher);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to create publisher" },
      { status: 500 }
    );
  }
}
