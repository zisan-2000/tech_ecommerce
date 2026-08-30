import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidateStorefrontCatalog } from "@/lib/storefront-catalog-cache";
import { isDeliveryConfirmationStatus } from "@/lib/delivery-proof";
import { appendShipmentStatusLog } from "@/lib/report-history";
import { OrderStatus } from "@/generated/prisma";
import { syncCommissionEntriesForOrderStatus } from "@/lib/business-network/commission";

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || null;
  }

  return request.headers.get("x-real-ip");
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const shipment = await prisma.shipment.findUnique({
      where: { deliveryConfirmationToken: token },
      include: {
        order: {
          select: {
            id: true,
            name: true,
            status: true,
            paymentStatus: true,
            createdAt: true,
          },
        },
        deliveryProof: {
          select: {
            id: true,
            tickReceived: true,
            tickCorrectItems: true,
            tickGoodCondition: true,
            photoUrl: true,
            note: true,
            confirmedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!shipment) {
      return NextResponse.json({ error: "Confirmation link not found" }, { status: 404 });
    }

    return NextResponse.json({
      shipment: {
        id: shipment.id,
        orderId: shipment.orderId,
        courier: shipment.courier,
        trackingNumber: shipment.trackingNumber,
        status: shipment.status,
        expectedDate: shipment.expectedDate,
        deliveredAt: shipment.deliveredAt,
        confirmationReady: isDeliveryConfirmationStatus(shipment.status),
      },
      order: shipment.order,
      proof: shipment.deliveryProof,
    });
  } catch (error) {
    console.error("Error loading delivery confirmation:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
    const body = await request.json().catch(() => null);

    const pin = String(body?.pin || "").trim();
    const note = typeof body?.note === "string" ? body.note.trim() : "";
    const photoUrl =
      typeof body?.photoUrl === "string" && body.photoUrl.trim()
        ? body.photoUrl.trim()
        : null;

    const tickReceived = body?.tickReceived === true;
    const tickCorrectItems = body?.tickCorrectItems === true;
    const tickGoodCondition = body?.tickGoodCondition === true;

    if (!tickReceived || !tickCorrectItems || !tickGoodCondition) {
      return NextResponse.json(
        { error: "All delivery confirmation checks are required" },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { deliveryConfirmationToken: token },
        include: {
          order: {
            select: {
              id: true,
              userId: true,
              status: true,
            },
          },
          deliveryProof: true,
        },
      });

      if (!shipment) {
        return { error: "Confirmation link not found", status: 404 as const };
      }

      if (!isDeliveryConfirmationStatus(shipment.status)) {
        return { error: "Delivery confirmation is not available yet", status: 400 as const };
      }

      if (!shipment.deliveryConfirmationPin || pin !== shipment.deliveryConfirmationPin) {
        return { error: "Invalid delivery PIN", status: 400 as const };
      }

      if (shipment.deliveryProof) {
        return { proof: shipment.deliveryProof, shipment, duplicate: true as const };
      }

      const proof = await tx.deliveryProof.create({
        data: {
          orderId: shipment.orderId,
          shipmentId: shipment.id,
          userId: userId || shipment.order.userId || null,
          tickReceived,
          tickCorrectItems,
          tickGoodCondition,
          photoUrl,
          note: note || null,
          ipAddress: getClientIp(request),
          userAgent: request.headers.get("user-agent"),
        },
      });

      if (shipment.status !== "DELIVERED") {
        const items = await tx.orderItem.findMany({
          where: { orderId: shipment.orderId },
          select: { productId: true, quantity: true },
        });

        const qtyByProduct = new Map<number, number>();
        for (const item of items) {
          qtyByProduct.set(
            item.productId,
            (qtyByProduct.get(item.productId) || 0) + item.quantity,
          );
        }

        for (const [productId, qty] of qtyByProduct.entries()) {
          const product = await tx.product.findUnique({
            where: { id: productId },
            select: { soldCount: true },
          });

          await tx.product.update({
            where: { id: productId },
            data: {
              soldCount: Math.max((product?.soldCount ?? 0) + qty, 0),
            },
          });
        }

        await tx.shipment.update({
          where: { id: shipment.id },
          data: {
            status: "DELIVERED",
            deliveredAt: shipment.deliveredAt || new Date(),
          },
        });

        await appendShipmentStatusLog(tx, {
          shipmentId: shipment.id,
          fromStatus: shipment.status,
          toStatus: "DELIVERED",
          source: "DELIVERY_PROOF",
        });
      }

      if (shipment.order.status !== "DELIVERED") {
        await tx.order.update({
          where: { id: shipment.orderId },
          data: { status: "DELIVERED" },
        });
        await syncCommissionEntriesForOrderStatus({
          tx,
          orderId: shipment.orderId,
          orderStatus: OrderStatus.DELIVERED,
          actorUserId: userId,
          request,
        });
      }

      const refreshedShipment = await tx.shipment.findUnique({
        where: { id: shipment.id },
        select: {
          id: true,
          orderId: true,
          status: true,
          deliveredAt: true,
        },
      });

      return { proof, shipment: refreshedShipment, duplicate: false as const };
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    revalidateStorefrontCatalog();

    return NextResponse.json(
      {
        proof: result.proof,
        shipment: result.shipment,
        duplicate: result.duplicate,
      },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    console.error("Error submitting delivery proof:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
