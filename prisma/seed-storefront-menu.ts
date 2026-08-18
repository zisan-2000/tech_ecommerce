import { PrismaClient } from "../generated/prisma";
import { seedStorefrontCategories } from "./seed-data/storefront";

const prisma = new PrismaClient();

seedStorefrontCategories(prisma)
  .then((categoryIds) => {
    console.log(
      `✅ Storefront menu categories ready: ${Object.keys(categoryIds).length}`,
    );
  })
  .catch((error) => {
    console.error("❌ Storefront menu category seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
