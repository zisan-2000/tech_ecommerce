//app/admin/settings/gallery/page.tsx
"use client";

import React, {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Copy,
  FolderOpen,
  Grid3X3,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

type GalleryImage = {
  name: string;
  folder: string;
  path: string;
  url: string;
  size: number;
  updatedAt: string;
  extension: string;
};

type GalleryResponse = {
  images: GalleryImage[];
  folders: string[];
  page?: number;
  pageSize?: number;
  total?: number;
};

type ImageUsageRef = {
  entity: "sitesettings" | "banner" | "brand" | "product" | "variant";
  id: string | number;
  field: string;
};

const uploadTargets = [
  { label: "General Uploads", value: "root" },
  { label: "Site Assets", value: "site" },
  { label: "Banners", value: "banners" },
  { label: "Products", value: "products" },
  { label: "Product Gallery", value: "products/gallery" },
  { label: "Variant Gallery", value: "products/variants/gallery" },
  { label: "User Profile Pictures", value: "userProfilePic" },
];

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;

  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toUploadEndpoint(target: string) {
  return target === "root" ? "/api/upload" : `/api/upload/${target}`;
}

export default function GalleryManagementPage() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [folder, setFolder] = useState("all");
  const [uploadTarget, setUploadTarget] = useState("root");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [replacingPath, setReplacingPath] = useState<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetRef = useRef<GalleryImage | null>(null);
  const [usageByPath, setUsageByPath] = useState<
    Record<string, ImageUsageRef[]>
  >({});
  const [usageLoading, setUsageLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GalleryImage | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(60);
  const [total, setTotal] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadGallery = useCallback(async (opts?: { refresh?: boolean; nextPage?: number }) => {
    try {
      const nextPage = typeof opts?.nextPage === "number" ? opts.nextPage : page;
      const isInitial = images.length === 0;
      if (isInitial) setLoading(true);
      else setPageLoading(true);

      const folderQuery =
        folder === "all" ? "" : `folder=${encodeURIComponent(folder)}`;
      const query = [
        folderQuery,
        `page=${nextPage}`,
        `pageSize=${pageSize}`,
        opts?.refresh ? "refresh=1" : "",
      ]
        .filter(Boolean)
        .join("&");

      const res = await fetch(`/api/admin/gallery${query ? `?${query}` : ""}`, {
        cache: "no-store",
      });
      const data = (await res
        .json()
        .catch(() => ({}))) as Partial<GalleryResponse> & {
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data?.error || "Failed to load gallery");
      }

      setImages(Array.isArray(data.images) ? data.images : []);
      setFolders(Array.isArray(data.folders) ? data.folders : []);
      setPage(typeof data.page === "number" ? data.page : nextPage);
      setPageSize(typeof data.pageSize === "number" ? data.pageSize : pageSize);
      setTotal(typeof data.total === "number" ? data.total : 0);

      // After images are loaded, compute "Used" markers in the background.
      const loadedImages = Array.isArray(data.images)
        ? (data.images as GalleryImage[])
        : [];
      const paths = loadedImages.map((img) => img.path).filter(Boolean);
      if (paths.length > 0) {
        setUsageLoading(true);
        try {
          const usageRes = await fetch("/api/admin/gallery", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paths }),
          });
          const usageData = (await usageRes.json().catch(() => ({}))) as {
            usageByPath?: Record<string, ImageUsageRef[]>;
            error?: string;
          };

          if (usageRes.ok && usageData?.usageByPath) {
            setUsageByPath(usageData.usageByPath);
          } else {
            setUsageByPath({});
          }
        } finally {
          setUsageLoading(false);
        }
      } else {
        setUsageByPath({});
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to load gallery");
    } finally {
      setLoading(false);
      setPageLoading(false);
    }
  }, [folder, images.length, page, pageSize]);

  useEffect(() => {
    setPage(1);
    setSelectedPaths(new Set());
    loadGallery({ nextPage: 1 });
  }, [folder, pageSize]);

  const filteredImages = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return images;

    return images.filter((image) =>
      [image.name, image.folder, image.path, image.extension]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [images, search]);

  const totalSize = useMemo(
    () => images.reduce((total, image) => total + image.size, 0),
    [images],
  );

  const visiblePaths = useMemo(
    () => filteredImages.map((img) => img.path).filter(Boolean),
    [filteredImages],
  );

  const selectedCount = selectedPaths.size;
  const pageAllSelected =
    visiblePaths.length > 0 && visiblePaths.every((p) => selectedPaths.has(p));
  const pageSomeSelected = visiblePaths.some((p) => selectedPaths.has(p));

  const toggleSelectPath = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleSelectPage = useCallback(() => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) {
        for (const p of visiblePaths) next.delete(p);
      } else {
        for (const p of visiblePaths) next.add(p);
      }
      return next;
    });
  }, [pageAllSelected, visiblePaths]);

  const clearSelection = useCallback(() => {
    setSelectedPaths(new Set());
  }, []);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = "";

    if (!selectedFiles.length) return;

    try {
      setUploading(true);
      const endpoint = toUploadEndpoint(uploadTarget);

      for (const file of selectedFiles) {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} is not an image`);
          continue;
        }

        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(endpoint, {
          method: "POST",
          body: formData,
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || (!data?.success && !data?.url && !data?.fileUrl)) {
          throw new Error(
            data?.message || data?.error || "Image upload failed",
          );
        }
      }

      toast.success("Image uploaded successfully");
      await loadGallery({ refresh: true });
    } catch (error: any) {
      toast.error(error?.message || "Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Image URL copied");
    } catch {
      toast.error("Failed to copy URL");
    }
  };

  const deleteImage = (image: GalleryImage) => {
    if (usageByPath[image.path]?.length) {
      toast.error("This image is currently in use and cannot be deleted.");
      return;
    }
    setDeleteTarget(image);
  };

  const openReplacePicker = (image: GalleryImage) => {
    replaceTargetRef.current = image;
    replaceInputRef.current?.click();
  };

  const handleReplace = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    const target = replaceTargetRef.current;
    replaceTargetRef.current = null;

    if (!file || !target) return;

    try {
      setReplacingPath(target.path);

      const formData = new FormData();
      formData.append("path", target.path);
      formData.append("file", file);

      const res = await fetch("/api/admin/gallery", {
        method: "PUT",
        body: formData,
      });

      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        image?: GalleryImage;
        previousPath?: string;
      };

      if (!res.ok || !data?.image) {
        throw new Error(data?.error || "Failed to replace image");
      }

      const previousPath = data.previousPath || target.path;

      setImages((prev) =>
        prev.map((img) => (img.path === previousPath ? data.image! : img)),
      );
      setUsageByPath((prev) => {
        if (previousPath === data.image!.path || !prev[previousPath]) {
          return prev;
        }

        const next = { ...prev };
        next[data.image!.path] = prev[previousPath];
        delete next[previousPath];
        return next;
      });
      setSelectedPaths((prev) => {
        if (!prev.has(previousPath)) return prev;
        const next = new Set(prev);
        next.delete(previousPath);
        next.add(data.image!.path);
        return next;
      });

      toast.success("Image replaced");
    } catch (error: any) {
      toast.error(error?.message || "Failed to replace image");
    } finally {
      setReplacingPath(null);
    }
  };

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;

    try {
      setDeletingPath(deleteTarget.path);
      const res = await fetch("/api/admin/gallery", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: deleteTarget.path }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        refs?: ImageUsageRef[];
      };

      if (!res.ok) {
        if (
          res.status === 409 &&
          Array.isArray(data?.refs) &&
          data.refs.length > 0
        ) {
          setUsageByPath((prev) => ({
            ...prev,
            [deleteTarget.path]: data.refs!,
          }));
          const hint = data.refs
            .slice(0, 4)
            .map((r) => `${r.entity}:${r.field}#${r.id}`)
            .join(", ");
          throw new Error(
            `${data?.error || "This image is in use"}${hint ? ` (${hint}${data.refs.length > 4 ? "..." : ""})` : ""}`,
          );
        }

        throw new Error(data?.error || "Failed to delete image");
      }

      setImages((prev) => prev.filter((img) => img.path !== deleteTarget.path));
      setUsageByPath((prev) => {
        if (!prev[deleteTarget.path]) return prev;
        const next = { ...prev };
        delete next[deleteTarget.path];
        return next;
      });
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.path);
        return next;
      });
      setDeleteTarget(null);
      toast.success("Image deleted");
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete image");
    } finally {
      setDeletingPath(null);
    }
  }, [deleteTarget]);

  const closeDialog = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  const handleBulkDelete = useCallback(async () => {
    const paths = Array.from(selectedPaths);
    if (paths.length === 0) return;

    const confirmed = window.confirm(
      `Delete ${paths.length} image(s)? Used images will be skipped.`,
    );
    if (!confirmed) return;

    try {
      setBulkDeleting(true);
      const res = await fetch("/api/admin/gallery", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        deleted?: string[];
        blocked?: Record<string, ImageUsageRef[]>;
        notFound?: string[];
        failed?: Record<string, string>;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data?.error || "Bulk delete failed");
      }

      const deleted = Array.isArray(data.deleted) ? data.deleted : [];
      const blockedCount = data.blocked ? Object.keys(data.blocked).length : 0;
      const failedCount = data.failed ? Object.keys(data.failed).length : 0;

      if (deleted.length > 0) {
        setImages((prev) => prev.filter((img) => !deleted.includes(img.path)));
        setSelectedPaths((prev) => {
          const next = new Set(prev);
          for (const p of deleted) next.delete(p);
          return next;
        });
        toast.success(`Deleted ${deleted.length} image(s)`);
      } else {
        toast.message("No images deleted");
      }

      if (blockedCount > 0) {
        toast.error(`${blockedCount} used image(s) skipped`);
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} image(s) failed to delete`);
      }

      await loadGallery({ refresh: true });
    } catch (error: any) {
      toast.error(error?.message || "Bulk delete failed");
    } finally {
      setBulkDeleting(false);
    }
  }, [selectedPaths, loadGallery]);

  const goToPage = useCallback(
    (next: number) => {
      const target = Math.min(Math.max(1, next), totalPages);
      setPage(target);
      setSelectedPaths(new Set());
      loadGallery({ nextPage: target });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [loadGallery, totalPages],
  );

  const paginationItems = useMemo(() => {
    const lastPage = totalPages;
    const current = page;
    if (lastPage <= 1) return [] as Array<number | "...">;

    const siblings = 3; // how many pages on each side of current
    const boundary = 2; // always show first 2 and last 2

    const start = Math.max(boundary + 1, current - siblings);
    const end = Math.min(lastPage - boundary, current + siblings);

    const items: Array<number | "..."> = [];

    // first boundary pages
    for (let p = 1; p <= Math.min(boundary, lastPage); p += 1) items.push(p);

    // left ellipsis
    if (start > boundary + 1) items.push("...");

    // middle pages
    for (let p = start; p <= end; p += 1) items.push(p);

    // right ellipsis
    if (end < lastPage - boundary) items.push("...");

    // last boundary pages
    for (let p = Math.max(lastPage - boundary + 1, boundary + 1); p <= lastPage; p += 1) {
      items.push(p);
    }

    return items;
  }, [page, totalPages]);

  
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">
            Gallery Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage image assets stored inside the public folder.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Select value={uploadTarget} onValueChange={setUploadTarget}>
            <SelectTrigger className="w-full sm:w-[230px]">
              <SelectValue placeholder="Upload target" />
            </SelectTrigger>
            <SelectContent>
              {uploadTargets.map((target) => (
                <SelectItem key={target.value} value={target.value}>
                  {target.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Upload Images
            <Input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={handleUpload}
            />
          </Label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Images</CardTitle>
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
            <p className="text-xs text-muted-foreground">
              {filteredImages.length} visible on this page
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
            <Grid3X3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(totalSize)}</div>
            <p className="text-xs text-muted-foreground">
              Current folder scope
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Folders</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{folders.length}</div>
            <p className="text-xs text-muted-foreground">
              Detected image folders
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by file name, folder, path, or type"
            className="pl-9"
          />
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={toggleSelectPage}
          disabled={loading || pageLoading || filteredImages.length === 0}
          className="w-full md:w-auto"
          title={pageAllSelected ? "Unselect current page" : "Select current page"}
        >
          {pageAllSelected ? (
            <CheckSquare className="mr-2 h-4 w-4" />
          ) : (
            <Square className="mr-2 h-4 w-4" />
          )}
          {pageAllSelected ? "Unselect Page" : "Select Page"}
        </Button>

        <Select value={folder} onValueChange={setFolder}>
          <SelectTrigger className="w-full md:w-[280px]">
            <SelectValue placeholder="Folder" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All public images</SelectItem>
            <SelectItem value="upload">Upload folder</SelectItem>
            {folders.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={String(pageSize)}
          onValueChange={(value) => setPageSize(Number(value))}
        >
          <SelectTrigger className="w-full md:w-[160px]">
            <SelectValue placeholder="Page size" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">30 / page</SelectItem>
            <SelectItem value="60">60 / page</SelectItem>
            <SelectItem value="90">90 / page</SelectItem>
            <SelectItem value="120">120 / page</SelectItem>
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          onClick={() => loadGallery({ refresh: true })}
          disabled={loading || pageLoading}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${
              loading || pageLoading ? "animate-spin" : ""
            }`}
          />
          Refresh
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {pageSomeSelected || pageAllSelected ? (
              <>
                Selected{" "}
                <span className="font-medium text-foreground">
                  {selectedCount}
                </span>
              </>
            ) : (
              <>
                Showing{" "}
                <span className="font-medium text-foreground">
                  {filteredImages.length}
                </span>{" "}
                of{" "}
                <span className="font-medium text-foreground">{total}</span>
              </>
            )}
          </span>

          {selectedCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearSelection}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-lg border bg-card">
          <div className="w-full max-w-5xl p-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
              {Array.from({ length: 20 }).map((_, idx) => (
                <div
                  key={idx}
                  className="overflow-hidden rounded-lg border bg-card shadow-sm"
                >
                  <div className="aspect-square bg-muted animate-pulse" />
                  <div className="space-y-3 p-4">
                    <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-full rounded bg-muted animate-pulse" />
                    <div className="h-9 w-full rounded bg-muted animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : filteredImages.length === 0 ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border bg-card text-center">
          <ImageIcon className="mb-3 h-10 w-10 text-muted-foreground" />
          <h2 className="text-lg font-semibold">No images found</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload an image or change the current filter.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          <input
            ref={replaceInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleReplace}
          />
          {filteredImages.map((image) => (
            <GalleryImageCard
              key={image.path}
              image={image}
              refs={usageByPath[image.path] ?? null}
              usageLoading={usageLoading}
              deletingPath={deletingPath}
              replacingPath={replacingPath}
              onCopy={copyUrl}
              onReplace={openReplacePicker}
              onDelete={deleteImage}
              selected={selectedPaths.has(image.path)}
              onToggleSelected={() => toggleSelectPath(image.path)}
            />
          ))}
          {pageLoading ? (
            Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={`page-skel-${idx}`}
                className="overflow-hidden rounded-lg border bg-card shadow-sm"
              >
                <div className="aspect-square bg-muted animate-pulse" />
                <div className="space-y-3 p-4">
                  <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
                  <div className="h-9 w-full rounded bg-muted animate-pulse" />
                </div>
              </div>
            ))
          ) : null}
        </div>
      )}

      {!loading && totalPages > 1 ? (
        <div className="flex flex-col items-center justify-between gap-3 rounded-lg border bg-card p-4 sm:flex-row">
          <div className="text-sm text-muted-foreground">
            Page <span className="font-medium text-foreground">{page}</span> of{" "}
            <span className="font-medium text-foreground">{totalPages}</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => goToPage(page - 1)}
              disabled={pageLoading || page <= 1}
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Prev
            </Button>

            {paginationItems.map((item, idx) =>
              item === "..." ? (
                <span
                  key={`ellipsis-${idx}`}
                  className="px-2 text-sm text-muted-foreground"
                >
                  ...
                </span>
              ) : (
                <Button
                  key={item}
                  type="button"
                  variant={item === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => goToPage(item)}
                  disabled={pageLoading}
                  className="min-w-9"
                >
                  {item}
                </Button>
              ),
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => goToPage(page + 1)}
              disabled={pageLoading || page >= totalPages}
            >
              Next
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-md rounded-2xl border-0 p-0 shadow-2xl">
          <div className="p-6">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
              <Trash2 className="h-7 w-7 text-red-600" />
            </div>

            <DialogHeader>
              <DialogTitle className="text-center text-xl font-bold text-gray-900">
                Delete Image?
              </DialogTitle>
            </DialogHeader>

            <div className="mt-4 rounded-xl border bg-muted/40 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete
              </p>

              <p className="mt-1 truncate text-base font-semibold text-gray-900">
                {deleteTarget?.name}
              </p>

              <p className="mt-3 text-sm font-medium text-red-600">
                This action cannot be undone.
              </p>
            </div>

            <DialogFooter className="mt-6 flex gap-3 sm:justify-center">
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-xl"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingPath === deleteTarget?.path}
              >
                Cancel
              </Button>

              <Button
                type="button"
                variant="destructive"
                className="w-full rounded-xl"
                onClick={confirmDelete}
                disabled={deletingPath === deleteTarget?.path}
              >
                {deletingPath === deleteTarget?.path ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Image
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {selectedCount > 0 ? (
        <div className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-5xl">
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <span className="font-medium">{selectedCount}</span> selected
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={clearSelection}
                disabled={bulkDeleting}
              >
                Clear
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Selected
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const GalleryImageCard = React.memo(function GalleryImageCard({
  image,
  refs,
  usageLoading,
  deletingPath,
  replacingPath,
  onCopy,
  onReplace,
  onDelete,
  selected,
  onToggleSelected,
}: {
  image: GalleryImage;
  refs: ImageUsageRef[] | null;
  usageLoading: boolean;
  deletingPath: string | null;
  replacingPath: string | null;
  onCopy: (url: string) => void;
  onReplace: (image: GalleryImage) => void;
  onDelete: (image: GalleryImage) => void;
  selected: boolean;
  onToggleSelected: () => void;
}) {
  const isUsed = Array.isArray(refs) && refs.length > 0;

  const usedHint = refs
    ? refs
        .slice(0, 2)
        .map((r) => `${r.entity}:${r.field}#${r.id}`)
        .join(", ")
    : "";

  return (
    <div
      className={`overflow-hidden rounded-lg border bg-card shadow-sm ${
        selected ? "ring-2 ring-primary" : ""
      }`}
    >
      <div className="flex aspect-square items-center justify-center bg-muted/40">
        <img
          src={`${image.url}?v=${encodeURIComponent(image.updatedAt)}`}
          alt={image.name}
          className="h-full w-full object-contain"
          loading="lazy"
        />
      </div>

      <div className="space-y-3 p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded border bg-background hover:bg-muted"
              onClick={onToggleSelected}
              title={selected ? "Unselect" : "Select"}
            >
              {selected ? (
                <CheckSquare className="h-4 w-4 text-primary" />
              ) : (
                <Square className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            <p className="truncate text-sm font-semibold" title={image.name}>
              {image.name}
            </p>

            <Badge variant="secondary" className="shrink-0">
              {image.extension}
            </Badge>

            {isUsed ? (
              <Badge variant="destructive" className="shrink-0">
                Used
              </Badge>
            ) : null}
          </div>

          <p className="mt-1 truncate text-xs text-muted-foreground">
            {image.folder || "public root"}
          </p>

          {isUsed ? (
            <p
              className="mt-1 truncate text-[11px] text-destructive"
              title={refs
                .map((r) => `${r.entity}:${r.field}#${r.id}`)
                .join(", ")}
            >
              Used: {usedHint}
              {refs.length > 2 ? "..." : ""}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <span>{formatBytes(image.size)}</span>
          <span className="text-right">{formatDate(image.updatedAt)}</span>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onCopy(image.url)}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onReplace(image)}
            title="Replace this image (keeps same URL/path)"
          >
            {replacingPath === image.path ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>

          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={
              usageLoading ||
              deletingPath === image.path ||
              replacingPath === image.path
            }
            onClick={() => onDelete(image)}
          >
            {deletingPath === image.path ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
});
