import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("PC Builder raw-SQL tables are represented in the Prisma schema", async () => {
  const schema = await read("../prisma/pc-builder.prisma");

  for (const model of [
    "PcBuildCartItem",
    "PcBuildOrderItem",
    "PcBuilderSavedBuild",
  ]) {
    assert.match(schema, new RegExp(`model ${model}\\s*\\{`));
  }

  assert.match(schema, /buildId\s+String\s+@db\.VarChar\(64\)/);
  assert.match(schema, /slot\s+String\s+@db\.VarChar\(32\)/);
  assert.match(schema, /selectionHash\s+String\s+@db\.Char\(64\)/);
  assert.match(schema, /selections\s+Json/);
  assert.match(schema, /@@unique\(\[buildId, slot\]\)/);
  assert.match(schema, /@@unique\(\[userId, selectionHash\]\)/);
  assert.match(schema, /@@index\(\[userId, updatedAt\(sort: Desc\)\]\)/);
});

test("PC Builder tables are externally managed so migrations cannot recreate them", async () => {
  const config = await read("../prisma.config.ts");

  assert.match(config, /schema:\s*"prisma"/);
  assert.match(config, /externalTables:\s*true/);
  for (const table of [
    "public.PcBuildCartItem",
    "public.PcBuildOrderItem",
    "public.PcBuilderSavedBuild",
  ]) {
    assert.match(config, new RegExp(table.replaceAll(".", "\\.")));
  }
});

test("Prisma models mirror the already-deployed PC Builder migration tables", async () => {
  const [grouping, saved] = await Promise.all([
    read("../prisma/migrations/20260820_add_pc_build_grouping/migration.sql"),
    read("../prisma/migrations/20260820_add_pc_builder_saved_builds/migration.sql"),
  ]);

  assert.match(grouping, /CREATE TABLE "PcBuildCartItem"/);
  assert.match(grouping, /CREATE TABLE "PcBuildOrderItem"/);
  assert.match(saved, /CREATE TABLE "PcBuilderSavedBuild"/);
  assert.match(saved, /CHECK \(jsonb_typeof\("selections"\) = 'object'\)/);
});
