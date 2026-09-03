import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import type { ShipmentStatus } from "@/generated/prisma";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCourierProvider } from "@/lib/couriers";
import { getAccessContext, type AccessContext } from "@/lib/rbac";
import {
  buildDeliveryConfirmationUrl,
  ensureShipmentDeliveryConfirmation,
} from "@/lib/delivery-proof";
import { shipmentDeliveryAssignmentSummarySelect } from "@/lib/delivery-assignments";
import { appendShipmentStatusLog } from "@/lib/report-history";
import { canAccessWarehouseWithPermission, resolveWarehouseScope } from "@/lib/warehouse-scope";
import { logActivity } from "@/lib/activity-log";
import { canWarehouseFulfillOrder } from "@/lib/order-warehouse-stock";

function hasShipmentManagementAccess(access: AccessContext) {
  return access.has("shipments.manage") || access.has("logistics.manage");
}

function hasGlobalShipmentManagementAccess(access: AccessContext) {
  return access.hasGlobal("shipments.manage") || access.hasGlobal("logistics.manage");
}

function canAccessShipmentWarehouse(
  access: AccessContext,
  warehouseId: number | null | undefined,
) {
  return (
    canAccessWarehouseWithPermission(access, "shipments.manage", warehouseId) ||
    canAccessWarehouseWithPermission(access, "logistics.manage", warehouseId)
  );
}

type CreateShipmentBody = {
  orderId: number;
  courierId?: number;
  courier?: string;
  warehouseId?: number | null;
  note?: string | null;
};

function buildShipmentInclude() {
  return {
    courierRef: {
      select: { id: true, name: true, type: true, isActive: true },
    },
    warehouse: {
      select: {
        id: true,
        name: true,
        code: true,
        latitude: true,
        longitude: true,
        mapLabel: true,
        isMapEnabled: true,
      },
    },
    assignedTo: {
      select: {
        id: true,
        name: true,
        email: true,
      },
    },
    shippingRate: {
      select: {
        id: true,
        area: true,
        district: true,
        baseCost: true,
      },
    },
    order: {
      select: {
        id: true,
        userId: true,
        name: true,
        phone_number: true,
        status: true,
        paymentStatus: true,
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
        userId: true,
      },
    },
    deliveryAssignments: {
      where: {
        isCurrent: true,
      },
      orderBy: {
        assignedAt: "desc",
      },
      take: 1,
      select: shipmentDeliveryAssignmentSummarySelect,
    },
  } as const;
}

function withDeliveryConfirmationMeta<T extends {
  deliveryConfirmationToken?: string | null;
  deliveryConfirmationPin?: string | null;
}>(shipment: T, canReadAll: boolean) {
  const confirmationUrl = shipment.deliveryConfirmationToken
    ? buildDeliveryConfirmationUrl(shipment.deliveryConfirmationToken)
    : null;

  return {
    ...shipment,
    deliveryConfirmationUrl: confirmationUrl,
    deliveryConfirmationPin: canReadAll ? shipment.deliveryConfirmationPin ?? null : undefined,
  };
}

function toShipmentLogSnapshot(shipment: Record<string, any>) {
  return {
    orderId: shipment.orderId ?? null,
    warehouseId: shipment.warehouseId ?? null,
    courier: shipment.courier ?? null,
    courierId: shipment.courierId ?? null,
    status: shipment.status ?? null,
    trackingNumber: shipment.trackingNumber ?? null,
    courierStatus: shipment.courierStatus ?? null,
  };
}

// GET /api/shipments
// - admin: all shipments (pagination + optional filters)
// - user: only his own order shipments
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as { id?: string }).id;
    const access = await getAccessContext(
      session.user as { id?: string; role?: string } | undefined,
    );
    const canReadAll = hasShipmentManagementAccess(access) || access.has("orders.read_all");
    const canReadOwn = canReadAll || access.has("orders.read_own");
    if (!canReadOwn) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!canReadAll && !access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get("page") || "1");
    const limit = Number(searchParams.get("limit") || "10");
    const status = searchParams.get("status");
    const orderId = searchParams.get("orderId");
    const courierId = searchParams.get("courierId");

    const where: Record<string, unknown> = {};
    if (!canReadAll) {
      where.order = { userId: access.userId ?? userId };
    } else if (!hasGlobalShipmentManagementAccess(access) && !access.hasGlobal("orders.read_all")) {
      const warehouseScope = resolveWarehouseScope(
        access,
        hasShipmentManagementAccess(access)
          ? (access.has("shipments.manage") ? "shipments.manage" : "logistics.manage")
          : "orders.read_all",
      );
      if (warehouseScope.mode === "none") {
        return NextResponse.json({
          shipments: [],
          pagination: {
            page,
            limit: Math.max(limit, 1),
            total: 0,
            pages: 0,
          },
        });
      }

      if (warehouseScope.mode === "assigned") {
        where.warehouseId = { in: warehouseScope.warehouseIds };
      }
    }
    if (status) where.status = status;
    if (orderId && !Number.isNaN(Number(orderId))) where.orderId = Number(orderId);
    if (courierId && !Number.isNaN(Number(courierId))) where.courierId = Number(courierId);

    const skip = Math.max(page - 1, 0) * Math.max(limit, 1);
    const take = Math.max(limit, 1);

    const [shipments, total] = await Promise.all([
      prisma.shipment.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: buildShipmentInclude(),
      }),
      prisma.shipment.count({ where }),
    ]);

    return NextResponse.json({
      shipments: shipments.map((shipment) =>
        withDeliveryConfirmationMeta(shipment, canReadAll),
      ),
      pagination: {
        page,
        limit: take,
        total,
        pages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    console.error("Error fetching shipments:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/shipments
// Creates shipment and sends create request to selected courier.
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasShipmentManagementAccess(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as CreateShipmentBody;
    const orderId = Number(body.orderId);
    const courierId = body.courierId ? Number(body.courierId) : null;
    const courierName = body.courier?.trim();
    const warehouseId =
      body.warehouseId === null || body.warehouseId === undefined
        ? null
        : Number(body.warehouseId);

    if (
      !orderId ||
      Number.isNaN(orderId) ||
      ((!courierId || Number.isNaN(courierId)) && !courierName)
    ) {
      return NextResponse.json(
        { error: "orderId and (courierId or courier name) are required" },
        { status: 400 },
      );
    }
    if (warehouseId !== null && Number.isNaN(warehouseId)) {
      return NextResponse.json({ error: "Invalid warehouseId" }, { status: 400 });
    }

    if (!hasGlobalShipmentManagementAccess(access)) {
      if (!warehouseId || Number.isNaN(warehouseId)) {
        return NextResponse.json(
          { error: "warehouseId is required for warehouse-scoped shipment creation" },
          { status: 400 },
        );
      }
      if (!canAccessShipmentWarehouse(access, warehouseId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const [order, existingShipment] = await Promise.all([
      prisma.order.findUnique({
        where: { id: orderId },
        include: {
          orderItems: {
            include: {
              product: {
                select: { name: true },
              },
            },
          },
        },
      }),
      prisma.shipment.findUnique({ where: { orderId } }),
    ]);

    const courier = await prisma.courier.findFirst({
      where: courierId
        ? { id: courierId }
        : {
            name: {
              equals: courierName,
              mode: "insensitive",
            },
          },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (!courier || !courier.isActive) {
      return NextResponse.json({ error: "Courier not found or inactive" }, { status: 400 });
    }
    if (existingShipment) {
      return NextResponse.json(
        { error: "This order already has a shipment" },
        { status: 409 },
      );
    }
    if (
      warehouseId !== null &&
      !(await canWarehouseFulfillOrder(prisma, orderId, warehouseId))
    ) {
      return NextResponse.json(
        { error: "Selected warehouse does not have enough stock for this order" },
        { status: 400 },
      );
    }

    // 1) Create local shipment first.
    const localShipment = await prisma.shipment.create({
      data: {
        orderId,
        warehouseId,
        courier: courier.name,
        courierId: courier.id,
        status: "PENDING",
      },
    });

    await appendShipmentStatusLog(prisma, {
      shipmentId: localShipment.id,
      fromStatus: null,
      toStatus: "PENDING",
      source: "SHIPMENT_CREATE",
      createdAt: localShipment.createdAt,
    });

    if (courier.type === "CUSTOM") {
      let customShipment = await prisma.shipment.update({
        where: { id: localShipment.id },
        data: {
          courierStatus: "LOCAL_CREATED",
          lastSyncedAt: new Date(),
        },
        include: {
          courierRef: { select: { id: true, name: true, type: true } },
        },
      });

      customShipment =
        (await prisma.shipment.findUnique({
          where: { id: customShipment.id },
          include: buildShipmentInclude(),
        })) || customShipment;

      await logActivity({
        action: "create_shipment",
        entity: "shipment",
        entityId: customShipment.id,
        access,
        request,
        metadata: {
          message: `Shipment #${customShipment.id} created for order #${order.id}`,
        },
        after: toShipmentLogSnapshot(customShipment as any),
      });

      return NextResponse.json(
        withDeliveryConfirmationMeta(customShipment as any, true),
        { status: 201 },
      );
    }

    // 2) Hit courier API based on courier.type.
    try {
      const provider = getCourierProvider(courier);
      const remote = await provider.createShipment(courier, {
        shipmentId: localShipment.id,
        orderId: order.id,
        orderAmount: Number(order.grand_total),
        cashOnDelivery: order.paymentStatus !== "PAID",
        recipient: {
          name: order.name,
          phone: order.phone_number,
          address: order.address_details,
          area: order.area,
          district: order.district,
          country: order.country,
        },
        items: order.orderItems.map((item) => ({
          name: item.product?.name || `Item-${item.id}`,
          quantity: item.quantity,
          unitPrice: Number(item.price),
        })),
        note: body.note ?? null,
      });

      const updated = await prisma.$transaction(async (tx) => {
        const nextShipment = await tx.shipment.update({
          where: { id: localShipment.id },
          data: {
            externalId: remote.externalId || null,
            trackingNumber: remote.trackingNumber || null,
            trackingUrl: remote.trackingUrl || null,
            courierStatus: remote.courierStatus || "created",
            status: (remote.status || "PENDING") as ShipmentStatus,
            lastSyncedAt: new Date(),
            shippedAt: new Date(),
          },
        });

        await appendShipmentStatusLog(tx, {
          shipmentId: nextShipment.id,
          fromStatus: localShipment.status,
          toStatus: nextShipment.status,
          source: "COURIER_CREATE",
        });

        await ensureShipmentDeliveryConfirmation(tx, nextShipment.id);

        return tx.shipment.findUnique({
          where: { id: nextShipment.id },
          include: buildShipmentInclude(),
        });
      });

      await logActivity({
        action: "create_shipment",
        entity: "shipment",
        entityId: updated?.id ?? localShipment.id,
        access,
        request,
        metadata: {
          message: `Shipment #${updated?.id ?? localShipment.id} created for order #${order.id}`,
        },
        before: toShipmentLogSnapshot(localShipment),
        after: updated ? toShipmentLogSnapshot(updated as any) : null,
      });

      return NextResponse.json(
        withDeliveryConfirmationMeta(updated as any, true),
        { status: 201 },
      );
    } catch (providerError) {
      console.error("Courier create shipment failed:", providerError);
      const failed = await prisma.shipment.update({
        where: { id: localShipment.id },
        data: {
          courierStatus: "CREATE_FAILED",
          lastSyncedAt: new Date(),
        },
      });

      return NextResponse.json(
        {
          error: "Courier API create failed",
          shipment: failed,
          details: providerError instanceof Error ? providerError.message : "Unknown error",
        },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error("Error creating shipment:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
