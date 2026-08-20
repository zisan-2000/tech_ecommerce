import type { PrismaConfig } from "prisma";

export default {
  schema: "prisma",
  migrations: {
    path: "prisma/migrations",
    seed: 'ts-node --compiler-options {"module":"CommonJS"} prisma/seed.ts',
  },
  experimental: {
    externalTables: true,
  },
  tables: {
    external: [
      "public.CartItem",
      "public.PcBuildCartItem",
      "public.PcBuildOrderItem",
      "public.PcBuilderSavedBuild",
    ],
  },
} satisfies PrismaConfig;
