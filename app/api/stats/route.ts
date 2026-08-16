import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicJson } from "@/lib/public-cache";

export async function GET() {
  try {
    // ✅ Total Books (only active + not deleted)
    const totalBooks = await prisma.product.count({
      where: {
        deleted: false,
        available: true,
        writer: { deleted: false },
        publisher: { deleted: false },
        category: { deleted: false }
      }
    });

    // ✅ Total Writers (only active)
    const totalWriters = await prisma.writer.count({
      where: { deleted: false }
    });

    // ✅ Total Delivered Orders
    const totalDelivered = await prisma.order.count({
      where: { status: "DELIVERED" }
    });

    return publicJson({
      totalBooks,
      totalWriters,
      totalDelivered,
    }, { maxAge: 300, staleWhileRevalidate: 1800 });
  } catch (error) {
    console.error("Stats API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
