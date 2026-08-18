import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function loadLocalEnvironment() {
  if (!fs.existsSync(".env")) return;
  const rows = fs.readFileSync(".env", "utf8").split(/\r?\n/);
  for (const row of rows) {
    const match = row.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadLocalEnvironment();

const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();
const DISCOUNTS = [18, 15, 22, 12, 20, 16, 25, 14];
const END_AFTER_HOURS = [28, 52, 76, 32, 56, 80, 40, 64];

function salePrice(basePrice, discountPercent) {
  return Math.max(0.01, Math.round(basePrice * (1 - discountPercent / 100) * 100) / 100);
}

async function main() {
  const candidates = await prisma.product.findMany({
    where: {
      deleted: false,
      available: true,
      type: { in: ["PHYSICAL", "BUNDLE"] },
      basePrice: { gt: 0 },
      image: { not: null },
    },
    orderBy: [{ featured: "desc" }, { soldCount: "desc" }, { id: "asc" }],
    take: 30,
    select: {
      id: true,
      name: true,
      basePrice: true,
      variants: {
        where: { active: true },
        select: { stock: true },
      },
    },
  });

  const selected = candidates
    .filter((product) =>
      product.variants.length === 0
        ? true
        : product.variants.some((variant) => variant.stock > 0),
    )
    .slice(0, DISCOUNTS.length);

  if (selected.length < 4) {
    throw new Error(
      `At least 4 eligible products are required; found ${selected.length}`,
    );
  }

  const now = new Date();
  const startsAt = new Date(now.getTime() - 15 * 60 * 1000);
  const configured = await prisma.$transaction(
    selected.map((product, index) => {
      const regularPrice = Number(product.basePrice);
      return prisma.product.update({
        where: { id: product.id },
        data: {
          flashSaleEnabled: true,
          flashSalePrice: salePrice(regularPrice, DISCOUNTS[index]),
          flashSaleStartsAt: startsAt,
          flashSaleEndsAt: new Date(
            now.getTime() + END_AFTER_HOURS[index] * 60 * 60 * 1000,
          ),
          flashSaleSortOrder: index,
        },
        select: {
          id: true,
          name: true,
          basePrice: true,
          flashSalePrice: true,
          flashSaleEndsAt: true,
        },
      });
    }),
  );

  console.log(`Configured ${configured.length} live flash-sale products:`);
  for (const product of configured) {
    console.log(
      `- #${product.id} ${product.name}: ${Number(product.basePrice)} -> ${Number(product.flashSalePrice)} (ends ${product.flashSaleEndsAt.toISOString()})`,
    );
  }
}

main()
  .catch((error) => {
    console.error("Flash-sale seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
