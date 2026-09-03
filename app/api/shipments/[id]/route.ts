// app/api/shipments/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext, type AccessContext } from "@/lib/rbac";
import {
  buildDeliveryConfirmationUrl,
  ensureShipmentDeliveryConfirmation,
} from "@/lib/delivery-proof";
import { shipmentDeliveryAssignmentSummarySelect } from "@/lib/delivery-assignments";
import { appendShipmentStatusLog } from "@/lib/report-history";
import { canAccessWarehouseWithPermission } from "@/lib/warehouse-scope";
import { logActivity } from "@/lib/activity-log";
import { revalidateStorefrontCatalog } from "@/lib/storefront-catalog-cache";
import { OrderStatus } from "@/generated/prisma";
import { syncCommissionEntriesForOrderStatus } from "@/lib/business-network/commission";
import { canWarehouseFulfillOrder } from "@/lib/order-warehouse-stock";
import { transitionOrderStatusWithInventory } from "@/lib/order-inventory-lifecycle";

interface RouteParams {
  params: Promise<{ id: string }>;
}

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
    assignedToUserId: shipment.assignedToUserId ?? null,
    shippingRateId: shipment.shippingRateId ?? null,
    priority: shipment.priority ?? null,
  };
}

// GET /api/shipments/:id
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id as string;
    const access = await getAccessContext(
      session.user as { id?: string; role?: string } | undefined,
    );
    const canReadAll = hasShipmentManagementAccess(access) || access.has("orders.read_all");
    const canReadOwn = canReadAll || access.has("orders.read_own");
    if (!canReadOwn) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id: idStr } = await params;
    const id = Number(idStr);

    if (Number.isNaN(id)) {
      return NextResponse.json(
        { error: "Invalid shipment id" },
        { status: 400 }
      );
    }

    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: buildShipmentInclude(),
    });

    if (!shipment) {
      return NextResponse.json(
        { error: "Shipment not found" },
        { status: 404 }
      );
    }

    // normal user হলে: কেবল নিজের order এর shipment দেখতে পারবে
    if (!canReadAll && shipment.order.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (
      canReadAll &&
      !hasGlobalShipmentManagementAccess(access) &&
      !access.hasGlobal("orders.read_all")
    ) {
      const canReadShipment = canAccessShipmentWarehouse(access, shipment.warehouseId);
      const canReadOrder = canAccessWarehouseWithPermission(
        access,
        "orders.read_all",
        shipment.warehouseId,
      );
      if (!canReadShipment && !canReadOrder) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    return NextResponse.json(withDeliveryConfirmationMeta(shipment, canReadAll));
  } catch (error) {
    console.error("Error fetching shipment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/shipments/:id
// Body (optional, shipment update):
// {
//   courier?: string,
//   trackingNumber?: string | null,
//   status?: ShipmentStatus,
//   shippedAt?: string | null,
//   expectedDate?: string | null,
//   deliveredAt?: string | null,
//   deliveredLatitude?: number | null,
//   deliveredLongitude?: number | null,
//   deliveredAccuracy?: number | null,
//   estimatedCost?: string | number | null,
//   actualCost?: string | number | null,
//   thirdPartyCost?: string | number | null,
//   handlingCost?: string | number | null,
//   packagingCost?: string | number | null,
//   fuelCost?: string | number | null,
//   dispatchNote?: string | null,
//   priority?: number | null,
// }
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: idStr } = await params;
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

    const id = Number(idStr);
    if (Number.isNaN(id) || id <= 0) {
      return NextResponse.json(
        { error: "Invalid shipment id" },
        { status: 400 }
      );
    }

    // Check if shipment exists
    const existingShipment = await prisma.shipment.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        orderId: true,
        warehouseId: true,
        deliveryConfirmationToken: true,
        deliveryConfirmationPin: true,
        deliveryConfirmationRequestedAt: true,
      },
    });

    if (!existingShipment) {
      return NextResponse.json(
        { error: "Shipment not found" },
        { status: 404 }
      );
    }

    if (
      !hasGlobalShipmentManagementAccess(access) &&
      !canAccessShipmentWarehouse(access, existingShipment.warehouseId)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch (jsonError) {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const {
      courier,
      courierId,
      warehouseId,
      shippingRateId,
      assignedToUserId,
      assignedAt,
      trackingNumber,
      status,
      shippedAt,
      pickedAt,
      outForDeliveryAt,
      expectedDate,
      deliveredAt,
      deliveredLatitude,
      deliveredLongitude,
      deliveredAccuracy,
      estimatedCost,
      actualCost,
      thirdPartyCost,
      handlingCost,
      packagingCost,
      fuelCost,
      dispatchNote,
      priority,
    } = body;

    const data: any = {};
    const decimalFields = [
      ["estimatedCost", estimatedCost],
      ["actualCost", actualCost],
      ["thirdPartyCost", thirdPartyCost],
      ["handlingCost", handlingCost],
      ["packagingCost", packagingCost],
      ["fuelCost", fuelCost],
    ] as const;

    if (courier !== undefined) data.courier = courier;
    if (courierId !== undefined) {
      const courierIdNum = Number(courierId);
      if (Number.isNaN(courierIdNum) || courierIdNum <= 0) {
        return NextResponse.json({ error: "Invalid courierId" }, { status: 400 });
      }
      const courierEntity = await prisma.courier.findUnique({
        where: { id: courierIdNum },
      });
      if (!courierEntity || !courierEntity.isActive) {
        return NextResponse.json(
          { error: "Courier not found or inactive" },
          { status: 400 },
        );
      }
      data.courierId = courierEntity.id;
      data.courier = courierEntity.name;
    }
    if (warehouseId !== undefined) {
      if (warehouseId === null || warehouseId === "") {
        if (!hasGlobalShipmentManagementAccess(access)) {
          return NextResponse.json(
            { error: "Warehouse-scoped users must keep a warehouse assigned." },
            { status: 400 },
          );
        }
        data.warehouseId = null;
      } else {
        const warehouseIdNum = Number(warehouseId);
        if (Number.isNaN(warehouseIdNum) || warehouseIdNum <= 0) {
          return NextResponse.json({ error: "Invalid warehouseId" }, { status: 400 });
        }
        const warehouseEntity = await prisma.warehouse.findUnique({
          where: { id: warehouseIdNum },
          select: { id: true },
        });
        if (!warehouseEntity) {
          return NextResponse.json({ error: "Warehouse not found" }, { status: 400 });
        }
        if (!canAccessShipmentWarehouse(access, warehouseEntity.id)) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        if (
          existingShipment.warehouseId !== warehouseEntity.id &&
          !(await canWarehouseFulfillOrder(
            prisma,
            existingShipment.orderId,
            warehouseEntity.id,
          ))
        ) {
          return NextResponse.json(
            {
              error:
                "Selected warehouse does not have enough stock for this order",
            },
            { status: 400 },
          );
        }
        data.warehouseId = warehouseEntity.id;
      }
    }
    if (trackingNumber !== undefined) data.trackingNumber = trackingNumber;
    if (dispatchNote !== undefined) {
      data.dispatchNote = dispatchNote === null ? null : String(dispatchNote);
    }
    if (assignedToUserId !== undefined) {
      if (assignedToUserId === null || assignedToUserId === "") {
        data.assignedToUserId = null;
      } else {
        const assignedUser = await prisma.user.findUnique({
          where: { id: String(assignedToUserId) },
          select: { id: true },
        });
        if (!assignedUser) {
          return NextResponse.json({ error: "Assigned user not found" }, { status: 400 });
        }
        data.assignedToUserId = assignedUser.id;
        if (assignedAt === undefined) {
          data.assignedAt = new Date();
        }
      }
    }
    if (assignedAt !== undefined) {
      data.assignedAt = assignedAt ? new Date(assignedAt) : null;
    }
    if (shippingRateId !== undefined) {
      if (shippingRateId === null || shippingRateId === "") {
        data.shippingRateId = null;
      } else {
        const shippingRateIdNum = Number(shippingRateId);
        if (Number.isNaN(shippingRateIdNum) || shippingRateIdNum <= 0) {
          return NextResponse.json({ error: "Invalid shippingRateId" }, { status: 400 });
        }
        const shippingRateEntity = await prisma.shippingRate.findUnique({
          where: { id: shippingRateIdNum },
          select: { id: true },
        });
        if (!shippingRateEntity) {
          return NextResponse.json({ error: "Shipping rate not found" }, { status: 400 });
        }
        data.shippingRateId = shippingRateEntity.id;
      }
    }
    if (priority !== undefined) {
      const priorityNum = Number(priority);
      if (!Number.isInteger(priorityNum)) {
        return NextResponse.json({ error: "priority must be an integer" }, { status: 400 });
      }
      data.priority = priorityNum;
    }

    for (const [field, value] of decimalFields) {
      if (value === undefined) continue;
      if (value === null || value === "") {
        data[field] = null;
        continue;
      }
      const amountNum = Number(value);
      if (!Number.isFinite(amountNum)) {
        return NextResponse.json({ error: `${field} must be a valid number` }, { status: 400 });
      }
      data[field] = amountNum;
    }

    if (status !== undefined) {
      const validShipmentStatuses = [
        "PENDING",
        "ASSIGNED",
        "IN_TRANSIT",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "FAILED",
        "RETURNED",
        "CANCELLED",
      ] as const;

      if (!validShipmentStatuses.includes(status)) {
        return NextResponse.json(
          { error: "Invalid shipment status" },
          { status: 400 }
        );
      }

      const allowedTransitions: Record<string, string[]> = {
        PENDING: ["ASSIGNED", "CANCELLED"],
        ASSIGNED: ["IN_TRANSIT", "OUT_FOR_DELIVERY", "FAILED", "CANCELLED"],
        IN_TRANSIT: ["OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "RETURNED", "CANCELLED"],
        OUT_FOR_DELIVERY: ["DELIVERED", "FAILED", "RETURNED", "CANCELLED"],
        DELIVERED: ["RETURNED"],
        FAILED: ["ASSIGNED", "CANCELLED"],
        RETURNED: [],
        CANCELLED: [],
      };

      if (
        status !== existingShipment.status &&
        !(allowedTransitions[existingShipment.status] || []).includes(status)
      ) {
        return NextResponse.json(
          {
            error: `Invalid status transition: ${existingShipment.status} -> ${status}`,
          },
          { status: 400 },
        );
      }
      data.status = status;
    }

    if (shippedAt !== undefined) {
      data.shippedAt = shippedAt ? new Date(shippedAt) : null;
    }
    if (pickedAt !== undefined) {
      data.pickedAt = pickedAt ? new Date(pickedAt) : null;
    }
    if (outForDeliveryAt !== undefined) {
      data.outForDeliveryAt = outForDeliveryAt ? new Date(outForDeliveryAt) : null;
    }
    if (expectedDate !== undefined) {
      data.expectedDate = expectedDate ? new Date(expectedDate) : null;
    }
    if (deliveredAt !== undefined) {
      data.deliveredAt = deliveredAt ? new Date(deliveredAt) : null;
    }
    if (deliveredLatitude !== undefined) {
      data.deliveredLatitude = deliveredLatitude === null ? null : Number(deliveredLatitude);
    }
    if (deliveredLongitude !== undefined) {
      data.deliveredLongitude = deliveredLongitude === null ? null : Number(deliveredLongitude);
    }
    if (deliveredAccuracy !== undefined) {
      data.deliveredAccuracy = deliveredAccuracy === null ? null : Number(deliveredAccuracy);
    }
    if (data.status === "ASSIGNED" && data.assignedAt === undefined) {
      data.assignedAt = new Date();
    }
    if (data.status === "IN_TRANSIT" && data.pickedAt === undefined) {
      data.pickedAt = new Date();
    }
    if (data.status === "OUT_FOR_DELIVERY" && data.outForDeliveryAt === undefined) {
      data.outForDeliveryAt = new Date();
    }
    if (data.status === "DELIVERED" && data.deliveredAt === undefined) {
      data.deliveredAt = new Date();
    }

    const updated = await prisma.$transaction(async (tx) => {
      const nextStatus = data.status as string | undefined;
      const prevStatus = existingShipment.status as string;

      if (nextStatus && nextStatus !== prevStatus) {
        const nextOrderStatus: OrderStatus | null =
          nextStatus === "DELIVERED"
            ? OrderStatus.DELIVERED
            : nextStatus === "RETURNED"
              ? OrderStatus.RETURNED
              : nextStatus === "FAILED"
                ? OrderStatus.FAILED
                : nextStatus === "CANCELLED"
                  ? OrderStatus.CANCELLED
                  : null;

        if (nextOrderStatus) {
          const transition = await transitionOrderStatusWithInventory({
            tx,
            orderId: existingShipment.orderId,
            nextStatus: nextOrderStatus,
            reason: `Order #${existingShipment.orderId} ${nextOrderStatus.toLowerCase()} inventory restoration from shipment #${id}`,
            // A failed delivery can be reassigned; stock returns only after
            // cancellation or a confirmed return to the warehouse.
            restoreInventory: nextOrderStatus !== OrderStatus.FAILED,
          });
          if (transition.changed) {
            await syncCommissionEntriesForOrderStatus({
              tx,
              orderId: existingShipment.orderId,
              orderStatus: nextOrderStatus,
              actorUserId: access.userId,
              request,
            });
          }
        }
      }

      const updatedShipment = await tx.shipment.update({
        where: { id },
        data,
      });

      if (nextStatus && nextStatus !== prevStatus) {
        await appendShipmentStatusLog(tx, {
          shipmentId: updatedShipment.id,
          fromStatus: existingShipment.status,
          toStatus: updatedShipment.status,
          source: "ADMIN_UPDATE",
        });
      }

      await ensureShipmentDeliveryConfirmation(tx, updatedShipment.id);

      return tx.shipment.findUnique({
        where: { id: updatedShipment.id },
        include: buildShipmentInclude(),
      });
    });

    revalidateStorefrontCatalog();

    await logActivity({
      action: "update_shipment",
      entity: "shipment",
      entityId: id,
      access,
      request,
      metadata: {
        message:
          data.status && data.status !== existingShipment.status
            ? `Shipment #${id} status changed from ${existingShipment.status} to ${data.status}`
            : `Shipment #${id} updated`,
      },
      before: toShipmentLogSnapshot(existingShipment),
      after: updated ? toShipmentLogSnapshot(updated as any) : null,
    });

    return NextResponse.json(withDeliveryConfirmationMeta(updated as any, true));
  } catch (error) {
    console.error("Error updating shipment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/shipments/:id
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: idStr } = await params;
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

    const id = Number(idStr);
    if (Number.isNaN(id) || id <= 0) {
      return NextResponse.json(
        { error: "Invalid shipment id" },
        { status: 400 }
      );
    }

    // Check if shipment exists
    const existingShipment = await prisma.shipment.findUnique({
      where: { id },
    });

    if (!existingShipment) {
      return NextResponse.json(
        { error: "Shipment not found" },
        { status: 404 }
      );
    }

    if (
      !hasGlobalShipmentManagementAccess(access) &&
      !canAccessShipmentWarehouse(access, existingShipment.warehouseId)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.shipment.delete({
      where: { id },
    });

    await logActivity({
      action: "delete_shipment",
      entity: "shipment",
      entityId: id,
      access,
      request: req,
      metadata: {
        message: `Shipment #${id} deleted`,
      },
      before: toShipmentLogSnapshot(existingShipment),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting shipment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
