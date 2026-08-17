// app/api/upload/route.ts
import { NextResponse } from "next/server";
import { rateLimitRequest } from "@/lib/request-security";
import { safeUploadFilename, validateUpload } from "@/lib/upload-security";
import { storeUpload } from "@/lib/upload-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // This endpoint doesn't serve files directly, use /api/upload/[...slug] instead
    return NextResponse.json(
      { error: "Use /api/upload/[...slug] to retrieve files" },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch file" },
      { status: 404 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const rateLimit = await rateLimitRequest(request, {
      scope: "general-upload",
      limit: 12,
      windowMs: 10 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many uploads. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const validation = validateUpload({
      file,
      bytes: buffer,
      kind: "image-or-pdf",
      maxBytes: 5 * 1024 * 1024,
    });
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const filename = safeUploadFilename(file.name, validation.extension);
    await storeUpload({
      relPath: `general/${filename}`,
      data: buffer,
      contentType: file.type,
    });

    // Return an API URL so files are served dynamically after build/deploy.
    // Note: this does not rely on the build output including the uploaded file.
    const fileUrl = `/api/upload/general/${filename}`;
    
    return NextResponse.json({
      success: true,
      fileUrl,
      url: fileUrl,
      message: "File uploaded successfully",
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
