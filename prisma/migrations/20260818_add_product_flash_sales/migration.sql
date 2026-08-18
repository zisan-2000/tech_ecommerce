ALTER TABLE "Product"
ADD COLUMN "flashSaleEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "flashSalePrice" DECIMAL(10,2),
ADD COLUMN "flashSaleStartsAt" TIMESTAMP(3),
ADD COLUMN "flashSaleEndsAt" TIMESTAMP(3),
ADD COLUMN "flashSaleSortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Product_deleted_available_flashSaleEnabled_flashSaleStartsAt_flashSaleEndsAt_idx"
ON "Product"("deleted", "available", "flashSaleEnabled", "flashSaleStartsAt", "flashSaleEndsAt");
