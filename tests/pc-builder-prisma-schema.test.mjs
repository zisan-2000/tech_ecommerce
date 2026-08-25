import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Prisma uses the intentional multi-file schema folder", async () => {
  const [schema, businessSchema, config] = await Promise.all([
    read("../prisma/schema.prisma"),
    read("../prisma/business-network.prisma"),
    read("../prisma.config.ts"),
  ]);

  assert.match(config, /schema:\s*"prisma"/);
  assert.match(schema, /model CartItem\s*\{/);
  assert.match(schema, /lineKey\s+String\s+@default\("standard"\)\s+@db\.VarChar\(80\)/);
  assert.match(schema, /@@unique\(\[userId, productId, variantId, lineKey\]\)/);
  assert.match(schema, /@@index\(\[userId, lineKey\]\)/);
  assert.match(businessSchema, /model Organization\s*\{/);
  assert.doesNotMatch(businessSchema, /model CartItem\s*\{/);

  await assert.rejects(
    access(new URL("../prisma/pc-builder.prisma", import.meta.url)),
    (error) => error?.code === "ENOENT",
  );
});

test("hand-written PC Builder tables remain explicitly external", async () => {
  const config = await read("../prisma.config.ts");

  assert.match(config, /externalTables:\s*true/);
  for (const table of [
    "public.PcBuildCartItem",
    "public.PcBuildOrderItem",
    "public.PcBuilderSavedBuild",
  ]) {
    assert.match(config, new RegExp(table.replaceAll(".", "\\.")));
  }
  assert.doesNotMatch(config, /public\.CartItem/);
});

test("external PC Builder table contracts remain migration-owned", async () => {
  const [grouping, saved, sharedVariants] = await Promise.all([
    read("../prisma/migrations/20260820_add_pc_build_grouping/migration.sql"),
    read("../prisma/migrations/20260820_add_pc_builder_saved_builds/migration.sql"),
    read(
      "../prisma/migrations/20260820_support_shared_pc_builder_cart_variants/migration.sql",
    ),
  ]);

  assert.match(grouping, /CREATE TABLE "PcBuildCartItem"/);
  assert.match(grouping, /CREATE TABLE "PcBuildOrderItem"/);
  assert.match(grouping, /FOREIGN KEY \("cartItemId"\) REFERENCES "CartItem"\("id"\)/);
  assert.match(saved, /CREATE TABLE "PcBuilderSavedBuild"/);
  assert.match(saved, /FOREIGN KEY \("userId"\) REFERENCES "User"\("id"\)/);
  assert.match(saved, /CHECK \(jsonb_typeof\("selections"\) = 'object'\)/);
  assert.match(sharedVariants, /ADD COLUMN "lineKey" VARCHAR\(80\)/);
  assert.match(
    sharedVariants,
    /CartItem_userId_productId_variantId_lineKey_key/,
  );
});
