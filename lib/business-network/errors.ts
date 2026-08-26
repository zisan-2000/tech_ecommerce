import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma";
import { BusinessNetworkError } from "./business-error";

export { BusinessNetworkError } from "./business-error";

export function businessApiErrorResponse(error: unknown) {
  if (error instanceof BusinessNetworkError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Request validation failed.",
        code: "VALIDATION_ERROR",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 422, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "A business record with the same unique value already exists.", code: "BUSINESS_DUPLICATE" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (error.code === "P2003") {
      return NextResponse.json(
        { error: "The referenced business record is not available.", code: "BUSINESS_REFERENCE_CONFLICT" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (error.code === "P2025") {
      return NextResponse.json(
        { error: "Business resource not found.", code: "BUSINESS_RESOURCE_NOT_FOUND" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
  }
  console.error("Business network request failed", error);
  return NextResponse.json(
    { error: "The business service could not complete this request.", code: "INTERNAL_ERROR" },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}
