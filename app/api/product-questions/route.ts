import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicJson } from "@/lib/public-cache";
import { getAccessContext } from "@/lib/rbac";
import { rateLimitRequest } from "@/lib/request-security";

export async function GET(request: Request) {
  try {
    const productId = Number(new URL(request.url).searchParams.get("productId"));
    if (!Number.isInteger(productId) || productId < 1) {
      return NextResponse.json({ error: "A valid productId is required" }, { status: 400 });
    }

    const questions = await prisma.productQuestion.findMany({
      where: { productId, product: { available: true, deleted: false } },
      take: 50,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        question: true,
        answer: true,
        createdAt: true,
        answeredAt: true,
        user: { select: { name: true } },
        answeredBy: { select: { name: true } },
      },
    });

    return publicJson({ questions }, { maxAge: 15, staleWhileRevalidate: 60 });
  } catch (error) {
    console.error("PRODUCT QUESTION GET ERROR:", error);
    return NextResponse.json({ error: "Failed to load product questions" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rateLimit = await rateLimitRequest(request, {
      scope: "product-question-create",
      limit: 5,
      windowMs: 10 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many questions. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } },
      );
    }

    const body = await request.json().catch(() => null);
    const productId = Number(body?.productId);
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!Number.isInteger(productId) || productId < 1 || question.length < 5 || question.length > 500) {
      return NextResponse.json(
        { error: "Enter a question between 5 and 500 characters." },
        { status: 400 },
      );
    }

    const product = await prisma.product.findFirst({
      where: { id: productId, available: true, deleted: false },
      select: { id: true },
    });
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const created = await prisma.productQuestion.create({
      data: { productId, userId, question },
      select: { id: true, question: true, answer: true, createdAt: true },
    });
    return NextResponse.json(created, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("PRODUCT QUESTION POST ERROR:", error);
    return NextResponse.json({ error: "Failed to submit product question" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!access.has("products.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const id = Number(body?.id);
    const answer = typeof body?.answer === "string" ? body.answer.trim() : "";
    if (!Number.isInteger(id) || id < 1 || answer.length < 2 || answer.length > 2_000) {
      return NextResponse.json(
        { error: "Enter an answer between 2 and 2000 characters." },
        { status: 400 },
      );
    }

    const existing = await prisma.productQuestion.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Question not found" }, { status: 404 });

    const updated = await prisma.productQuestion.update({
      where: { id },
      data: { answer, answeredAt: new Date(), answeredById: access.userId },
      select: { id: true, answer: true, answeredAt: true },
    });
    return NextResponse.json(updated, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("PRODUCT QUESTION PATCH ERROR:", error);
    return NextResponse.json({ error: "Failed to answer product question" }, { status: 500 });
  }
}
