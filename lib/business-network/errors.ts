import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { BusinessNetworkError } from "./business-error";

export { BusinessNetworkError } from "./business-error";

export function businessApiErrorResponse(error: unknown) {
  if (error instanceof BusinessNetworkError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
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
      { status: 422 },
    );
  }
  console.error("Business portal request failed", error);
  return NextResponse.json(
    { error: "The business service could not complete this request.", code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}
