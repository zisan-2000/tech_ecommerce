import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { Prisma } from "@/generated/prisma";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";

const LOCATION_PERMISSIONS = ["warehouse_locations.read", "warehouse_locations.manage"] as const;

function toCleanText(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canReadLocations(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasAny([...LOCATION_PERMISSIONS]);
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canReadLocations(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const warehouseId = Number(request.nextUrl.searchParams.get("warehouseId") || "");
    const whereWarehouse = Number.isInteger(warehouseId) && warehouseId > 0 ? warehouseId : null;

    const [zones, aisles, bins] = await Promise.all([
      prisma.warehouseZone.findMany({
        where: whereWarehouse ? { warehouseId: whereWarehouse } : undefined,
        orderBy: [{ warehouseId: "asc" }, { code: "asc" }],
      }),
      prisma.warehouseAisle.findMany({
        where: whereWarehouse ? { warehouseId: whereWarehouse } : undefined,
        orderBy: [{ warehouseId: "asc" }, { code: "asc" }],
      }),
      prisma.warehouseBin.findMany({
        where: whereWarehouse ? { warehouseId: whereWarehouse } : undefined,
        orderBy: [{ warehouseId: "asc" }, { code: "asc" }],
      }),
    ]);

    return NextResponse.json({ zones, aisles, bins });
  } catch (error) {
    console.error("WAREHOUSE LOCATIONS GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load warehouse locations." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.hasAny(["warehouse_locations.manage"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      type?: unknown;
      warehouseId?: unknown;
      zoneId?: unknown;
      aisleId?: unknown;
      code?: unknown;
      name?: unknown;
      description?: unknown;
      isActive?: unknown;
    };

    const type = toCleanText(body.type, 20).toLowerCase();
    const warehouseId = Number(body.warehouseId);
    if (!Number.isInteger(warehouseId) || warehouseId <= 0) {
      return NextResponse.json({ error: "Warehouse is required." }, { status: 400 });
    }

    if (!access.canAccessWarehouse(warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const payload = {
      code: toCleanText(body.code, 40),
      name: toCleanText(body.name, 120),
      description: toCleanText(body.description, 255) || null,
      isActive:
        body.isActive === undefined ? true : Boolean(body.isActive),
    };

    if (!payload.code || !payload.name) {
      return NextResponse.json({ error: "Code and name are required." }, { status: 400 });
    }

    if (type === "zone") {
      const zone = await prisma.warehouseZone.create({
        data: {
          warehouseId,
          ...payload,
        },
      });
      return NextResponse.json(zone, { status: 201 });
    }

    if (type === "aisle") {
      const zoneId = Number(body.zoneId);
      if (!Number.isInteger(zoneId) || zoneId <= 0) {
        return NextResponse.json({ error: "Zone is required." }, { status: 400 });
      }
      const aisle = await prisma.warehouseAisle.create({
        data: {
          warehouseId,
          zoneId,
          ...payload,
        },
      });
      return NextResponse.json(aisle, { status: 201 });
    }

    if (type === "bin") {
      const zoneId = Number(body.zoneId);
      const aisleId = Number(body.aisleId);
      if (!Number.isInteger(zoneId) || zoneId <= 0) {
        return NextResponse.json({ error: "Zone is required." }, { status: 400 });
      }
      if (!Number.isInteger(aisleId) || aisleId <= 0) {
        return NextResponse.json({ error: "Aisle is required." }, { status: 400 });
      }
      const bin = await prisma.warehouseBin.create({
        data: {
          warehouseId,
          zoneId,
          aisleId,
          ...payload,
        },
      });
      return NextResponse.json(bin, { status: 201 });
    }

    return NextResponse.json({ error: "Invalid location type." }, { status: 400 });
  } catch (error: any) {
    console.error("WAREHOUSE LOCATIONS POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create location." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );

    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.hasAny(["warehouse_locations.manage"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      type?: unknown;
      id?: unknown;
      code?: unknown;
      name?: unknown;
      description?: unknown;
      isActive?: unknown;
    };

    const type = toCleanText(body.type, 20).toLowerCase();
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Id is required." }, { status: 400 });
    }

    const data = {
      code: body.code === undefined ? undefined : toCleanText(body.code, 40),
      name: body.name === undefined ? undefined : toCleanText(body.name, 120),
      description:
        body.description === undefined ? undefined : toCleanText(body.description, 255) || null,
      isActive: body.isActive === undefined ? undefined : Boolean(body.isActive),
    };

    if (type === "zone") {
      const updated = await prisma.warehouseZone.update({ where: { id }, data });
      return NextResponse.json(updated);
    }
    if (type === "aisle") {
      const updated = await prisma.warehouseAisle.update({ where: { id }, data });
      return NextResponse.json(updated);
    }
    if (type === "bin") {
      const updated = await prisma.warehouseBin.update({ where: { id }, data });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Invalid location type." }, { status: 400 });
  } catch (error: any) {
    console.error("WAREHOUSE LOCATIONS PATCH ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update location." },
      { status: 500 },
    );
  }
}
