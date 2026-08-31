ALTER TYPE "CustomerNotificationType" ADD VALUE IF NOT EXISTS 'CART_REMINDER';

ALTER TABLE "Product"
  ADD COLUMN "cartReminderMinutes" INTEGER;

ALTER TABLE "CartItem"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastReminderAt" TIMESTAMP(3);

CREATE INDEX "CartItem_updatedAt_lastReminderAt_idx"
  ON "CartItem"("updatedAt", "lastReminderAt");
