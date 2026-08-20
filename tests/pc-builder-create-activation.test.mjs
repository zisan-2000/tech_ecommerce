import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("active PC Builder products are validated before create-time delegation", async () => {
  const route = await readFile(
    new URL("../app/api/products/route.ts", import.meta.url),
    "utf8",
  );
  const core = await readFile(
    new URL("../app/api/products/route-core.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /validatePcBuilderProductForActivation/);
  assert.match(route, /body\.available === false/);
  assert.match(route, /PC_BUILDER_SPECS_INCOMPLETE/);
  assert.match(route, /return corePOST\(requestForCore\)/);
  assert.match(core, /available:\s*body\.available \?\? true/);
});

test("create-time PC Builder gate resolves category and attribute names from trusted database rows", async () => {
  const route = await readFile(
    new URL("../app/api/products/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /prisma\.category\.findUnique/);
  assert.match(route, /prisma\.attribute\.findMany/);
  assert.match(route, /parseProductAttributeInput/);
  assert.match(route, /nameById/);
});
