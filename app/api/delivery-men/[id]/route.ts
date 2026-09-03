import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncDeliveryManWarehouseAccess } from "@/lib/delivery-man-access";

const DELIVERY_MAN_STATUSES = new Set([
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "REJECTED",
  "RESIGNED",
]);

const DELIVERY_APPLICATION_STATUSES = new Set([
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let idParam: string | undefined;

  try {
    ({ id: idParam } = await params);
    
    if (!idParam) {
      return NextResponse.json(
        { success: false, message: "Delivery man ID is required" },
        { status: 400 }
      );
    }

    const deliveryMan = await prisma.deliveryManProfile.findUnique({
      where: { id: idParam },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            createdAt: true,
          },
        },
        warehouse: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        references: {
          orderBy: { createdAt: "desc" },
        },
        documents: {
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            references: true,
            documents: true,
          },
        },
        deliveryAssignments: {
          include: {
            warehouse: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
          distinct: ['warehouseId'],
        },
      },
    });

    if (!deliveryMan) {
      console.error("Delivery man not found with ID:", idParam);
      return NextResponse.json(
        { success: false, message: "Delivery man not found" },
        { status: 404 }
      );
    }

    console.log("Delivery man found:", {
      id: deliveryMan.id,
      name: deliveryMan.fullName,
      documentsCount: deliveryMan.documents?.length || 0
    });

    return NextResponse.json({
      success: true,
      data: deliveryMan,
    });
  } catch (error) {
    console.error("DELIVERY_MAN_FETCH_ERROR:", error);
    console.error("Error details:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : "No stack trace",
      idParam: idParam
    });

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Internal server error",
        error: process.env.NODE_ENV === 'development' ? {
          details: error instanceof Error ? error.message : "Unknown error",
          idParam: idParam
        } : undefined
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let idParam: string | undefined;

  try {
    ({ id: idParam } = await params);
    
    if (!idParam) {
      return NextResponse.json(
        { success: false, message: "Delivery man ID is required" },
        { status: 400 }
      );
    }

    // Check if delivery man exists first
    const existingDeliveryMan = await prisma.deliveryManProfile.findUnique({
      where: { id: idParam },
    });

    if (!existingDeliveryMan) {
      return NextResponse.json(
        { success: false, message: "Delivery man not found" },
        { status: 404 }
      );
    }

    const body = await req.json();

    const updateData: any = {};
    const nextWarehouseId =
      body.warehouseId !== undefined ? parseInt(body.warehouseId, 10) : undefined;

    if (
      body.status !== undefined &&
      !DELIVERY_MAN_STATUSES.has(String(body.status))
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid delivery man status" },
        { status: 400 }
      );
    }

    if (
      body.applicationStatus !== undefined &&
      !DELIVERY_APPLICATION_STATUSES.has(String(body.applicationStatus))
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid application status" },
        { status: 400 }
      );
    }

    if (body.warehouseId !== undefined) {
      if (
        nextWarehouseId === undefined ||
        Number.isNaN(nextWarehouseId) ||
        nextWarehouseId <= 0
      ) {
        return NextResponse.json(
          { success: false, message: "Invalid warehouseId" },
          { status: 400 }
        );
      }
      updateData.warehouseId = nextWarehouseId;
    }

    Object.keys(body).forEach((key) => {
      if (key !== "warehouseId") {
        updateData[key] = body[key];
      }
    });

    const deliveryMan = await prisma.$transaction(async (tx) => {
      const updatedDeliveryMan = await tx.deliveryManProfile.update({
        where: { id: idParam },
        data: updateData,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              role: true,
              createdAt: true,
            },
          },
          warehouse: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          references: {
            orderBy: { createdAt: "desc" },
          },
          documents: {
            orderBy: { createdAt: "desc" },
          },
          _count: {
            select: {
              references: true,
              documents: true,
            },
          },
        },
      });

      if (
        body.warehouseId !== undefined &&
        updatedDeliveryMan.userId &&
        updatedDeliveryMan.warehouseId
      ) {
        await syncDeliveryManWarehouseAccess(tx, {
          userId: updatedDeliveryMan.userId,
          warehouseId: updatedDeliveryMan.warehouseId,
        });
      }

      return updatedDeliveryMan;
    });

    return NextResponse.json({
      success: true,
      message: "Delivery man updated successfully",
      data: deliveryMan,
    });
  } catch (error) {
    console.error("DELIVERY_MAN_UPDATE_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
