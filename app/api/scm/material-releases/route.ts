import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { Prisma, type MaterialReleaseStatus } from "@/generated/prisma";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessContext } from "@/lib/rbac";
import { dispatchVariantInventory } from "@/lib/inventory";
import { revalidateStorefrontCatalog } from "@/lib/storefront-catalog-cache";
import { logActivity } from "@/lib/activity-log";
import {
  generateAssetTags,
  generateMaterialChallanNumber,
  generateMaterialReleaseNumber,
  generateMaterialWaybillNumber,
  materialReleaseInclude,
  toMaterialReleaseLogSnapshot,
} from "@/lib/material-warehouse";

const MATERIAL_RELEASE_READ_PERMISSIONS = [
  "material_releases.read",
  "material_releases.manage",
  "material_requests.read",
  "material_requests.manage",
  "material_requests.approve_admin",
] as const;

function toCleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canReadMaterialReleases(access: Awaited<ReturnType<typeof getAccessContext>>) {
  return access.hasAny([...MATERIAL_RELEASE_READ_PERMISSIONS]);
}

function hasGlobalMaterialReleaseScope(
  access: Awaited<ReturnType<typeof getAccessContext>>,
) {
  return MATERIAL_RELEASE_READ_PERMISSIONS.some((permission) =>
    access.hasGlobal(permission),
  );
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
    if (!canReadMaterialReleases(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const warehouseId = Number(request.nextUrl.searchParams.get("warehouseId") || "");
    const materialRequestId = Number(
      request.nextUrl.searchParams.get("materialRequestId") || "",
    );
    const statusFilter = toCleanText(
      request.nextUrl.searchParams.get("status"),
      40,
    ).toUpperCase();
    const search = toCleanText(request.nextUrl.searchParams.get("search"), 120);
    const fromRaw = toCleanText(request.nextUrl.searchParams.get("from"), 40);
    const toRaw = toCleanText(request.nextUrl.searchParams.get("to"), 40);

    const where: Prisma.MaterialReleaseNoteWhereInput = {};
    if (Number.isInteger(materialRequestId) && materialRequestId > 0) {
      where.materialRequestId = materialRequestId;
    }
    if (statusFilter && ["ISSUED", "CANCELLED"].includes(statusFilter)) {
      where.status = statusFilter as MaterialReleaseStatus;
    }
    if (fromRaw || toRaw) {
      const releasedAt: Prisma.DateTimeFilter = {};
      if (fromRaw) {
        const parsed = new Date(fromRaw);
        if (!Number.isNaN(parsed.getTime())) {
          releasedAt.gte = parsed;
        }
      }
      if (toRaw) {
        const parsed = new Date(toRaw);
        if (!Number.isNaN(parsed.getTime())) {
          releasedAt.lte = parsed;
        }
      }
      if (releasedAt.gte || releasedAt.lte) {
        where.releasedAt = releasedAt;
      }
    }

    if (search) {
      where.OR = [
        { releaseNumber: { contains: search, mode: "insensitive" } },
        { challanNumber: { contains: search, mode: "insensitive" } },
        { waybillNumber: { contains: search, mode: "insensitive" } },
        { materialRequest: { requestNumber: { contains: search, mode: "insensitive" } } },
      ];
    }

    const hasGlobalScope = hasGlobalMaterialReleaseScope(access);
    if (hasGlobalScope) {
      if (Number.isInteger(warehouseId) && warehouseId > 0) {
        where.warehouseId = warehouseId;
      }
    } else if (Number.isInteger(warehouseId) && warehouseId > 0) {
      if (!access.canAccessWarehouse(warehouseId)) {
        return NextResponse.json([]);
      }
      where.warehouseId = warehouseId;
    } else if (access.warehouseIds.length > 0) {
      where.warehouseId = { in: access.warehouseIds };
    } else {
      return NextResponse.json([]);
    }

    const releases = await prisma.materialReleaseNote.findMany({
      where,
      include: materialReleaseInclude,
      orderBy: [{ releasedAt: "desc" }, { id: "desc" }],
    });

    return NextResponse.json(releases);
  } catch (error) {
    console.error("SCM MATERIAL RELEASES GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load material releases." },
      { status: 500 },
    );
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

    const body = (await request.json().catch(() => ({}))) as {
      materialRequestId?: unknown;
      note?: unknown;
      challanNumber?: unknown;
      waybillNumber?: unknown;
      items?: Array<{
        materialRequestItemId?: unknown;
        quantityReleased?: unknown;
      }>;
    };

    const materialRequestId = Number(body.materialRequestId);
    if (!Number.isInteger(materialRequestId) || materialRequestId <= 0) {
      return NextResponse.json({ error: "Material request is required." }, { status: 400 });
    }

    const materialRequest = await prisma.materialRequest.findUnique({
      where: { id: materialRequestId },
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        items: {
          include: {
            productVariant: {
              select: {
                id: true,
                sku: true,
                productId: true,
                costPrice: true,
                product: {
                  select: {
                    id: true,
                    name: true,
                    inventoryItemClass: true,
                    requiresAssetTag: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!materialRequest) {
      return NextResponse.json({ error: "Material request not found." }, { status: 404 });
    }
    if (!access.can("material_releases.manage", materialRequest.warehouseId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!["ADMIN_APPROVED", "PARTIALLY_RELEASED"].includes(materialRequest.status)) {
      return NextResponse.json(
        { error: "Only admin-approved or partially released requests can be released." },
        { status: 400 },
      );
    }

    const inputRows = Array.isArray(body.items) ? body.items : [];
    const itemsToRelease =
      inputRows.length > 0
        ? inputRows.map((item, index) => {
            const materialRequestItemId = Number(item.materialRequestItemId);
            const quantityReleased = Number(item.quantityReleased);
            if (!Number.isInteger(materialRequestItemId) || materialRequestItemId <= 0) {
              throw new Error(`Release item ${index + 1}: material request item is required`);
            }
            if (!Number.isInteger(quantityReleased) || quantityReleased <= 0) {
              throw new Error(`Release item ${index + 1}: quantity must be greater than 0`);
            }
            return { materialRequestItemId, quantityReleased };
          })
        : materialRequest.items
            .map((item) => ({
              materialRequestItemId: item.id,
              quantityReleased: item.quantityRequested - item.quantityReleased,
            }))
            .filter((item) => item.quantityReleased > 0);

    if (itemsToRelease.length === 0) {
      return NextResponse.json(
        { error: "No remaining quantity is available to release." },
        { status: 400 },
      );
    }

    const itemMap = new Map(materialRequest.items.map((item) => [item.id, item]));
    for (const row of itemsToRelease) {
      const requestItem = itemMap.get(row.materialRequestItemId);
      if (!requestItem) {
        return NextResponse.json(
          { error: `Material request item ${row.materialRequestItemId} not found.` },
          { status: 400 },
        );
      }
      const remaining = requestItem.quantityRequested - requestItem.quantityReleased;
      if (row.quantityReleased > remaining) {
        return NextResponse.json(
          {
            error: `Release quantity for ${requestItem.productVariant.sku} exceeds remaining requested quantity.`,
          },
          { status: 400 },
        );
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const releaseNumber = await generateMaterialReleaseNumber(tx);
      const challanNumber =
        toCleanText(body.challanNumber, 80) || (await generateMaterialChallanNumber(tx));
      const waybillNumber =
        toCleanText(body.waybillNumber, 80) || (await generateMaterialWaybillNumber(tx));

      const release = await tx.materialReleaseNote.create({
        data: {
          releaseNumber,
          challanNumber,
          waybillNumber,
          materialRequestId: materialRequest.id,
          warehouseId: materialRequest.warehouseId,
          note: toCleanText(body.note, 1000) || null,
          releasedById: access.userId,
        },
      });

      for (const row of itemsToRelease) {
        const requestItem = itemMap.get(row.materialRequestItemId);
        if (!requestItem) {
          throw new Error("Material request item lookup failed");
        }

        await dispatchVariantInventory({
          tx,
          productId: requestItem.productVariant.productId,
          productVariantId: requestItem.productVariantId,
          warehouseId: materialRequest.warehouseId,
          quantity: row.quantityReleased,
          reason: `Material release ${release.releaseNumber} (${materialRequest.requestNumber})`,
        });

        const releaseItem = await tx.materialReleaseNoteItem.create({
          data: {
            materialReleaseNoteId: release.id,
            materialRequestItemId: requestItem.id,
            productVariantId: requestItem.productVariantId,
            quantityReleased: row.quantityReleased,
            unitCost: requestItem.productVariant.costPrice ?? null,
          },
        });

        await tx.materialRequestItem.update({
          where: { id: requestItem.id },
          data: {
            quantityReleased: {
              increment: row.quantityReleased,
            },
          },
        });

        const needsAssetTag =
          requestItem.productVariant.product.requiresAssetTag ||
          requestItem.productVariant.product.inventoryItemClass === "PERMANENT";
        if (needsAssetTag) {
          const assetTags = await generateAssetTags({
            tx,
            warehouseCode: materialRequest.warehouse.code,
            productSku: requestItem.productVariant.sku,
            count: row.quantityReleased,
          });
          for (const assetTag of assetTags) {
            await tx.assetRegister.create({
              data: {
                assetTag,
                warehouseId: materialRequest.warehouseId,
                productVariantId: requestItem.productVariantId,
                materialRequestId: materialRequest.id,
                materialReleaseNoteId: release.id,
                materialReleaseItemId: releaseItem.id,
                createdById: access.userId,
                note: `Auto-tagged from material release ${release.releaseNumber}`,
              },
            });
          }
        }
      }

      const refreshedItems = await tx.materialRequestItem.findMany({
        where: { materialRequestId: materialRequest.id },
        select: {
          quantityRequested: true,
          quantityReleased: true,
        },
      });
      const allReleased = refreshedItems.every(
        (item) => item.quantityReleased >= item.quantityRequested,
      );

      await tx.materialRequest.update({
        where: { id: materialRequest.id },
        data: {
          status: allReleased ? "RELEASED" : "PARTIALLY_RELEASED",
        },
      });

      return tx.materialReleaseNote.findUniqueOrThrow({
        where: { id: release.id },
        include: materialReleaseInclude,
      });
    });

    revalidateStorefrontCatalog();

    await logActivity({
      action: "issue",
      entity: "material_release",
      entityId: created.id,
      access,
      request,
      metadata: {
        message: `Issued material release ${created.releaseNumber} against ${created.materialRequest.requestNumber}`,
      },
      after: toMaterialReleaseLogSnapshot(created),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error("SCM MATERIAL RELEASES POST ERROR:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to issue material release." },
      { status: 500 },
    );
  }
}
