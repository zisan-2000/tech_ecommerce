import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  canonicalPcBuilderSavedSelections,
  isPcBuilderSavedBuildId,
  isPcBuilderShareToken,
  normalizePcBuilderSavedBuildName,
  parsePcBuilderSavedExtraItems,
  parsePcBuilderSavedSelections,
  serializePcBuilderSavedSelections,
} from "../lib/pc-builder-saved-build.ts";

test("saved build selections accept only known PC Builder slots", () => {
  assert.deepEqual(parsePcBuilderSavedSelections({ processor: "10-100", motherboard: "11-101" }), { processor: "10-100", motherboard: "11-101" });
  assert.equal(parsePcBuilderSavedSelections({ attacker: "10-100" }), null);
  assert.equal(parsePcBuilderSavedSelections({ processor: "10" }), null);
  assert.equal(parsePcBuilderSavedSelections({}), null);
});

test("saved selection serialization is stable across object insertion order", () => {
  const a = { motherboard: "11-101", processor: "10-100" };
  const b = { processor: "10-100", motherboard: "11-101" };
  assert.equal(canonicalPcBuilderSavedSelections(a), canonicalPcBuilderSavedSelections(b));
  assert.equal(serializePcBuilderSavedSelections(a), "processor:10-100,motherboard:11-101");
});

test("saved extra items accept only known slots and reject malformed input", () => {
  assert.deepEqual(parsePcBuilderSavedExtraItems(undefined), {});
  assert.deepEqual(parsePcBuilderSavedExtraItems(null), {});
  assert.deepEqual(parsePcBuilderSavedExtraItems({}), {});
  assert.deepEqual(
    parsePcBuilderSavedExtraItems({ memory: ["10-100", "11-101"] }),
    { memory: ["10-100", "11-101"] },
  );
  assert.equal(parsePcBuilderSavedExtraItems({ attacker: ["10-100"] }), null);
  assert.equal(parsePcBuilderSavedExtraItems({ memory: "10-100" }), null);
  assert.equal(parsePcBuilderSavedExtraItems({ memory: ["not-an-id"] }), null);
  assert.deepEqual(
    parsePcBuilderSavedExtraItems({ memory: ["10-100", "10-100"] }),
    { memory: ["10-100", "10-100"] },
    "duplicate selectionIds represent multiple physical units",
  );
  assert.equal(
    parsePcBuilderSavedExtraItems({ memory: Array.from({ length: 9 }, (_, i) => `${i + 1}-${i + 1}`) }),
    null,
    "more than 8 extra items in one slot must be rejected",
  );
});

test("saved selection serialization includes extra items with an x: prefix", () => {
  const selections = { processor: "10-100" };
  const extraItems = { memory: ["11-101", "12-102"] };
  const serialized = serializePcBuilderSavedSelections(selections, extraItems);
  assert.equal(serialized, "processor:10-100,x:memory:11-101,x:memory:12-102");
});

test("canonical selections differ when extra items differ", () => {
  const selections = { processor: "10-100" };
  assert.notEqual(
    canonicalPcBuilderSavedSelections(selections, { memory: ["11-101"] }),
    canonicalPcBuilderSavedSelections(selections, {}),
  );
});

test("saved build identifiers use opaque bounded formats", () => {
  assert.equal(isPcBuilderSavedBuildId(`pcbs_${"a".repeat(32)}`), true);
  assert.equal(isPcBuilderSavedBuildId("pcbs_short"), false);
  assert.equal(isPcBuilderShareToken(`pcshare_${"b".repeat(48)}`), true);
  assert.equal(isPcBuilderShareToken("pcshare_public"), false);
});

test("saved build names are normalized and bounded", () => {
  assert.equal(normalizePcBuilderSavedBuildName("  My   Gaming   PC  "), "My Gaming PC");
  assert.equal(normalizePcBuilderSavedBuildName(""), "My PC Build");
  assert.equal(normalizePcBuilderSavedBuildName("x".repeat(100)).length, 80);
});

test("saved-build persistence is user-owned, deduplicated and share-token based", async () => {
  const store = await readFile(new URL("../lib/pc-builder-saved-build-store.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../prisma/migrations/20260820_add_pc_builder_saved_builds/migration.sql", import.meta.url), "utf8");
  assert.match(store, /validatePcBuilderSelectionLive/);
  assert.match(store, /selectionHash/);
  assert.match(store, /MAX_SAVED_BUILDS_PER_USER = 25/);
  assert.match(migration, /PcBuilderSavedBuild/);
  assert.match(migration, /shareToken/);
  assert.match(migration, /userId_selectionHash_key/);
  assert.match(migration, /REFERENCES "User"\("id"\)/);
});

test("saved-build API requires authentication and restores live DB products", async () => {
  const route = await readFile(new URL("../app/api/pc-builder/builds/route.ts", import.meta.url), "utf8");
  const itemRoute = await readFile(new URL("../app/api/pc-builder/builds/[id]/route.ts", import.meta.url), "utf8");
  assert.match(route, /getServerSession\(authOptions\)/);
  assert.match(route, /savePcBuilderBuild/);
  assert.match(route, /rateLimitRequest/);
  assert.match(itemRoute, /getOwnedPcBuilderSavedBuild/);
  assert.match(itemRoute, /deletePcBuilderSavedBuild/);
});

test("shared and legacy saved builds are restored server-side beyond the top-40 catalog", async () => {
  const page = await readFile(new URL("../app/ecommerce/pc-builder/page.tsx", import.meta.url), "utf8");
  const controls = await readFile(new URL("../components/ecommarce/pc-builder/PcBuilderSavedBuildControls.tsx", import.meta.url), "utf8");
  assert.match(page, /getSharedPcBuilderSavedBuild/);
  assert.match(page, /validatePcBuilderSelectionLive/);
  assert.match(page, /mergeLiveSelectionIntoCatalog/);
  assert.match(page, /redirect\(/);
  assert.match(controls, /PC_BUILDER_STORAGE_KEY/);
  assert.match(controls, /\/api\/pc-builder\/builds/);
  assert.match(controls, /serializePcBuilderSavedSelections/);
});
