CREATE TYPE "CustomerNotificationType" AS ENUM ('PRICE_DROP');

CREATE TYPE "CustomerNotificationStatus" AS ENUM ('UNREAD', 'READ');

CREATE TABLE "PriceDropAlert" (
  "id" SERIAL NOT NULL,
  "userId" TEXT NOT NULL,
  "productId" INTEGER NOT NULL,
  "variantId" INTEGER,
  "baselinePrice" DECIMAL(10,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastNotifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PriceDropAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerNotification" (
  "id" SERIAL NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "CustomerNotificationType" NOT NULL,
  "status" "CustomerNotificationStatus" NOT NULL DEFAULT 'UNREAD',
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "targetUrl" TEXT,
  "productId" INTEGER,
  "variantId" INTEGER,
  "metadata" JSONB,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PriceDropAlert_userId_productId_product_level_key"
  ON "PriceDropAlert"("userId", "productId")
  WHERE "variantId" IS NULL;

CREATE UNIQUE INDEX "PriceDropAlert_userId_productId_variantId_key"
  ON "PriceDropAlert"("userId", "productId", "variantId")
  WHERE "variantId" IS NOT NULL;

CREATE INDEX "PriceDropAlert_productId_active_idx"
  ON "PriceDropAlert"("productId", "active");

CREATE INDEX "PriceDropAlert_variantId_active_idx"
  ON "PriceDropAlert"("variantId", "active");

CREATE INDEX "PriceDropAlert_userId_active_updatedAt_idx"
  ON "PriceDropAlert"("userId", "active", "updatedAt");

CREATE INDEX "CustomerNotification_userId_status_createdAt_idx"
  ON "CustomerNotification"("userId", "status", "createdAt");

CREATE INDEX "CustomerNotification_productId_createdAt_idx"
  ON "CustomerNotification"("productId", "createdAt");

ALTER TABLE "PriceDropAlert"
  ADD CONSTRAINT "PriceDropAlert_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PriceDropAlert"
  ADD CONSTRAINT "PriceDropAlert_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PriceDropAlert"
  ADD CONSTRAINT "PriceDropAlert_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerNotification"
  ADD CONSTRAINT "CustomerNotification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerNotification"
  ADD CONSTRAINT "CustomerNotification_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerNotification"
  ADD CONSTRAINT "CustomerNotification_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
