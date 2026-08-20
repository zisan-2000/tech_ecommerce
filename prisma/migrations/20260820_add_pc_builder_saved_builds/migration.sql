CREATE TABLE "PcBuilderSavedBuild" (
  "id" VARCHAR(64) NOT NULL,
  "userId" TEXT NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "shareToken" VARCHAR(64) NOT NULL,
  "selectionHash" CHAR(64) NOT NULL,
  "selections" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PcBuilderSavedBuild_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PcBuilderSavedBuild_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PcBuilderSavedBuild_selections_object_check"
    CHECK (jsonb_typeof("selections") = 'object')
);

CREATE UNIQUE INDEX "PcBuilderSavedBuild_shareToken_key"
  ON "PcBuilderSavedBuild"("shareToken");
CREATE UNIQUE INDEX "PcBuilderSavedBuild_userId_selectionHash_key"
  ON "PcBuilderSavedBuild"("userId", "selectionHash");
CREATE INDEX "PcBuilderSavedBuild_userId_updatedAt_idx"
  ON "PcBuilderSavedBuild"("userId", "updatedAt" DESC);
