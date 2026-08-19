import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

type LegacyProductPageProps = {
  params: Promise<{ identifier: string }>;
};

export default async function LegacyProductPage({
  params,
}: LegacyProductPageProps) {
  const { identifier } = await params;
  const normalized = decodeURIComponent(identifier).trim();
  const numericId = /^\d+$/.test(normalized) ? Number(normalized) : null;

  const product = await prisma.product.findFirst({
    where: {
      deleted: false,
      ...(numericId
        ? { id: numericId }
        : { slug: normalized.toLowerCase() }),
    },
    select: { id: true },
  });

  if (!product) notFound();
  permanentRedirect(`/ecommerce/products/${product.id}`);
}

