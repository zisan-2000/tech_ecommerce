import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import path from "path";
import fs from "fs/promises";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidateStorefrontCatalog } from "@/lib/storefront-catalog-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const publicRoot = path.join(process.cwd(), "public");
const imageExtensions = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
]);

type GalleryAccess = {
  userId: string | null;
  has: (permission: string) => boolean;
  hasAny: (permissions: string[]) => boolean;
};

type GalleryImage = {
  name: string;
  folder: string;
  path: string;
  url: string;
  size: number;
  updatedAt: string;
  extension: string;
};

type GalleryScanResult = {
  folders: Set<string>;
  images: GalleryImage[];
};

type ImageUsageRef = {
  entity: "sitesettings" | "banner" | "brand" | "product" | "variant";
  id: string | number;
  field: string;
};

type GalleryCacheEntry = {
  at: number;
  images: GalleryImage[];
  folders: string[];
};

const CACHE_TTL_MS = 30_000;
const galleryCache = new Map<string, GalleryCacheEntry>();

function replaceStringsDeep(value: unknown, fromValues: string[], toValue: string): unknown {
  if (typeof value === "string") {
    return fromValues.includes(value) ? toValue : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceStringsDeep(item, fromValues, toValue));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceStringsDeep(item, fromValues, toValue),
      ]),
    );
  }

  return value;
}

function isImageFile(filename: string) {
  return imageExtensions.has(path.extname(filename).toLowerCase());
}

function toPosixPath(value: string) {
  return value.split(path.sep).join("/");
}

function toPublicUrl(relPath: string) {
  const cleanPath = toPosixPath(relPath).replace(/^\/+/, "");

  if (cleanPath.startsWith("upload/")) {
    return `/api/${cleanPath}`;
  }

  return `/${cleanPath}`;
}

function toCandidateUrls(relPath: string) {
  const clean = toPosixPath(relPath).replace(/^\/+/, "");
  if (!clean) return [] as string[];

  // Stored values vary across the app. Support both direct public paths and the upload proxy.
  if (clean.startsWith("upload/")) {
    return [`/api/${clean}`, `/${clean}`];
  }

  return [`/${clean}`];
}

async function getImageUsage(relPath: string): Promise<ImageUsageRef[]> {
  const candidates = toCandidateUrls(relPath);
  if (candidates.length === 0) return [];

  const refs: ImageUsageRef[] = [];

  const [siteSettings, banners, brands, products, variantsColor, variantsMeta] =
    await Promise.all([
      prisma.sitesettings.findFirst({
        where: { logo: { in: candidates } },
        select: { id: true },
      }),
      prisma.banner.findMany({
        where: {
          OR: [{ image: { in: candidates } }, { mobileImage: { in: candidates } }],
        },
        select: { id: true, image: true, mobileImage: true },
        take: 20,
      }),
      prisma.brand.findMany({
        where: { logo: { in: candidates } },
        select: { id: true },
        take: 20,
      }),
      prisma.product.findMany({
        where: {
          OR: [{ image: { in: candidates } }, { gallery: { hasSome: candidates } }],
        },
        select: { id: true, image: true, gallery: true },
        take: 50,
      }),
      prisma.productVariant.findMany({
        where: { colorImage: { in: candidates } },
        select: { id: true },
        take: 50,
      }),
      // Fallback: scan JSON options as text for candidate URLs. This is slower but safer for deletes.
      prisma.$queryRaw<Array<{ id: number }>>`
        SELECT id
        FROM "ProductVariant"
        WHERE options::text ILIKE ANY(ARRAY[${candidates.map((c) => `%${c}%`)}])
        LIMIT 50
      `,
    ]);

  if (siteSettings) {
    refs.push({ entity: "sitesettings", id: siteSettings.id, field: "logo" });
  }

  for (const banner of banners) {
    if (banner.image && candidates.includes(banner.image)) {
      refs.push({ entity: "banner", id: banner.id, field: "image" });
    }
    if (banner.mobileImage && candidates.includes(banner.mobileImage)) {
      refs.push({ entity: "banner", id: banner.id, field: "mobileImage" });
    }
  }

  for (const brand of brands) {
    refs.push({ entity: "brand", id: brand.id, field: "logo" });
  }

  for (const product of products) {
    if (product.image && candidates.includes(product.image)) {
      refs.push({ entity: "product", id: product.id, field: "image" });
    }
    if (Array.isArray(product.gallery) && product.gallery.some((g) => candidates.includes(g))) {
      refs.push({ entity: "product", id: product.id, field: "gallery" });
    }
  }

  for (const variant of variantsColor) {
    refs.push({ entity: "variant", id: variant.id, field: "colorImage" });
  }

  for (const variant of variantsMeta) {
    refs.push({ entity: "variant", id: variant.id, field: "options.__meta" });
  }

  return refs;
}

async function updateImageReferences(oldRelPath: string, newRelPath: string) {
  const oldUrls = toCandidateUrls(oldRelPath);
  const newPrimaryUrl = toPublicUrl(newRelPath);

  await prisma.sitesettings.updateMany({
    where: { logo: { in: oldUrls } },
    data: { logo: newPrimaryUrl },
  });

  const banners = await prisma.banner.findMany({
    where: {
      OR: [{ image: { in: oldUrls } }, { mobileImage: { in: oldUrls } }],
    },
    select: { id: true, image: true, mobileImage: true },
  });

  for (const banner of banners) {
    await prisma.banner.update({
      where: { id: banner.id },
      data: {
        image: banner.image && oldUrls.includes(banner.image) ? newPrimaryUrl : banner.image,
        mobileImage:
          banner.mobileImage && oldUrls.includes(banner.mobileImage)
            ? newPrimaryUrl
            : banner.mobileImage,
      },
    });
  }

  await prisma.brand.updateMany({
    where: { logo: { in: oldUrls } },
    data: { logo: newPrimaryUrl },
  });

  const products = await prisma.product.findMany({
    where: {
      OR: [{ image: { in: oldUrls } }, { gallery: { hasSome: oldUrls } }],
    },
    select: { id: true, image: true, gallery: true },
  });

  for (const product of products) {
    await prisma.product.update({
      where: { id: product.id },
      data: {
        image: product.image && oldUrls.includes(product.image) ? newPrimaryUrl : product.image,
        gallery: Array.isArray(product.gallery)
          ? product.gallery.map((item) =>
              typeof item === "string" && oldUrls.includes(item) ? newPrimaryUrl : item,
            )
          : product.gallery,
      },
    });
  }

  await prisma.productVariant.updateMany({
    where: { colorImage: { in: oldUrls } },
    data: { colorImage: newPrimaryUrl },
  });

  const variantsMeta = await prisma.$queryRaw<Array<{ id: number; options: unknown }>>`
    SELECT id, options
    FROM "ProductVariant"
    WHERE options::text ILIKE ANY(ARRAY[${oldUrls.map((u) => `%${u}%`)}])
  `;

  for (const variant of variantsMeta) {
    const nextOptions = replaceStringsDeep(variant.options, oldUrls, newPrimaryUrl);
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { options: nextOptions as any },
    });
  }
}

function normalizeRelImagePath(value: unknown) {
  const relPath = String(value || "")
    .replace(/^\/+/, "")
    .replace(/^api\/upload\//, "upload/")
    .replace(/\\/g, "/");

  if (!relPath || relPath.includes("..") || !isImageFile(relPath)) {
    return "";
  }

  return relPath;
}

function normalizeFolder(value: string | null) {
  const folder = (value || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

  if (!folder || folder === "all") {
    return "";
  }

  if (folder.includes("..")) {
    throw new Error("Invalid folder");
  }

  return folder;
}

function resolveInsidePublic(relPath: string) {
  const target = path.resolve(publicRoot, relPath);
  const root = path.resolve(publicRoot);

  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error("Path is outside public directory");
  }

  return target;
}

async function requireGalleryAccess(): Promise<GalleryAccess | NextResponse> {
  const session = await getServerSession(authOptions);
  const access = await getAccessContext(
    session?.user as { id?: string; role?: string } | undefined,
  );

  if (!access.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!access.has("settings.manage") && !access.has("gallery.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return access as GalleryAccess;
}

async function readImages(
  baseDir: string,
  baseRelPath: string,
): Promise<GalleryScanResult> {
  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  const images = [];
  const folders = new Set<string>();

  for (const entry of entries) {
    const relPath = baseRelPath ? `${baseRelPath}/${entry.name}` : entry.name;
    const fullPath = path.join(baseDir, entry.name);

    if (entry.isDirectory()) {
      folders.add(toPosixPath(relPath));
      const nested: GalleryScanResult = await readImages(fullPath, relPath);
      nested.folders.forEach((nestedFolder: string) =>
        folders.add(nestedFolder),
      );
      images.push(...nested.images);
      continue;
    }

    if (!entry.isFile() || !isImageFile(entry.name)) {
      continue;
    }

    const stat = await fs.stat(fullPath);
    const folder = toPosixPath(path.dirname(relPath));

    images.push({
      name: entry.name,
      folder: folder === "." ? "" : folder,
      path: toPosixPath(relPath),
      url: toPublicUrl(relPath),
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      extension: path.extname(entry.name).replace(".", "").toUpperCase(),
    });
  }

  return {
    folders,
    images,
  };
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeSize =
    Number.isFinite(pageSize) && pageSize > 0
      ? Math.min(Math.floor(pageSize), 200)
      : 60;
  const start = (safePage - 1) * safeSize;
  const end = start + safeSize;

  return {
    page: safePage,
    pageSize: safeSize,
    total: items.length,
    items: items.slice(start, end),
  };
}

export async function GET(req: Request) {
  try {
    const access = await requireGalleryAccess();
    if (access instanceof NextResponse) return access;

    const { searchParams } = new URL(req.url);
    const folder = normalizeFolder(searchParams.get("folder"));
    const targetDir = resolveInsidePublic(folder);
    const refresh = searchParams.get("refresh") === "1";
    const page = Number(searchParams.get("page") || "1");
    const pageSize = Number(searchParams.get("pageSize") || "60");

    await fs.mkdir(targetDir, { recursive: true });

    const cacheKey = folder || "__ALL__";
    const now = Date.now();
    const cached = galleryCache.get(cacheKey);
    const canUseCache =
      !refresh && cached && now - cached.at < CACHE_TTL_MS;

    let images: GalleryImage[];
    let folders: string[];

    if (canUseCache) {
      images = cached.images;
      folders = cached.folders;
    } else {
      const scan: GalleryScanResult = await readImages(targetDir, folder);
      images = scan.images;
      images.sort(
        (a: GalleryImage, b: GalleryImage) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      folders = Array.from(scan.folders).sort((a: string, b: string) =>
        a.localeCompare(b),
      );
      galleryCache.set(cacheKey, { at: now, images, folders });
    }

    const paged = paginate(images, page, pageSize);

    return NextResponse.json({
      images: paged.items,
      folders,
      page: paged.page,
      pageSize: paged.pageSize,
      total: paged.total,
    });
  } catch (error) {
    console.error("Gallery list error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load gallery" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const access = await requireGalleryAccess();
    if (access instanceof NextResponse) return access;

    const body = await req.json().catch(() => ({}));
    const rawPaths = Array.isArray((body as any)?.paths) ? (body as any).paths : [];

    const normalized = Array.from(
      new Set(rawPaths.map((p: unknown) => normalizeRelImagePath(p)).filter(Boolean) as string[]),
    );

    if (normalized.length === 0) {
      return NextResponse.json({ usageByPath: {} as Record<string, ImageUsageRef[]> });
    }

    const paths = normalized.slice(0, 200);
    const usageByPath: Record<string, ImageUsageRef[]> = {};
    for (const p of paths) usageByPath[p] = [];

    const urlToPaths = new Map<string, Set<string>>();
    const allUrls: string[] = [];

    for (const relPath of paths) {
      const candidates = toCandidateUrls(relPath);
      for (const url of candidates) {
        allUrls.push(url);
        const set = urlToPaths.get(url) ?? new Set<string>();
        set.add(relPath);
        urlToPaths.set(url, set);
      }
    }

    const urls = Array.from(new Set(allUrls));

    const [siteSettings, banners, brands, products, variantsColor, variantsMeta] =
      await Promise.all([
        prisma.sitesettings.findFirst({
          where: { logo: { in: urls } },
          select: { id: true, logo: true },
        }),
        prisma.banner.findMany({
          where: { OR: [{ image: { in: urls } }, { mobileImage: { in: urls } }] },
          select: { id: true, image: true, mobileImage: true },
          take: 500,
        }),
        prisma.brand.findMany({
          where: { logo: { in: urls } },
          select: { id: true, logo: true },
          take: 500,
        }),
        prisma.product.findMany({
          where: { OR: [{ image: { in: urls } }, { gallery: { hasSome: urls } }] },
          select: { id: true, image: true, gallery: true },
          take: 1000,
        }),
        prisma.productVariant.findMany({
          where: { colorImage: { in: urls } },
          select: { id: true, colorImage: true },
          take: 2000,
        }),
        prisma.$queryRaw<Array<{ id: number; options: any }>>`
          SELECT id, options
          FROM "ProductVariant"
          WHERE options::text ILIKE ANY(ARRAY[${urls.map((u) => `%${u}%`)}])
          LIMIT 500
        `,
      ]);

    if (siteSettings?.logo && urlToPaths.has(siteSettings.logo)) {
      for (const relPath of urlToPaths.get(siteSettings.logo)!) {
        usageByPath[relPath]?.push({
          entity: "sitesettings",
          id: siteSettings.id,
          field: "logo",
        });
      }
    }

    for (const banner of banners) {
      if (banner.image && urlToPaths.has(banner.image)) {
        for (const relPath of urlToPaths.get(banner.image)!) {
          usageByPath[relPath]?.push({ entity: "banner", id: banner.id, field: "image" });
        }
      }
      if (banner.mobileImage && urlToPaths.has(banner.mobileImage)) {
        for (const relPath of urlToPaths.get(banner.mobileImage)!) {
          usageByPath[relPath]?.push({
            entity: "banner",
            id: banner.id,
            field: "mobileImage",
          });
        }
      }
    }

    for (const brand of brands) {
      if (brand.logo && urlToPaths.has(brand.logo)) {
        for (const relPath of urlToPaths.get(brand.logo)!) {
          usageByPath[relPath]?.push({ entity: "brand", id: brand.id, field: "logo" });
        }
      }
    }

    for (const product of products) {
      if (product.image && urlToPaths.has(product.image)) {
        for (const relPath of urlToPaths.get(product.image)!) {
          usageByPath[relPath]?.push({ entity: "product", id: product.id, field: "image" });
        }
      }
      if (Array.isArray(product.gallery)) {
        for (const item of product.gallery) {
          if (typeof item === "string" && urlToPaths.has(item)) {
            for (const relPath of urlToPaths.get(item)!) {
              usageByPath[relPath]?.push({
                entity: "product",
                id: product.id,
                field: "gallery",
              });
            }
          }
        }
      }
    }

    for (const variant of variantsColor) {
      if (variant.colorImage && urlToPaths.has(variant.colorImage)) {
        for (const relPath of urlToPaths.get(variant.colorImage)!) {
          usageByPath[relPath]?.push({
            entity: "variant",
            id: variant.id,
            field: "colorImage",
          });
        }
      }
    }

    for (const variant of variantsMeta) {
      const text = JSON.stringify((variant as any).options ?? "");
      for (const url of urls) {
        if (!text.includes(url)) continue;
        const relPathsForUrl = urlToPaths.get(url);
        if (!relPathsForUrl) continue;
        for (const relPath of relPathsForUrl) {
          usageByPath[relPath]?.push({
            entity: "variant",
            id: variant.id,
            field: "options.__meta",
          });
        }
      }
    }

    return NextResponse.json({ usageByPath });
  } catch (error) {
    console.error("Gallery usage scan error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to scan usage" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const access = await requireGalleryAccess();
    if (access instanceof NextResponse) return access;

    const body = await req.json().catch(() => ({}));
    const pathsRaw = Array.isArray(body?.paths)
      ? (body.paths as unknown[])
      : body?.path
        ? [body.path]
        : [];

    const relPaths = pathsRaw
      .map((p) => normalizeRelImagePath(p))
      .filter(Boolean);

    if (relPaths.length === 0) {
      return NextResponse.json({ error: "Invalid image path(s)" }, { status: 400 });
    }

    const deleted: string[] = [];
    const blocked: Record<string, ImageUsageRef[]> = {};
    const notFound: string[] = [];
    const failed: Record<string, string> = {};

    for (const relPath of relPaths) {
      try {
        const target = resolveInsidePublic(relPath);
        const stat = await fs.stat(target).catch(() => null);
        if (!stat || !stat.isFile()) {
          notFound.push(relPath);
          continue;
        }

        const refs = await getImageUsage(relPath);
        if (refs.length > 0) {
          blocked[relPath] = refs;
          continue;
        }

        await fs.unlink(target);
        deleted.push(relPath);
      } catch (err) {
        failed[relPath] =
          err instanceof Error ? err.message : "Failed to delete";
      }
    }

    // Bust cache on delete (best-effort).
    galleryCache.clear();
    revalidateStorefrontCatalog();

    return NextResponse.json({ success: true, deleted, blocked, notFound, failed });
  } catch (error) {
    console.error("Gallery delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete image" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const access = await requireGalleryAccess();
    if (access instanceof NextResponse) return access;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const relPathRaw = String(formData.get("path") || "")
      .replace(/^\/+/, "")
      .replace(/^api\/upload\//, "upload/")
      .replace(/\\/g, "/");

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!relPathRaw || relPathRaw.includes("..") || !isImageFile(relPathRaw)) {
      return NextResponse.json({ error: "Invalid image path" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Uploaded file must be an image" }, { status: 400 });
    }

    const incomingExt = path.extname(file.name).toLowerCase();
    const targetExt = path.extname(relPathRaw).toLowerCase();
    const dirname = path.dirname(relPathRaw);
    const basenameWithoutExt = path.basename(relPathRaw, targetExt);
    const finalRelPath =
      incomingExt && incomingExt !== targetExt
        ? toPosixPath(path.join(dirname, `${basenameWithoutExt}${incomingExt}`))
        : relPathRaw;
    const target = resolveInsidePublic(finalRelPath);
    await fs.mkdir(path.dirname(target), { recursive: true });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await fs.writeFile(target, buffer);

    if (finalRelPath !== relPathRaw) {
      await updateImageReferences(relPathRaw, finalRelPath);

      const oldTarget = resolveInsidePublic(relPathRaw);
      await fs.unlink(oldTarget).catch(() => null);
    }

    galleryCache.clear();

    const stat = await fs.stat(target);
    const folder = toPosixPath(path.dirname(finalRelPath));

    return NextResponse.json({
      success: true,
      image: {
        name: path.basename(finalRelPath),
        folder: folder === "." ? "" : folder,
        path: toPosixPath(finalRelPath),
        url: toPublicUrl(finalRelPath),
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
        extension: path.extname(finalRelPath).replace(".", "").toUpperCase(),
      } satisfies GalleryImage,
      previousPath: toPosixPath(relPathRaw),
    });
  } catch (error) {
    console.error("Gallery replace error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to replace image" },
      { status: 500 },
    );
  }
}
