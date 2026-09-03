-- Link order inventory movements to their source order so stock can be restored
-- to the exact warehouse allocation without relying on human-readable log text.
ALTER TABLE "InventoryLog" ADD COLUMN "orderId" INTEGER;

-- Preserve cancellation/return support for orders created before this migration.
-- These are the two canonical deduction reasons emitted by the checkout flows.
WITH parsed_order_movements AS (
  SELECT
    "id",
    substring("reason" FROM '^Order #([0-9]+) ') AS "parsedOrderId"
  FROM "InventoryLog"
  WHERE "change" < 0
    AND "reason" ~ '^Order #[0-9]+ (checkout deduction|SSLCommerz payment capture)'
)
UPDATE "InventoryLog" AS inventory_log
SET "orderId" = source_order."id"
FROM parsed_order_movements AS movement
JOIN "Order" AS source_order
  ON source_order."id"::text = movement."parsedOrderId"
WHERE inventory_log."id" = movement."id";

CREATE INDEX "InventoryLog_orderId_variantId_warehouseId_idx"
ON "InventoryLog"("orderId", "variantId", "warehouseId");

ALTER TABLE "InventoryLog"
ADD CONSTRAINT "InventoryLog_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
