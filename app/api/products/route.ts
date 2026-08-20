import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import { parseProductAttributeInput } from "@/lib/product-attribute-input";
import { validatePcBuilderProductForActivation } from "@/lib/pc-builder-publish-validation";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { GET as coreGET, POST as corePOST } from "./route-core";

export { coreGET as GET };

export async function POST(request: Request) {
  const requestForCore = request.clone();

  const session = await getServerSession(authOptions);
  const access = await getAccessContext(
    session?.user as { id?: string; role?: string } | undefined,
  );
  if (!access.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!access.has("products.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
  } catch {
    return corePOST(requestForCore);
  }

  // Product creation defaults to available=true in the existing core route.
  // Draft/inactive creation remains allowed; only an active PC Builder product
  // must prove its required compatibility metadata before it can be created.
  if (body.available === false) {
    return corePOST(requestForCore);
  }

  const categoryId = Number(body.categoryId);
  if (!Number.isInteger(categoryId) || categoryId < 1) {
    return corePOST(requestForCore);
  }

  const parsedAttributes = parseProductAttributeInput(body.productAttributes ?? []);
  if (!parsedAttributes.ok) {
    return corePOST(requestForCore);
  }

  const attributeIds = parsedAttributes.value.map((item) => item.attributeId);
  const [category, attributes] = await Promise.all([
    prisma.category.findUnique({
      where: { id: categoryId },
      select: { slug: true },
    }),
    attributeIds.length
      ? prisma.attribute.findMany({
          where: { id: { in: attributeIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as Array<{ id: number; name: string }>),
  ]);

  if (!category || attributes.length !== attributeIds.length) {
    return corePOST(requestForCore);
  }

  const nameById = new Map(attributes.map((item) => [item.id, item.name]));
  const readiness = validatePcBuilderProductForActivation({
    id: 0,
    name: String(body.name ?? "New product"),
    category,
    attributes: parsedAttributes.value.map((item) => ({
      value: item.value,
      attribute: { name: nameById.get(item.attributeId) ?? "" },
    })),
  });

  if (readiness.applies && !readiness.ok) {
    return NextResponse.json(
      {
        error: `Cannot create an active PC Builder product: ${readiness.issues
          .map((item) => item.message)
          .join(" ")}`,
        code: "PC_BUILDER_SPECS_INCOMPLETE",
        pcBuilderSlot: readiness.slot,
        issues: readiness.issues.map((item) => ({
          code: item.code,
          message: item.message,
        })),
      },
      { status: 409 },
    );
  }

  return corePOST(requestForCore);
}
