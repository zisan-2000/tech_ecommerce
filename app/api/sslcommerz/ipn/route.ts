import { NextRequest, NextResponse } from "next/server";
import { processSslcommerzCallback } from "@/lib/sslcommerz";
import { revalidateStorefrontCatalog } from "@/lib/storefront-catalog-cache";

export async function POST(request: NextRequest) {
  try {
    const result = await processSslcommerzCallback(request, "ipn");
    revalidateStorefrontCatalog();
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    console.error("SSLCOMMERZ IPN ERROR:", error);
    return NextResponse.json({ ok: false, message: "IPN processing failed" }, { status: 500 });
  }
}
