import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import {
  isExpectedProductVersion,
  parseProductAvailabilityPatch,
} from "@/lib/product-availability";
import { validatePcBuilderProductForActivation } from "@/lib/pc-builder-publish-validation";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

export { DELETE, GET, PUT } from "./route-core";
import { PATCH as corePatch } from "./route-core";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
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

  const { id: idParam } = await ctx.params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
  }

  let requestBody: unknown;
  try {
    requestBody = await req.json();
  } catch {
    return NextResponse.json(
      { error: "A valid JSON body is required" },
      { status: 400 },
    );
  }

  const parsed = parseProductAvailabilityPatch(requestBody);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const existing = await prisma.product.findFirst({
    where: { id, deleted: false },
    include: {
      category: true,
      attributes: {
        include: { attribute: true },
      },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  if (!isExpectedProductVersion(existing.updatedAt, parsed.value.expectedUpdatedAt)) {
    return NextResponse.json(
      {
        error:
          "This product changed after the page was loaded. Latest product data has been reloaded; review it and try again.",
      },
      { status: 409 },
    );
  }

  if (parsed.value.available && existing.category.deleted) {
    return NextResponse.json(
      {
        error:
          "This product cannot be activated because its category is inactive",
      },
      { status: 409 },
    );
  }

  if (parsed.value.available && !existing.available) {
    const readiness = validatePcBuilderProductForActivation(existing);
    if (readiness.applies && !readiness.ok) {
      return NextResponse.json(
        {
          error: `Cannot activate this PC Builder product: ${readiness.issues
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
  }

  const forwarded = new Request(req.url, {
    method: "PATCH",
    headers: req.headers,
    body: JSON.stringify(requestBody),
  });
  return corePatch(forwarded, ctx);
}
