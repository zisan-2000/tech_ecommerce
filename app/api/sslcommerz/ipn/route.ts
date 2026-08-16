import { NextRequest, NextResponse } from "next/server";
import { processSslcommerzCallback } from "@/lib/sslcommerz";

export async function POST(request: NextRequest) {
  try {
    const result = await processSslcommerzCallback(request, "ipn");
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    console.error("SSLCOMMERZ IPN ERROR:", error);
    return NextResponse.json({ ok: false, message: "IPN processing failed" }, { status: 500 });
  }
}
