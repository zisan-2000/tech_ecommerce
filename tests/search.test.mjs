import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  compactModelToken,
  expandTechSynonyms,
  normalizeSearchQuery,
  parseSearchIntent,
  sanitizeSuggestionLimit,
} from "../lib/search/core.ts";

test("search normalization preserves useful model units and normalizes Bengali digits", () => {
  assert.equal(normalizeSearchQuery("  RTX4070   ১৬GB  "), "RTX 4070 16GB");
  assert.equal(compactModelToken("ROG-STRIX-B650E"), "rogstrixb650e");
});

test("tech synonyms support category language and Bangla aliases", () => {
  const gpu = expandTechSynonyms("best gpu");
  assert.ok(gpu.includes("graphics card"));
  assert.ok(gpu.includes("video card"));
  assert.ok(expandTechSynonyms("কিবোর্ড").includes("keyboard"));
});

test("natural-language price intent supports Bangladesh shopping phrases", () => {
  const english = parseSearchIntent("gaming laptop under 100k");
  assert.equal(english.searchText, "gaming laptop");
  assert.equal(english.maxPrice, 100_000);
  assert.equal(english.categorySlug, "laptop");

  const banglish = parseSearchIntent("monitor ৫০ হাজার er moddhe");
  assert.equal(banglish.searchText, "monitor");
  assert.equal(banglish.maxPrice, 50_000);
});

test("suggestion limits are bounded against abusive values", () => {
  assert.equal(sanitizeSuggestionLimit(-10), 1);
  assert.equal(sanitizeSuggestionLimit(500), 12);
  assert.equal(sanitizeSuggestionLimit("not-a-number"), 8);
});

test("header uses the dedicated debounced search API instead of downloading the catalog", async () => {
  const source = await readFile("components/ecommarce/header.tsx", "utf8");
  assert.match(source, /\/api\/search\/suggest\?q=/);
  assert.match(source, /AbortController/);
  assert.doesNotMatch(source, /fields=summary/);
  assert.match(source, /role="combobox"/);
  assert.match(source, /aria-activedescendant/);
});

test("search migration includes relevance indexes, analytics and transactional outbox", async () => {
  const migration = await readFile(
    "prisma/migrations/20260824_add_world_class_storefront_search/migration.sql",
    "utf8",
  );
  assert.match(migration, /CREATE EXTENSION IF NOT EXISTS pg_trgm/);
  assert.match(migration, /"searchVector" tsvector/);
  assert.match(migration, /CREATE TABLE "SearchEvent"/);
  assert.match(migration, /CREATE TABLE "SearchIndexOutbox"/);
  assert.match(migration, /search_product_outbox_variant/);
});

test("search event ingestion is rate limited and does not trust a client user id", async () => {
  const source = await readFile("app/api/search/events/route.ts", "utf8");
  assert.match(source, /rateLimitRequest/);
  assert.match(source, /getServerSession/);
  assert.doesNotMatch(source, /userId:\s*sanitizeSearchEventText\(body/);
});
