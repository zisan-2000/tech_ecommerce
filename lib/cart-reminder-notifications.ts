import { prisma } from "@/lib/prisma";

type EvaluateCartReminderOptions = {
  userId?: string;
  now?: Date;
};

function formatDelay(minutes: number) {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${hours}h ${rest}m`;
}

export async function evaluateCartReminderNotifications({
  userId,
  now = new Date(),
}: EvaluateCartReminderOptions = {}) {
  const cartItems = await prisma.cartItem.findMany({
    where: {
      ...(userId ? { userId } : {}),
      product: {
        deleted: false,
        available: true,
        cartReminderMinutes: { not: null },
      },
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          image: true,
          cartReminderMinutes: true,
        },
      },
    },
    orderBy: { updatedAt: "asc" },
    take: 500,
  });

  let scanned = 0;
  let notificationsCreated = 0;

  for (const item of cartItems) {
    const reminderMinutes = Number(item.product.cartReminderMinutes);
    if (!Number.isInteger(reminderMinutes) || reminderMinutes <= 0) continue;
    scanned += 1;

    const eligibleAt = new Date(
      item.updatedAt.getTime() + reminderMinutes * 60 * 1000,
    );
    if (eligibleAt.getTime() > now.getTime()) continue;
    if (item.lastReminderAt && item.lastReminderAt >= item.updatedAt) continue;

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.cartItem.updateMany({
        where: {
          id: item.id,
          updatedAt: item.updatedAt,
          OR: [
            { lastReminderAt: null },
            { lastReminderAt: { lt: item.updatedAt } },
          ],
        },
        data: { lastReminderAt: now },
      });
      if (claimed.count !== 1) return;

      await tx.customerNotification.create({
        data: {
          userId: item.userId,
          type: "CART_REMINDER",
          title: "Cart reminder",
          message: `You added ${item.product.name} to your cart ${formatDelay(
            reminderMinutes,
          )} ago but have not checked out yet.`,
          targetUrl: "/ecommerce/cart",
          productId: item.productId,
          variantId: item.variantId,
          metadata: {
            cartItemId: item.id,
            quantity: item.quantity,
            reminderMinutes,
          },
        },
      });
      notificationsCreated += 1;
    });
  }

  return {
    scannedCartItems: scanned,
    notificationsCreated,
  };
}
