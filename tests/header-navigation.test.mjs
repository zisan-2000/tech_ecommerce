import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("header shortcuts describe their real destinations", async () => {
  const header = await read("components/ecommarce/header.tsx");

  for (const contract of [
    ['label: "Flash Sale"', 'href: "/ecommerce/flash-sale"'],
    ['label: "Compare"', 'href: "/ecommerce/compare"'],
    ['label: "PC Builder"', 'href: "/ecommerce/pc-builder"'],
  ]) {
    assert.match(header, new RegExp(contract[0].replace(/[?]/g, "\\?")));
    assert.match(header, new RegExp(contract[1].replace(/[?]/g, "\\?")));
  }

  assert.doesNotMatch(header, /<span>Offers<\/span>|<span>Tools<\/span>/);
  assert.doesNotMatch(header, /href="\/ecommerce\/products\?featured=1"/);
});

test("desktop and mobile render the same shortcut contract", async () => {
  const header = await read("components/ecommarce/header.tsx");
  const renderCount = header.match(/HEADER_SHOP_ACTIONS\.map/g)?.length ?? 0;

  assert.equal(renderCount, 2);
  assert.match(header, /aria-labelledby="mobile-shop-shortcuts-heading"/);
  assert.match(header, /onClick=\{\(\) => setMobileMenuOpen\(false\)\}/);
  assert.doesNotMatch(
    header,
    /<Link href="\/ecommerce\/products">[\s\S]{0,500}Flash Sale/,
  );
});

test("shortcut destination pages exist", async () => {
  await Promise.all([
    access(new URL("app/ecommerce/flash-sale/page.tsx", root)),
    access(new URL("app/ecommerce/compare/page.tsx", root)),
    access(new URL("app/ecommerce/pc-builder/page.tsx", root)),
  ]);
});
