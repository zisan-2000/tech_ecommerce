import type { Prisma, PrismaClient } from "@/generated/prisma";
import {
  DeliveryAssignmentStatus,
  PickupProofStatus,
} from "@/generated/prisma";
import type { OrderStatus, ShipmentStatus } from "@/generated/prisma";
import type { AccessContext } from "@/lib/rbac";
import { appendShipmentStatusLog } from "@/lib/report-history";
import { canAccessWarehouseWithPermission } from "@/lib/warehouse-scope";
import { syncCommissionEntriesForOrderStatus } from "@/lib/business-network/commission";
import { transitionOrderStatusWithInventory } from "@/lib/order-inventory-lifecycle";

export const DELIVERY_ASSIGNMENT_MANAGE_PERMISSIONS = [
  "delivery-men.manage",
  "logistics.manage",
  "shipments.manage",
] as const;

export const DELIVERY_ASSIGNMENT_STATUS_LABELS: Record<
  DeliveryAssignmentStatus,
  string
> = {
  ASSIGNED: "Assigned",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  PICKUP_CONFIRMED: "Picked From Warehouse",
  IN_TRANSIT: "In Transit",
  OUT_FOR_DELIVERY: "Out For Delivery",
  DELIVERED: "Delivered",
  FAILED: "Failed",
  RETURNED: "Returned",
};

export const DELIVERY_ASSIGNMENT_TAB_GROUPS = [
  {
    key: "newlyAssigned",
    label: "Newly Assigned",
    statuses: [DeliveryAssignmentStatus.ASSIGNED],
  },
  {
    key: "accepted",
    label: "Accepted Deliveries",
    statuses: [DeliveryAssignmentStatus.ACCEPTED],
  },
  {
    key: "rejected",
    label: "Rejected Deliveries",
    statuses: [DeliveryAssignmentStatus.REJECTED],
  },
  {
    key: "pickedUp",
    label: "Picked Up",
    statuses: [DeliveryAssignmentStatus.PICKUP_CONFIRMED],
  },
  {
    key: "inTransit",
    label: "In Transit",
    statuses: [
      DeliveryAssignmentStatus.IN_TRANSIT,
      DeliveryAssignmentStatus.OUT_FOR_DELIVERY,
    ],
  },
  {
    key: "delivered",
    label: "Delivered",
    statuses: [DeliveryAssignmentStatus.DELIVERED],
  },
  {
    key: "exceptions",
    label: "Exceptions",
    statuses: [
      DeliveryAssignmentStatus.FAILED,
      DeliveryAssignmentStatus.RETURNED,
    ],
  },
] as const;

export const DELIVERY_ASSIGNMENT_SUMMARY_STATUSES = [
  DeliveryAssignmentStatus.ASSIGNED,
  DeliveryAssignmentStatus.ACCEPTED,
  DeliveryAssignmentStatus.REJECTED,
  DeliveryAssignmentStatus.PICKUP_CONFIRMED,
  DeliveryAssignmentStatus.IN_TRANSIT,
  DeliveryAssignmentStatus.DELIVERED,
] as const;

export const DELIVERY_ASSIGNMENT_TERMINAL_STATUSES = [
  DeliveryAssignmentStatus.REJECTED,
  DeliveryAssignmentStatus.DELIVERED,
  DeliveryAssignmentStatus.FAILED,
  DeliveryAssignmentStatus.RETURNED,
] as const;

const DELIVERY_ASSIGNMENT_ALLOWED_TRANSITIONS: Record<
  DeliveryAssignmentStatus,
  DeliveryAssignmentStatus[]
> = {
  ASSIGNED: [DeliveryAssignmentStatus.ACCEPTED, DeliveryAssignmentStatus.REJECTED],
  ACCEPTED: [DeliveryAssignmentStatus.PICKUP_CONFIRMED],
  REJECTED: [],
  PICKUP_CONFIRMED: [
    DeliveryAssignmentStatus.IN_TRANSIT,
    DeliveryAssignmentStatus.OUT_FOR_DELIVERY,
    DeliveryAssignmentStatus.DELIVERED,
    DeliveryAssignmentStatus.FAILED,
    DeliveryAssignmentStatus.RETURNED,
  ],
  IN_TRANSIT: [
    DeliveryAssignmentStatus.OUT_FOR_DELIVERY,
    DeliveryAssignmentStatus.DELIVERED,
    DeliveryAssignmentStatus.FAILED,
    DeliveryAssignmentStatus.RETURNED,
  ],
  OUT_FOR_DELIVERY: [
    DeliveryAssignmentStatus.DELIVERED,
    DeliveryAssignmentStatus.FAILED,
    DeliveryAssignmentStatus.RETURNED,
  ],
  DELIVERED: [],
  FAILED: [],
  RETURNED: [],
};

export const deliveryAssignmentDetailsInclude = {
  warehouse: {
    select: {
      id: true,
      name: true,
      code: true,
      area: true,
      district: true,
      address: true,
      locationNote: true,
    },
  },
  deliveryMan: {
    select: {
      id: true,
      userId: true,
      fullName: true,
      phone: true,
      warehouseId: true,
      status: true,
      employeeCode: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
    },
  },
  order: {
    select: {
      id: true,
      name: true,
      phone_number: true,
      alt_phone_number: true,
      area: true,
      district: true,
      country: true,
      address_details: true,
      grand_total: true,
      total: true,
      shipping_cost: true,
      status: true,
      paymentStatus: true,
      payment_method: true,
      order_date: true,
      orderItems: {
        select: {
          id: true,
          quantity: true,
          price: true,
          currency: true,
          product: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          variant: {
            select: {
              id: true,
              sku: true,
              options: true,
            },
          },
        },
      },
    },
  },
  shipment: {
    select: {
      id: true,
      warehouseId: true,
      courier: true,
      trackingNumber: true,
      trackingUrl: true,
      status: true,
      courierStatus: true,
      assignedAt: true,
      pickedAt: true,
      outForDeliveryAt: true,
      deliveredAt: true,
      dispatchNote: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  pickupProof: {
    select: {
      id: true,
      status: true,
      productReceived: true,
      packagingOk: true,
      productInGoodCondition: true,
      imageUrl: true,
      note: true,
      confirmedAt: true,
      createdAt: true,
      actor: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  logs: {
    orderBy: {
      createdAt: "asc" as const,
    },
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  },
} satisfies Prisma.DeliveryAssignmentInclude;

export const shipmentDeliveryAssignmentSummarySelect = {
  id: true,
  status: true,
  assignedAt: true,
  deliveredAt: true,
  deliveredLatitude: true,
  deliveredLongitude: true,
  deliveredAccuracy: true,
  deliveryMan: {
    select: {
      id: true,
      userId: true,
      fullName: true,
      phone: true,
      employeeCode: true,
    },
  },
  pickupProof: {
    select: {
      id: true,
      status: true,
      imageUrl: true,
      confirmedAt: true,
    },
  },
  logs: {
    orderBy: {
      createdAt: "desc" as const,
    },
    take: 3,
    include: {
      actor: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
} satisfies Prisma.DeliveryAssignmentSelect;

export type DeliveryAssignmentWithDetails = Prisma.DeliveryAssignmentGetPayload<{
  include: typeof deliveryAssignmentDetailsInclude;
}>;

type DeliveryAssignmentMutationClient = Prisma.TransactionClient;

export function hasDeliveryAssignmentManagementAccess(access: AccessContext) {
  return DELIVERY_ASSIGNMENT_MANAGE_PERMISSIONS.some((permission) =>
    access.has(permission),
  );
}

export function canManageDeliveryAssignmentWarehouse(
  access: AccessContext,
  warehouseId: number | null | undefined,
) {
  return DELIVERY_ASSIGNMENT_MANAGE_PERMISSIONS.some((permission) =>
    canAccessWarehouseWithPermission(access, permission, warehouseId),
  );
}

export function isTerminalDeliveryAssignmentStatus(
  status: DeliveryAssignmentStatus,
) {
  return DELIVERY_ASSIGNMENT_TERMINAL_STATUSES.some((value) => value === status);
}

export function getAllowedDeliveryAssignmentTransitions(
  status: DeliveryAssignmentStatus,
) {
  return DELIVERY_ASSIGNMENT_ALLOWED_TRANSITIONS[status] ?? [];
}

export function mapAssignmentStatusToShipmentStatus(
  status: DeliveryAssignmentStatus,
): ShipmentStatus {
  switch (status) {
    case DeliveryAssignmentStatus.ACCEPTED:
      return "ASSIGNED";
    case DeliveryAssignmentStatus.PICKUP_CONFIRMED:
    case DeliveryAssignmentStatus.IN_TRANSIT:
      return "IN_TRANSIT";
    case DeliveryAssignmentStatus.OUT_FOR_DELIVERY:
      return "OUT_FOR_DELIVERY";
    case DeliveryAssignmentStatus.DELIVERED:
      return "DELIVERED";
    case DeliveryAssignmentStatus.FAILED:
      return "FAILED";
    case DeliveryAssignmentStatus.RETURNED:
      return "RETURNED";
    case DeliveryAssignmentStatus.ASSIGNED:
    case DeliveryAssignmentStatus.REJECTED:
    default:
      return "PENDING";
  }
}

export function mapAssignmentStatusToOrderStatus(
  status: DeliveryAssignmentStatus,
): OrderStatus | null {
  switch (status) {
    case DeliveryAssignmentStatus.ACCEPTED:
      return "PROCESSING";
    case DeliveryAssignmentStatus.PICKUP_CONFIRMED:
    case DeliveryAssignmentStatus.IN_TRANSIT:
    case DeliveryAssignmentStatus.OUT_FOR_DELIVERY:
      return "SHIPPED";
    case DeliveryAssignmentStatus.DELIVERED:
      return "DELIVERED";
    case DeliveryAssignmentStatus.FAILED:
      return "FAILED";
    case DeliveryAssignmentStatus.RETURNED:
      return "RETURNED";
    case DeliveryAssignmentStatus.ASSIGNED:
    case DeliveryAssignmentStatus.REJECTED:
    default:
      return null;
  }
}

export function buildDeliveryAssignmentSummary(
  assignments: Array<{
    status: DeliveryAssignmentStatus;
  }>,
) {
  return {
    assigned: assignments.filter(
      (assignment) => assignment.status === DeliveryAssignmentStatus.ASSIGNED,
    ).length,
    accepted: assignments.filter(
      (assignment) => assignment.status === DeliveryAssignmentStatus.ACCEPTED,
    ).length,
    rejected: assignments.filter(
      (assignment) => assignment.status === DeliveryAssignmentStatus.REJECTED,
    ).length,
    pickedFromWarehouse: assignments.filter(
      (assignment) =>
        assignment.status === DeliveryAssignmentStatus.PICKUP_CONFIRMED,
    ).length,
    inTransit: assignments.filter(
      (assignment) =>
        assignment.status === DeliveryAssignmentStatus.IN_TRANSIT ||
        assignment.status === DeliveryAssignmentStatus.OUT_FOR_DELIVERY,
    ).length,
    delivered: assignments.filter(
      (assignment) => assignment.status === DeliveryAssignmentStatus.DELIVERED,
    ).length,
  };
}

export async function getDeliveryManProfileForUser(
  client: Pick<PrismaClient, "deliveryManProfile"> | Pick<Prisma.TransactionClient, "deliveryManProfile">,
  userId: string,
) {
  return client.deliveryManProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
      warehouseId: true,
      fullName: true,
      phone: true,
      status: true,
      employeeCode: true,
    },
  });
}

export async function resolveDeliveryAssignmentActor(
  client:
    | Pick<PrismaClient, "deliveryManProfile">
    | Pick<Prisma.TransactionClient, "deliveryManProfile">,
  access: AccessContext,
  assignment: {
    deliveryManProfileId: string;
    warehouseId: number;
  },
) {
  if (!access.userId) {
    return {
      authorized: false,
      deliveryManProfile: null,
      mode: "none" as const,
    };
  }

  if (hasDeliveryAssignmentManagementAccess(access)) {
    return {
      authorized: canManageDeliveryAssignmentWarehouse(
        access,
        assignment.warehouseId,
      ),
      deliveryManProfile: null,
      mode: "manager" as const,
    };
  }

  if (!access.has("delivery.dashboard.access")) {
    return {
      authorized: false,
      deliveryManProfile: null,
      mode: "none" as const,
    };
  }

  const deliveryManProfile = await getDeliveryManProfileForUser(
    client,
    access.userId,
  );

  return {
    authorized: deliveryManProfile?.id === assignment.deliveryManProfileId,
    deliveryManProfile,
    mode: "self" as const,
  };
}

async function syncShipmentAndOrderForAssignmentStatus(
  client: DeliveryAssignmentMutationClient,
  input: {
    shipment: {
      id: number;
      status: ShipmentStatus;
      warehouseId: number | null;
      assignedAt: Date | null;
      assignedToUserId: string | null;
      pickedAt: Date | null;
      outForDeliveryAt: Date | null;
      deliveredAt: Date | null;
      orderId: number;
    };
    order: {
      id: number;
      status: OrderStatus;
    };
    deliveryManUserId: string;
    warehouseId: number;
    nextAssignmentStatus: DeliveryAssignmentStatus;
    logNote?: string | null;
  },
) {
  const now = new Date();
  const nextShipmentStatus = mapAssignmentStatusToShipmentStatus(
    input.nextAssignmentStatus,
  );
  const nextOrderStatus = mapAssignmentStatusToOrderStatus(
    input.nextAssignmentStatus,
  );
  const shipmentData: Prisma.ShipmentUpdateInput = {
    status: nextShipmentStatus,
    warehouse:
      input.shipment.warehouseId === input.warehouseId
        ? undefined
        : {
            connect: {
              id: input.warehouseId,
            },
          },
  };

  if (input.nextAssignmentStatus === DeliveryAssignmentStatus.REJECTED) {
    shipmentData.assignedTo = {
      disconnect: true,
    };
    shipmentData.assignedAt = null;
  } else {
    shipmentData.assignedTo = {
      connect: {
        id: input.deliveryManUserId,
      },
    };

    if (!input.shipment.assignedAt) {
      shipmentData.assignedAt = now;
    }
  }

  if (
    (input.nextAssignmentStatus === DeliveryAssignmentStatus.PICKUP_CONFIRMED ||
      input.nextAssignmentStatus === DeliveryAssignmentStatus.IN_TRANSIT) &&
    !input.shipment.pickedAt
  ) {
    shipmentData.pickedAt = now;
  }

  if (
    input.nextAssignmentStatus === DeliveryAssignmentStatus.OUT_FOR_DELIVERY &&
    !input.shipment.outForDeliveryAt
  ) {
    shipmentData.outForDeliveryAt = now;
  }

  if (
    input.nextAssignmentStatus === DeliveryAssignmentStatus.DELIVERED &&
    !input.shipment.deliveredAt
  ) {
    shipmentData.deliveredAt = now;
  }

  if (nextOrderStatus) {
    const tx = client;
    const transition = await transitionOrderStatusWithInventory({
      tx,
      orderId: input.order.id,
      nextStatus: nextOrderStatus,
      reason: `Order #${input.order.id} ${nextOrderStatus.toLowerCase()} inventory restoration from delivery assignment`,
      // FAILED is a retryable delivery attempt. Physical stock has not yet
      // returned to the warehouse; RETURNED performs the restoration.
      restoreInventory: nextOrderStatus !== "FAILED",
    });
    if (transition.changed) {
      await syncCommissionEntriesForOrderStatus({
        tx,
        orderId: input.order.id,
        orderStatus: nextOrderStatus,
        actorUserId: input.deliveryManUserId,
      });
    }
  }

  const updatedShipment = await client.shipment.update({
    where: {
      id: input.shipment.id,
    },
    data: shipmentData,
    select: {
      id: true,
      status: true,
    },
  });

  await appendShipmentStatusLog(client, {
    shipmentId: input.shipment.id,
    fromStatus: input.shipment.status,
    toStatus: updatedShipment.status,
    source: "DELIVERY_ASSIGNMENT",
    note: input.logNote ?? null,
  });

}

async function completeGenericShipmentAssignment(
  client: DeliveryAssignmentMutationClient,
  input: {
    shipmentId: number;
    deliveryManUserId: string;
  },
) {
  await client.shipmentAssignment.updateMany({
    where: {
      shipmentId: input.shipmentId,
      assignedToId: input.deliveryManUserId,
      completedAt: null,
      role: "delivery_man",
    },
    data: {
      completedAt: new Date(),
    },
  });
}

export async function createDeliveryAssignments(
  client: DeliveryAssignmentMutationClient,
  input: {
    shipmentIds: number[];
    deliveryManProfileId: string;
    assignedById?: string | null;
    note?: string | null;
  },
) {
  const deliveryMan = await client.deliveryManProfile.findUnique({
    where: {
      id: input.deliveryManProfileId,
    },
    select: {
      id: true,
      userId: true,
      fullName: true,
      phone: true,
      warehouseId: true,
      status: true,
    },
  });

  if (!deliveryMan) {
    throw new Error("Delivery man not found.");
  }

  if (deliveryMan.status !== "ACTIVE") {
    throw new Error("Only active delivery men can receive assignments.");
  }

  const uniqueShipmentIds = [...new Set(input.shipmentIds)];
  if (uniqueShipmentIds.length === 0) {
    throw new Error("At least one shipment must be selected.");
  }

  const shipments = await client.shipment.findMany({
    where: {
      id: {
        in: uniqueShipmentIds,
      },
    },
    select: {
      id: true,
      orderId: true,
      warehouseId: true,
      status: true,
      assignedAt: true,
      assignedToUserId: true,
      pickedAt: true,
      outForDeliveryAt: true,
      deliveredAt: true,
      order: {
        select: {
          id: true,
          status: true,
        },
      },
      deliveryAssignments: {
        where: {
          isCurrent: true,
        },
        orderBy: {
          assignedAt: "desc",
        },
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (shipments.length !== uniqueShipmentIds.length) {
    throw new Error("One or more shipments could not be found.");
  }

  const createdAssignments: DeliveryAssignmentWithDetails[] = [];

  for (const shipment of shipments) {
    if (
      shipment.status === "DELIVERED" ||
      shipment.status === "RETURNED" ||
      shipment.status === "CANCELLED"
    ) {
      throw new Error(
        `Shipment #${shipment.id} is already ${shipment.status.toLowerCase()} and cannot be reassigned.`,
      );
    }

    if (
      shipment.warehouseId !== null &&
      shipment.warehouseId !== deliveryMan.warehouseId
    ) {
      throw new Error(
        `Shipment #${shipment.id} belongs to another warehouse and cannot be assigned to ${deliveryMan.fullName}.`,
      );
    }

    const currentAssignment = shipment.deliveryAssignments[0];
    if (
      currentAssignment &&
      !isTerminalDeliveryAssignmentStatus(currentAssignment.status)
    ) {
      throw new Error(
        `Shipment #${shipment.id} already has an active delivery assignment.`,
      );
    }

    if (currentAssignment) {
      await client.deliveryAssignment.update({
        where: {
          id: currentAssignment.id,
        },
        data: {
          isCurrent: false,
        },
      });
    }

    const assignment = await client.deliveryAssignment.create({
      data: {
        orderId: shipment.orderId,
        shipmentId: shipment.id,
        deliveryManProfileId: deliveryMan.id,
        warehouseId: shipment.warehouseId ?? deliveryMan.warehouseId,
        assignedById: input.assignedById ?? null,
        note: input.note ?? null,
        latestNote: input.note ?? null,
        status: DeliveryAssignmentStatus.ASSIGNED,
        pickupProofStatus: PickupProofStatus.PENDING,
        isCurrent: true,
      },
    });

    await client.deliveryAssignmentLog.create({
      data: {
        deliveryAssignmentId: assignment.id,
        fromStatus: null,
        toStatus: DeliveryAssignmentStatus.ASSIGNED,
        note: input.note ?? null,
        actorUserId: input.assignedById ?? null,
      },
    });

    await client.shipmentAssignment.create({
      data: {
        shipmentId: shipment.id,
        assignedToId: deliveryMan.userId,
        assignedById: input.assignedById ?? null,
        warehouseId: shipment.warehouseId ?? deliveryMan.warehouseId,
        role: "delivery_man",
        note: input.note ?? null,
      },
    });

    await syncShipmentAndOrderForAssignmentStatus(client, {
      shipment: {
        id: shipment.id,
        status: shipment.status,
        warehouseId: shipment.warehouseId,
        assignedAt: shipment.assignedAt,
        assignedToUserId: shipment.assignedToUserId,
        pickedAt: shipment.pickedAt,
        outForDeliveryAt: shipment.outForDeliveryAt,
        deliveredAt: shipment.deliveredAt,
        orderId: shipment.orderId,
      },
      order: {
        id: shipment.order.id,
        status: shipment.order.status,
      },
      deliveryManUserId: deliveryMan.userId,
      warehouseId: shipment.warehouseId ?? deliveryMan.warehouseId,
      nextAssignmentStatus: DeliveryAssignmentStatus.ASSIGNED,
      logNote: input.note ?? null,
    });

    const createdAssignment = await client.deliveryAssignment.findUnique({
      where: {
        id: assignment.id,
      },
      include: deliveryAssignmentDetailsInclude,
    });

    if (createdAssignment) {
      createdAssignments.push(createdAssignment);
    }
  }

  return createdAssignments;
}

export async function transitionDeliveryAssignmentStatus(
  client: DeliveryAssignmentMutationClient,
  input: {
    assignmentId: string;
    nextStatus: DeliveryAssignmentStatus;
    actorUserId?: string | null;
    note?: string | null;
    rejectionReason?: string | null;
    pickupProof?: {
      productReceived: boolean;
      packagingOk: boolean;
      productInGoodCondition: boolean;
      imageUrl?: string | null;
      note?: string | null;
    } | null;
    deliveredLocation?: {
      latitude: number;
      longitude: number;
      accuracy?: number | null;
    } | null;
  },
) {
  const assignment = await client.deliveryAssignment.findUnique({
    where: {
      id: input.assignmentId,
    },
    include: {
      deliveryMan: {
        select: {
          id: true,
          userId: true,
          warehouseId: true,
          status: true,
        },
      },
      order: {
        select: {
          id: true,
          status: true,
        },
      },
      shipment: {
        select: {
          id: true,
          orderId: true,
          status: true,
          warehouseId: true,
          assignedAt: true,
          assignedToUserId: true,
          pickedAt: true,
          outForDeliveryAt: true,
          deliveredAt: true,
        },
      },
    },
  });

  if (!assignment) {
    throw new Error("Delivery assignment not found.");
  }

  const allowedTransitions = getAllowedDeliveryAssignmentTransitions(
    assignment.status,
  );

  if (
    assignment.status !== input.nextStatus &&
    !allowedTransitions.includes(input.nextStatus)
  ) {
    throw new Error(
      `Invalid delivery assignment transition: ${assignment.status} -> ${input.nextStatus}.`,
    );
  }

  const now = new Date();
  const deliveryAssignmentData: Prisma.DeliveryAssignmentUpdateInput = {
    status: input.nextStatus,
    latestNote: input.note ?? assignment.latestNote ?? null,
  };

  if (
    input.nextStatus === DeliveryAssignmentStatus.ACCEPTED ||
    input.nextStatus === DeliveryAssignmentStatus.REJECTED
  ) {
    deliveryAssignmentData.respondedAt = now;
  }

  if (input.nextStatus === DeliveryAssignmentStatus.ACCEPTED) {
    deliveryAssignmentData.acceptedAt = now;
    deliveryAssignmentData.rejectionReason = null;
  }

  if (input.nextStatus === DeliveryAssignmentStatus.REJECTED) {
    deliveryAssignmentData.rejectedAt = now;
    deliveryAssignmentData.rejectionReason = input.rejectionReason ?? null;
    deliveryAssignmentData.completedAt = now;
  }

  if (input.nextStatus === DeliveryAssignmentStatus.PICKUP_CONFIRMED) {
    deliveryAssignmentData.pickupConfirmedAt = now;
    deliveryAssignmentData.pickupProofStatus = PickupProofStatus.CONFIRMED;
  }

  if (input.nextStatus === DeliveryAssignmentStatus.IN_TRANSIT) {
    deliveryAssignmentData.inTransitAt = now;
  }

  if (input.nextStatus === DeliveryAssignmentStatus.OUT_FOR_DELIVERY) {
    deliveryAssignmentData.outForDeliveryAt = now;
  }

  if (input.nextStatus === DeliveryAssignmentStatus.DELIVERED) {
    deliveryAssignmentData.deliveredAt = now;
    deliveryAssignmentData.completedAt = now;
    if (input.deliveredLocation) {
      deliveryAssignmentData.deliveredLatitude = input.deliveredLocation.latitude;
      deliveryAssignmentData.deliveredLongitude = input.deliveredLocation.longitude;
      deliveryAssignmentData.deliveredAccuracy = input.deliveredLocation.accuracy ?? null;
    }
  }

  if (input.nextStatus === DeliveryAssignmentStatus.FAILED) {
    deliveryAssignmentData.failedAt = now;
    deliveryAssignmentData.completedAt = now;
  }

  if (input.nextStatus === DeliveryAssignmentStatus.RETURNED) {
    deliveryAssignmentData.returnedAt = now;
    deliveryAssignmentData.completedAt = now;
  }

  await client.deliveryAssignment.update({
    where: {
      id: assignment.id,
    },
    data: deliveryAssignmentData,
  });

  if (input.pickupProof) {
    await client.warehousePickupProof.upsert({
      where: {
        deliveryAssignmentId: assignment.id,
      },
      update: {
        status: PickupProofStatus.CONFIRMED,
        productReceived: input.pickupProof.productReceived,
        packagingOk: input.pickupProof.packagingOk,
        productInGoodCondition: input.pickupProof.productInGoodCondition,
        imageUrl: input.pickupProof.imageUrl ?? null,
        note: input.pickupProof.note ?? null,
        actorUserId: input.actorUserId ?? null,
        confirmedAt: now,
      },
      create: {
        deliveryAssignmentId: assignment.id,
        status: PickupProofStatus.CONFIRMED,
        productReceived: input.pickupProof.productReceived,
        packagingOk: input.pickupProof.packagingOk,
        productInGoodCondition: input.pickupProof.productInGoodCondition,
        imageUrl: input.pickupProof.imageUrl ?? null,
        note: input.pickupProof.note ?? null,
        actorUserId: input.actorUserId ?? null,
        confirmedAt: now,
      },
    });
  }

  await client.deliveryAssignmentLog.create({
    data: {
      deliveryAssignmentId: assignment.id,
      fromStatus: assignment.status,
      toStatus: input.nextStatus,
      note:
        input.nextStatus === DeliveryAssignmentStatus.REJECTED
          ? input.rejectionReason ?? input.note ?? null
          : input.note ?? null,
      actorUserId: input.actorUserId ?? null,
    },
  });

  await syncShipmentAndOrderForAssignmentStatus(client, {
    shipment: assignment.shipment,
    order: assignment.order,
    deliveryManUserId: assignment.deliveryMan.userId,
    warehouseId: assignment.warehouseId,
    nextAssignmentStatus: input.nextStatus,
    logNote:
      input.nextStatus === DeliveryAssignmentStatus.REJECTED
        ? input.rejectionReason ?? input.note ?? null
        : input.note ?? null,
  });

  if (isTerminalDeliveryAssignmentStatus(input.nextStatus)) {
    await completeGenericShipmentAssignment(client, {
      shipmentId: assignment.shipmentId,
      deliveryManUserId: assignment.deliveryMan.userId,
    });
  }

  return client.deliveryAssignment.findUnique({
    where: {
      id: assignment.id,
    },
    include: deliveryAssignmentDetailsInclude,
  });
}
