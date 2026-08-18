import { PrismaClient } from "../generated/prisma";
import { seedStorefrontDemo } from "./seed-data/storefront";

const prisma = new PrismaClient();

seedStorefrontDemo(prisma)
  .catch((error) => {
    console.error("❌ Storefront demo seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
