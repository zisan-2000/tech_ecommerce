import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const themeControlFiles = [
  "components/theme-switcher.tsx",
  "components/ui/theme-switcher.tsx",
  "components/ecommarce/mode-toggle.tsx",
  "components/ecommarce/header.tsx",
  "components/admin/Header.tsx",
  "components/investor/InvestorNav.tsx",
  "components/investor/InvestorLayoutClient.tsx",
];

test("global theme provider exposes only light and dark", async () => {
  const provider = await read("providers/theme-provider.tsx");
  const layout = await read("app/layout.tsx");

  assert.match(provider, /SUPPORTED_THEMES\s*=\s*\["light",\s*"dark"\]/);
  assert.match(provider, /enableSystem=\{false\}/);
  assert.match(provider, /defaultTheme="light"/);
  assert.match(provider, /id="theme-contract-migration"/);
  assert.doesNotMatch(
    layout,
    /themes=\{\[[^\]]*(?:green|plum|steel|olive|rose|system)/,
  );
});

test("all theme controls are restricted to light and dark", async () => {
  const source = (
    await Promise.all(themeControlFiles.map((path) => read(path)))
  ).join("\n");

  assert.doesNotMatch(
    source,
    /setTheme\(["'](?:system|green|plum|steel-blue|olive|rose)["']\)/,
  );
  assert.doesNotMatch(
    source,
    /value:\s*["'](?:system|green|plum|steel-blue|olive|rose)["']/,
  );
});

test("CSS and Tailwind use a two-theme class contract", async () => {
  const [globals, tailwind, productPage] = await Promise.all([
    read("app/globals.css"),
    read("tailwind.config.ts"),
    read("app/ecommerce/products/[id]/page.tsx"),
  ]);

  assert.match(globals, /:root\s*\{/);
  assert.match(globals, /\.dark\s*\{/);
  assert.doesNotMatch(
    globals,
    /\.(?:theme-(?:green|plum|steel|olive|rose)|green|plum|steel|olive|rose)\s*[,\{]/,
  );
  assert.match(tailwind, /darkMode:\s*\["class"\]/);
  assert.doesNotMatch(productPage, /product-detail-light|color-scheme:light/);
});
