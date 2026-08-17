CREATE TABLE "ProductQuestion" (
    "id" SERIAL NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "productId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "answeredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    CONSTRAINT "ProductQuestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductQuestion_productId_createdAt_idx" ON "ProductQuestion"("productId", "createdAt");
CREATE INDEX "ProductQuestion_userId_idx" ON "ProductQuestion"("userId");
CREATE INDEX "ProductQuestion_answeredById_idx" ON "ProductQuestion"("answeredById");

ALTER TABLE "ProductQuestion"
ADD CONSTRAINT "ProductQuestion_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductQuestion"
ADD CONSTRAINT "ProductQuestion_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductQuestion"
ADD CONSTRAINT "ProductQuestion_answeredById_fkey"
FOREIGN KEY ("answeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
