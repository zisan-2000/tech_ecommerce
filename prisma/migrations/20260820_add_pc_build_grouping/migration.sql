CREATE TABLE "PcBuildCartItem" (
  "cartItemId" INTEGER NOT NULL,
  "buildId" VARCHAR(64) NOT NULL,
  "slot" VARCHAR(32) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PcBuildCartItem_pkey" PRIMARY KEY ("cartItemId"),
  CONSTRAINT "PcBuildCartItem_cartItemId_fkey"
    FOREIGN KEY ("cartItemId") REFERENCES "CartItem"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PcBuildCartItem_buildId_slot_key"
  ON "PcBuildCartItem"("buildId", "slot");
CREATE INDEX "PcBuildCartItem_buildId_idx"
  ON "PcBuildCartItem"("buildId");

CREATE TABLE "PcBuildOrderItem" (
  "orderItemId" INTEGER NOT NULL,
  "orderId" INTEGER NOT NULL,
  "buildId" VARCHAR(64) NOT NULL,
  "slot" VARCHAR(32) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PcBuildOrderItem_pkey" PRIMARY KEY ("orderItemId"),
  CONSTRAINT "PcBuildOrderItem_orderItemId_fkey"
    FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PcBuildOrderItem_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PcBuildOrderItem_buildId_slot_key"
  ON "PcBuildOrderItem"("buildId", "slot");
CREATE INDEX "PcBuildOrderItem_orderId_buildId_idx"
  ON "PcBuildOrderItem"("orderId", "buildId");
