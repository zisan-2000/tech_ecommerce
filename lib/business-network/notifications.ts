import "server-only";

import {
  BusinessNotificationCategory,
  type Prisma,
} from "@/generated/prisma";
import { db } from "@/lib/db";
import { BUSINESS_AUDIT_ACTIONS, writeBusinessAudit } from "./audit";
import { BusinessNetworkError } from "./errors";
import { requireBusinessContext } from "./context";
import { runSerializableTransaction } from "./transaction";
import { notificationPreferencesSchema } from "./notification-schemas";

function pagination(url: URL) {
  return {
    page: Math.max(1, Number(url.searchParams.get("page")) || 1),
    limit: Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20)),
  };
}

export async function listBusinessNotifications(url: URL) {
  const context = await requireBusinessContext();
  const page = pagination(url);
  const requestedCategory = url.searchParams.get("category")?.trim().toUpperCase();
  const category = requestedCategory && Object.values(BusinessNotificationCategory).includes(requestedCategory as BusinessNotificationCategory)
    ? requestedCategory as BusinessNotificationCategory
    : null;
  const state = url.searchParams.get("state")?.trim().toLowerCase();
  const where: Prisma.BusinessNotificationWhereInput = {
    organizationId: context.activeMembership.organization.id,
    memberId: context.activeMembership.memberId,
    archivedAt: null,
    ...(category ? { category } : {}),
    ...(state === "unread" ? { readAt: null } : state === "read" ? { readAt: { not: null } } : {}),
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };
  const [items, total, unread] = await Promise.all([
    db.businessNotification.findMany({
      where,
      skip: (page.page - 1) * page.limit,
      take: page.limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        category: true,
        priority: true,
        title: true,
        body: true,
        actionUrl: true,
        entityType: true,
        entityId: true,
        readAt: true,
        createdAt: true,
      },
    }),
    db.businessNotification.count({ where }),
    db.businessNotification.count({
      where: {
        organizationId: context.activeMembership.organization.id,
        memberId: context.activeMembership.memberId,
        archivedAt: null,
        readAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    }),
  ]);
  return {
    items,
    unread,
    pagination: {
      ...page,
      total,
      pages: Math.ceil(total / page.limit),
    },
  };
}

export async function markBusinessNotificationRead(input: {
  notificationId: string;
  request: Request;
}) {
  const context = await requireBusinessContext();
  return runSerializableTransaction(async (tx) => {
    const notification = await tx.businessNotification.findFirst({
      where: {
        id: input.notificationId,
        organizationId: context.activeMembership.organization.id,
        memberId: context.activeMembership.memberId,
        archivedAt: null,
      },
    });
    if (!notification) {
      throw new BusinessNetworkError(404, "BUSINESS_NOTIFICATION_NOT_FOUND", "Notification not found.");
    }
    const updated = notification.readAt
      ? notification
      : await tx.businessNotification.update({
          where: { id: notification.id },
          data: { readAt: new Date() },
        });
    if (!notification.readAt) {
      await writeBusinessAudit({
        tx,
        request: input.request,
        organizationId: context.activeMembership.organization.id,
        memberId: context.activeMembership.memberId,
        actorUserId: context.user.id,
        action: BUSINESS_AUDIT_ACTIONS.notificationRead,
        entityType: "BusinessNotification",
        entityId: notification.id,
        before: { readAt: null },
        after: { readAt: updated.readAt },
      });
    }
    return updated;
  });
}

export async function markAllBusinessNotificationsRead(request: Request) {
  const context = await requireBusinessContext();
  return runSerializableTransaction(async (tx) => {
    const result = await tx.businessNotification.updateMany({
      where: {
        organizationId: context.activeMembership.organization.id,
        memberId: context.activeMembership.memberId,
        archivedAt: null,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    await writeBusinessAudit({
      tx,
      request,
      organizationId: context.activeMembership.organization.id,
      memberId: context.activeMembership.memberId,
      actorUserId: context.user.id,
      action: BUSINESS_AUDIT_ACTIONS.notificationsReadAll,
      entityType: "BusinessNotification",
      entityId: context.activeMembership.memberId,
      after: { markedRead: result.count },
    });
    return { markedRead: result.count };
  });
}

const defaultPreferences = {
  emailEnabled: true,
  organizationEmail: true,
  salesEmail: true,
  financeEmail: true,
  partnershipEmail: true,
  securityEmail: true,
};

export async function getBusinessNotificationPreferences() {
  const context = await requireBusinessContext();
  const preference = await db.businessNotificationPreference.findUnique({
    where: { memberId: context.activeMembership.memberId },
    select: {
      emailEnabled: true,
      organizationEmail: true,
      salesEmail: true,
      financeEmail: true,
      partnershipEmail: true,
      securityEmail: true,
    },
  });
  return preference ?? defaultPreferences;
}

export async function updateBusinessNotificationPreferences(input: {
  body: unknown;
  request: Request;
}) {
  const data = notificationPreferencesSchema.parse(input.body);
  const context = await requireBusinessContext();
  return runSerializableTransaction(async (tx) => {
    const before = await tx.businessNotificationPreference.findUnique({
      where: { memberId: context.activeMembership.memberId },
    });
    const preference = await tx.businessNotificationPreference.upsert({
      where: { memberId: context.activeMembership.memberId },
      create: {
        organizationId: context.activeMembership.organization.id,
        memberId: context.activeMembership.memberId,
        ...data,
      },
      update: data,
    });
    await writeBusinessAudit({
      tx,
      request: input.request,
      organizationId: context.activeMembership.organization.id,
      memberId: context.activeMembership.memberId,
      actorUserId: context.user.id,
      action: BUSINESS_AUDIT_ACTIONS.notificationPreferencesUpdated,
      entityType: "BusinessNotificationPreference",
      entityId: preference.id,
      before,
      after: preference,
    });
    return preference;
  });
}

