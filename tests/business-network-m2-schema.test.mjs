import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("M2 preserves the canonical single Prisma schema", async () => {
  const schema = await read("../prisma/schema.prisma");
  await assert.rejects(
    access(new URL("../prisma/business-network.prisma", import.meta.url)),
  );
  assert.match(schema, /organizationMemberships\s+OrganizationMember\[\]/);
  assert.match(
    schema,
    /model OrganizationMember\s*\{[\s\S]*user\s+User\s+@relation\(fields: \[userId\], references: \[id\], onDelete: Cascade\)/,
  );
  const accessScope = schema.match(/enum AccessScopeType\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(accessScope, /GLOBAL/);
  assert.match(accessScope, /WAREHOUSE/);
  assert.doesNotMatch(accessScope, /ORGANIZATION/);
});

test("M2 forward migration fails on orphans and only adds the User foreign key", async () => {
  const migration = await read(
    "../prisma/migrations/20260826_add_organization_member_user_fk/migration.sql",
  );
  assert.match(migration, /IF EXISTS[\s\S]*LEFT JOIN "User"[\s\S]*RAISE EXCEPTION/);
  assert.match(
    migration,
    /OrganizationMember_userId_fkey[\s\S]*FOREIGN KEY \("userId"\)[\s\S]*REFERENCES "User"\("id"\)[\s\S]*ON DELETE CASCADE/,
  );
  assert.doesNotMatch(migration, /CREATE TABLE|DROP TABLE|DELETE FROM|UPDATE\s+"/i);
  const alteredTables = [...migration.matchAll(/ALTER TABLE\s+"([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(alteredTables, ["OrganizationMember"]);
});

test("M2 invitation persistence has only a token hash and keeps PC Builder external tables", async () => {
  const [schema, prismaConfig] = await Promise.all([
    read("../prisma/schema.prisma"),
    read("../prisma.config.ts"),
  ]);
  const invitationModel =
    schema.match(/model OrganizationInvitation\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(invitationModel, /tokenHash\s+String\s+@unique/);
  assert.doesNotMatch(invitationModel, /^\s*token\s+/m);
  for (const table of ["PcBuildCartItem", "PcBuildOrderItem", "PcBuilderSavedBuild"]) {
    assert.match(prismaConfig, new RegExp(`public\\.${table}`));
  }
});

test("M2 member DELETE contract performs a guarded soft removal", async () => {
  const route = await read(
    "../app/api/business/organization/members/[memberId]/route.ts",
  );
  assert.match(route, /export async function DELETE/);
  assert.match(route, /assertSameOriginBusinessMutation\(request\)/);
  assert.match(route, /requireBusinessPermission\("organization\.members\.manage"\)/);
  assert.match(route, /updateOrganizationMemberStatus\(\{/);
  assert.match(route, /status: "REMOVED"/);
  assert.doesNotMatch(route, /organizationMember\.delete/);
});
