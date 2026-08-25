import "server-only";

import { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";

export async function runSerializableTransaction<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await db.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === maxAttempts) throw error;
    }
  }
  throw new Error("Serializable transaction retry limit reached.");
}
