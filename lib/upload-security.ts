import path from "path";
import { createHmac, timingSafeEqual } from "crypto";

export type UploadKind = "image" | "image-or-pdf" | "document" | "digital-asset";

const IMAGE_TYPES: Record<string, string[]> = {
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".webp": ["image/webp"],
  ".gif": ["image/gif"],
  ".avif": ["image/avif"],
};

const BLOCKED_ASSET_EXTENSIONS = new Set([
  ".bat",
  ".cmd",
  ".com",
  ".cjs",
  ".dll",
  ".exe",
  ".htm",
  ".html",
  ".jar",
  ".js",
  ".mjs",
  ".msi",
  ".php",
  ".ps1",
  ".scr",
  ".sh",
  ".svg",
]);

const DOCUMENT_TYPES: Record<string, string[]> = {
  ".csv": ["text/csv", "application/csv", "text/plain"],
  ".doc": ["application/msword", "application/octet-stream"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".pdf": ["application/pdf"],
  ".ppt": ["application/vnd.ms-powerpoint", "application/octet-stream"],
  ".pptx": ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ".txt": ["text/plain"],
  ".xls": ["application/vnd.ms-excel", "application/octet-stream"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
};

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function hasExpectedSignature(ext: string, bytes: Uint8Array) {
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case ".png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case ".webp":
      return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
    case ".gif":
      return ["GIF87a", "GIF89a"].includes(ascii(bytes, 0, 6));
    case ".avif":
      return ascii(bytes, 4, 4) === "ftyp" && ["avif", "avis"].includes(ascii(bytes, 8, 4));
    case ".pdf":
      return ascii(bytes, 0, 5) === "%PDF-";
    default:
      return true;
  }
}

function hasExpectedDocumentSignature(ext: string, bytes: Uint8Array) {
  if ([".docx", ".xlsx", ".pptx"].includes(ext)) {
    return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
  }
  if ([".doc", ".xls", ".ppt"].includes(ext)) {
    return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  }
  return hasExpectedSignature(ext, bytes);
}

export function validateUpload(params: {
  file: File;
  bytes: Uint8Array;
  kind: UploadKind;
  maxBytes?: number;
}) {
  const { file, bytes, kind } = params;
  const maxBytes = params.maxBytes ?? (kind === "digital-asset" ? 50 : 5) * 1024 * 1024;
  const ext = path.extname(file.name).toLowerCase();
  const mime = String(file.type || "").toLowerCase();

  if (!file.name || !ext || file.size === 0) {
    return { ok: false as const, error: "A non-empty file with an extension is required" };
  }
  if (file.size > maxBytes || bytes.byteLength > maxBytes) {
    return {
      ok: false as const,
      error: `File size must be ${Math.round(maxBytes / 1024 / 1024)}MB or less`,
    };
  }

  if (kind === "digital-asset") {
    if (BLOCKED_ASSET_EXTENSIONS.has(ext)) {
      return { ok: false as const, error: "This file type is not allowed" };
    }
    return { ok: true as const, extension: ext };
  }

  if (kind === "document") {
    const allowedMimes = DOCUMENT_TYPES[ext];
    if (!allowedMimes || !allowedMimes.includes(mime)) {
      return { ok: false as const, error: "This document type is not allowed" };
    }
    if (!hasExpectedDocumentSignature(ext, bytes)) {
      return { ok: false as const, error: "File content does not match its extension" };
    }
    return { ok: true as const, extension: ext };
  }

  const allowedMimes = IMAGE_TYPES[ext];
  const isPdf = kind === "image-or-pdf" && ext === ".pdf" && mime === "application/pdf";
  if ((!allowedMimes || !allowedMimes.includes(mime)) && !isPdf) {
    return {
      ok: false as const,
      error: kind === "image" ? "Only JPG, PNG, WebP, GIF or AVIF images are allowed" : "Only images or PDF files are allowed",
    };
  }
  if (!hasExpectedSignature(ext, bytes)) {
    return { ok: false as const, error: "File content does not match its extension" };
  }

  return { ok: true as const, extension: ext };
}

export function safeUploadFilename(originalName: string, extension: string) {
  const base = path
    .basename(originalName, path.extname(originalName))
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "file";
  return `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${base}${extension}`;
}

function uploadAccessSecret() {
  return process.env.NEXTAUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim() || null;
}

export function createUploadAccessToken(relPath: string, ttlMs = 15 * 60 * 1000) {
  const secret = uploadAccessSecret();
  if (!secret) return null;
  const expiresAt = Date.now() + ttlMs;
  const signature = createHmac("sha256", secret)
    .update(`${relPath}.${expiresAt}`)
    .digest("base64url");
  return `${expiresAt}.${signature}`;
}

export function verifyUploadAccessToken(relPath: string, token: unknown) {
  const secret = uploadAccessSecret();
  const raw = typeof token === "string" ? token.trim() : "";
  if (!secret || !raw) return false;
  const [expiresRaw, signature, ...extra] = raw.split(".");
  const expiresAt = Number(expiresRaw);
  if (extra.length > 0 || !signature || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return false;
  }
  const expected = createHmac("sha256", secret)
    .update(`${relPath}.${expiresAt}`)
    .digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
