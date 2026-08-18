import { NextRequest, NextResponse } from "next/server";
import { getPublicBaseUrl, processSslcommerzCallback } from "@/lib/sslcommerz";
import { revalidateStorefrontCatalog } from "@/lib/storefront-catalog-cache";

async function handle(request: NextRequest) {
  const result = await processSslcommerzCallback(request, "success");
  revalidateStorefrontCatalog();
  const url = new URL("/ecommerce/payment-result", getPublicBaseUrl(request));
  url.searchParams.set("status", result.ok ? "success" : "failed");
  url.searchParams.set("message", result.message);
  if (result.orderId) url.searchParams.set("orderId", String(result.orderId));
  return NextResponse.redirect(url, 303);
}

export const POST = handle;
export const GET = handle;
