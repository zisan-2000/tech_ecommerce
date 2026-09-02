"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getInventoryStatus } from "@/lib/stock-status";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Image from "next/image";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Edit3,
  Trash2,
  Search,
  Layers,
  Image as ImageIcon,
  ChevronDown,
  RefreshCw,
  Boxes,
  Package,
  AlertTriangle,
  CalendarClock,
  Flame,
  Power,
  PowerOff,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import ProductAddModal from "./ProductAddModal";
import ProductRelationsModal from "./ProductRelationsModal";
import AttributesManagerModal from "./AttributesManagerModal";
import DigitalAssetManagerModal from "./DigitalAssetManagerModal";
import type { InventoryStatus } from "@/lib/stock-status";
import SpotlightCard from "../SpotlightCard";
import { getProductAvailabilityAction } from "@/lib/product-availability";

type WarehouseOption = {
  id: number;
  name: string;
  code: string;
  isDefault: boolean;
};

type WarehouseStats = {
  totalProducts: number;
  totalStock: number;
  lowStockItems: number;
  outOfStockItems: number;
  reservedUnits: number;
};

const PRODUCTS_PER_PAGE = 24;

export default function ProductManager({
  products,
  loading,
  onCreate,
  onUpdate,
  onAvailabilityChange,
  onFlashSaleChange,
  onDelete,
  categories,
  brands,
  vatClasses,
  digitalAssets,
}: any) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [productTypeFilter, setProductTypeFilter] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("");
  const [featuredFilter, setFeaturedFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("");
  const [sortBy, setSortBy] = useState("name-asc");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [managingProduct, setManagingProduct] = useState<any>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [availabilityProduct, setAvailabilityProduct] = useState<any>(null);
  const [availabilityDialogOpen, setAvailabilityDialogOpen] = useState(false);
  const [isChangingAvailability, setIsChangingAvailability] = useState(false);
  const [flashSaleProduct, setFlashSaleProduct] = useState<any>(null);
  const [flashSaleSaving, setFlashSaleSaving] = useState(false);
  const [flashSaleError, setFlashSaleError] = useState("");
  const [flashSaleForm, setFlashSaleForm] = useState({
    enabled: true,
    salePrice: "",
    durationDays: "1",
    durationHours: "0",
    sortOrder: "0",
  });
  const [attributesOpen, setAttributesOpen] = useState(false);
  const [digitalAssetsOpen, setDigitalAssetsOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [warehouseStats, setWarehouseStats] = useState<WarehouseStats | null>(
    null,
  );
  const [warehouseLoading, setWarehouseLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const hasActiveFilters = Boolean(
    search ||
    categoryFilter ||
    productTypeFilter ||
    availabilityFilter ||
    featuredFilter ||
    stockFilter,
  );

  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("");
    setProductTypeFilter("");
    setAvailabilityFilter("");
    setFeaturedFilter("");
    setStockFilter("");
    setSortBy("name-asc");
    setCurrentPage(1);
  };

  const productList = Array.isArray(products) ? products : [];

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    let result = productList.filter((p: any) => {
      if (!query) return true;
      return [
        p.name,
        p.sku,
        p.category?.name,
        p.brand?.name,
        ...(Array.isArray(p.variants)
          ? p.variants.map((variant: any) => variant?.sku)
          : []),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });

    if (categoryFilter) {
      result = result.filter(
        (p: any) => String(p.category?.id ?? "") === categoryFilter,
      );
    }

    if (productTypeFilter) {
      result = result.filter((p: any) => p.type === productTypeFilter);
    }

    if (availabilityFilter) {
      result = result.filter((p: any) =>
        availabilityFilter === "available"
          ? Boolean(p.available)
          : !p.available,
      );
    }

    if (featuredFilter) {
      result = result.filter((p: any) =>
        featuredFilter === "featured" ? Boolean(p.featured) : !p.featured,
      );
    }

    if (warehouses.length > 0 && warehouseId) {
      const accessibleWarehouseIds = new Set(warehouses.map((w) => w.id));
      const selectedWarehouseId = Number(warehouseId);

      result = result.filter((p: any) => {
        if (p.type !== "PHYSICAL") {
          return true;
        }

        const variants = Array.isArray(p?.variants) ? p.variants : [];
        return variants.some((variant: any) => {
          const stockLevels = Array.isArray(variant?.stockLevels)
            ? variant.stockLevels
            : [];

          return stockLevels.some((stockLevel: any) => {
            const warehouseIdValue = Number(stockLevel?.warehouseId);
            const quantityValue = Number(stockLevel?.quantity);

            if (!Number.isFinite(warehouseIdValue)) return false;
            if (!accessibleWarehouseIds.has(warehouseIdValue)) return false;
            if (warehouseIdValue !== selectedWarehouseId) {
              return false;
            }
            return Number.isFinite(quantityValue) && quantityValue > 0;
          });
        });
      });
    }

    if (stockFilter) {
      result = result.filter((p: any) => {
        if (p.type !== "PHYSICAL") {
          return stockFilter === "non-physical";
        }

        const inventory = getProductInventorySummary(p);

        if (stockFilter === "in-stock") return inventory.status === "IN_STOCK";
        if (stockFilter === "low-stock")
          return inventory.status === "LOW_STOCK";
        if (stockFilter === "out-of-stock") {
          return inventory.status === "OUT_OF_STOCK";
        }

        return true;
      });
    }

    result.sort((a: any, b: any) => {
      const [field, order] = sortBy.split("-");
      const direction = order === "desc" ? -1 : 1;

      let aValue: string | number = "";
      let bValue: string | number = "";

      switch (field) {
        case "price":
          aValue = Number(a.basePrice ?? 0);
          bValue = Number(b.basePrice ?? 0);
          break;
        case "category":
          aValue = String(a.category?.name ?? "").toLowerCase();
          bValue = String(b.category?.name ?? "").toLowerCase();
          break;
        case "stock":
          aValue =
            a.type === "PHYSICAL"
              ? getProductInventorySummary(a).totalStock
              : -1;
          bValue =
            b.type === "PHYSICAL"
              ? getProductInventorySummary(b).totalStock
              : -1;
          break;
        default:
          aValue = String(a.name ?? "").toLowerCase();
          bValue = String(b.name ?? "").toLowerCase();
      }

      if (aValue > bValue) return direction;
      if (aValue < bValue) return -direction;
      return 0;
    });

    return result;
  }, [
    productList,
    search,
    categoryFilter,
    productTypeFilter,
    availabilityFilter,
    featuredFilter,
    stockFilter,
    sortBy,
    warehouseId,
    warehouses,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PRODUCTS_PER_PAGE));
  const paginationPages = useMemo(() => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);

    for (let page = start; page <= end; page += 1) {
      pages.push(page);
    }

    return pages;
  }, [currentPage, totalPages]);
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * PRODUCTS_PER_PAGE;
    return filtered.slice(start, start + PRODUCTS_PER_PAGE);
  }, [currentPage, filtered]);
  const pageStart = filtered.length === 0 ? 0 : (currentPage - 1) * PRODUCTS_PER_PAGE + 1;
  const pageEnd = Math.min(currentPage * PRODUCTS_PER_PAGE, filtered.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    search,
    categoryFilter,
    productTypeFilter,
    availabilityFilter,
    featuredFilter,
    stockFilter,
    sortBy,
    warehouseId,
  ]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const fetchWarehouseData = useCallback(
    async (nextWarehouseId?: string, showRefresh = false) => {
      try {
        if (showRefresh) {
          setRefreshing(true);
        } else {
          setWarehouseLoading(true);
        }

        const params = new URLSearchParams();
        const resolvedWarehouseId =
          nextWarehouseId !== undefined ? nextWarehouseId : warehouseId;
        if (resolvedWarehouseId) {
          params.set("warehouseId", resolvedWarehouseId);
        }

        const response = await fetch(
          `/api/admin/warehouse-product-stats${params.size > 0 ? `?${params}` : ""}`,
          {
            cache: "no-store",
          },
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load warehouse data");
        }

        setWarehouses(payload.warehouses || []);
        setWarehouseStats(payload.stats || null);
      } catch (error) {
        console.error("Failed to load warehouse data:", error);
        setWarehouses([]);
        setWarehouseStats(null);
      } finally {
        setWarehouseLoading(false);
        setRefreshing(false);
      }
    },
    [warehouseId],
  );

  useEffect(() => {
    fetchWarehouseData();
  }, [fetchWarehouseData]);

  const selectedWarehouseLabel = useMemo(() => {
    if (!warehouses.length) return "All warehouses";

    if (!warehouseId) {
      return "All warehouses";
    }

    const selected = warehouses.find(
      (warehouse) => String(warehouse.id) === warehouseId,
    );
    if (selected) {
      return `${selected.name} (${selected.code})`;
    }

    return "All warehouses";
  }, [warehouses, warehouseId]);

  const warehouseStatsCards = useMemo(
    () => [
      {
        title: "Total Products",
        value: String(warehouseStats?.totalProducts ?? 0),
        note: "In selected warehouse",
        icon: Package,
      },
      {
        title: "Total Stock",
        value: String(warehouseStats?.totalStock ?? 0),
        note: `${warehouseStats?.reservedUnits ?? 0} reserved units`,
        icon: Boxes,
      },
      {
        title: "Low Stock Items",
        value: String(warehouseStats?.lowStockItems ?? 0),
        note: "Below threshold",
        icon: AlertTriangle,
      },
      {
        title: "Out of Stock",
        value: String(warehouseStats?.outOfStockItems ?? 0),
        note: "Need restocking",
        icon: AlertTriangle,
      },
    ],
    [warehouseStats],
  );

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (product: any) => {
    setEditing(product);
    setModalOpen(true);
  };

  const openDeleteModal = (product: any) => {
    setDeletingProduct(product);
    setDeleteModalOpen(true);
  };

  const openAvailabilityModal = (product: any) => {
    setAvailabilityProduct(product);
    setAvailabilityDialogOpen(true);
  };

  const openFlashSaleModal = (product: any) => {
    const startsAt = product.flashSaleStartsAt
      ? new Date(product.flashSaleStartsAt)
      : new Date();
    const endsAt = product.flashSaleEndsAt
      ? new Date(product.flashSaleEndsAt)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const durationMs = Math.max(60 * 60 * 1000, endsAt.getTime() - startsAt.getTime());
    const durationDays = Math.floor(durationMs / (24 * 60 * 60 * 1000));
    const durationHours = Math.max(
      0,
      Math.round((durationMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)),
    );

    setFlashSaleProduct(product);
    setFlashSaleError("");
    setFlashSaleForm({
      enabled: Boolean(product.flashSaleEnabled || !product.flashSalePrice),
      salePrice: String(
        product.flashSalePrice ??
          Math.max(1, Math.round(Number(product.basePrice ?? 0) * 0.9)),
      ),
      durationDays: String(durationDays),
      durationHours: String(durationHours),
      sortOrder: String(product.flashSaleSortOrder ?? 0),
    });
  };

  const closeFlashSaleModal = () => {
    if (flashSaleSaving) return;
    setFlashSaleProduct(null);
    setFlashSaleError("");
  };

  const closeAvailabilityModal = () => {
    setAvailabilityDialogOpen(false);
    setAvailabilityProduct(null);
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setDeletingProduct(null);
  };

  const openManage = (product: any) => {
    setManagingProduct(product);
    setManageOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingProduct) return;

    try {
      setIsDeleting(true);
      await onDelete(deletingProduct.id);
      toast.success("Product deleted successfully");
    } catch (error) {
      toast.error("Failed to delete product");
    } finally {
      setIsDeleting(false);
      closeDeleteModal();
    }
  };

  const handleAvailabilityChange = async () => {
    if (!availabilityProduct) return;

    const action = getProductAvailabilityAction(
      Boolean(availabilityProduct.available),
    );
    try {
      setIsChangingAvailability(true);
      await onAvailabilityChange(
        availabilityProduct.id,
        action.nextAvailable,
        availabilityProduct.updatedAt,
      );
      toast.success(`Product ${action.pastTense} successfully`);
      closeAvailabilityModal();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update product availability",
      );
    } finally {
      setIsChangingAvailability(false);
    }
  };

  const handleFlashSaleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!flashSaleProduct) return;

    const salePrice = Number(flashSaleForm.salePrice);
    const days = Number(flashSaleForm.durationDays);
    const hours = Number(flashSaleForm.durationHours);
    const durationMs = (days * 24 + hours) * 60 * 60 * 1000;
    const basePrice = Number(flashSaleProduct.basePrice ?? 0);

    if (!Number.isFinite(salePrice) || salePrice <= 0 || salePrice >= basePrice) {
      setFlashSaleError("Sale price must be greater than 0 and lower than regular price.");
      return;
    }
    if (!Number.isInteger(days) || !Number.isInteger(hours) || durationMs <= 0) {
      setFlashSaleError("Duration must be at least 1 hour.");
      return;
    }

    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + durationMs);

    try {
      setFlashSaleSaving(true);
      setFlashSaleError("");
      const response = await fetch(`/api/admin/flash-sales/${flashSaleProduct.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: flashSaleForm.enabled,
          salePrice,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          sortOrder: Number(flashSaleForm.sortOrder) || 0,
          expectedUpdatedAt: flashSaleProduct.updatedAt,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to save flash sale.");
      }

      onFlashSaleChange?.(flashSaleProduct.id, payload);
      toast.success("Flash sale saved successfully");
      closeFlashSaleModal();
    } catch (error) {
      setFlashSaleError(
        error instanceof Error ? error.message : "Failed to save flash sale.",
      );
    } finally {
      setFlashSaleSaving(false);
    }
  };

  const handleFlashSaleRemove = async () => {
    if (!flashSaleProduct) return;
    try {
      setFlashSaleSaving(true);
      setFlashSaleError("");
      const response = await fetch(`/api/admin/flash-sales/${flashSaleProduct.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt: flashSaleProduct.updatedAt }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to remove flash sale.");
      }

      onFlashSaleChange?.(flashSaleProduct.id, payload);
      toast.success("Flash sale removed");
      closeFlashSaleModal();
    } catch (error) {
      setFlashSaleError(
        error instanceof Error ? error.message : "Failed to remove flash sale.",
      );
    } finally {
      setFlashSaleSaving(false);
    }
  };

  const calculateStock = (product: any) => {
    if (!product.variants || product.variants.length === 0) return 0;
    return product.variants.reduce(
      (acc: number, v: any) => acc + (v.stock || 0),
      0,
    );
  };

  const getProductInventorySummary = (product: any) => {
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    if (product?.type !== "PHYSICAL" || variants.length === 0) {
      return {
        totalStock: 0,
        status: "IN_STOCK" as const,
        lowCount: 0,
        outCount: 0,
      };
    }

    const totalStock = calculateStock(product);
    const statuses = variants.map((variant: any) =>
      getInventoryStatus(
        variant?.stock,
        variant?.lowStockThreshold ?? product?.lowStockThreshold,
      ),
    );
    const lowCount = statuses.filter(
      (status: InventoryStatus) => status === "LOW_STOCK",
    ).length;
    const outCount = statuses.filter(
      (status: InventoryStatus) => status === "OUT_OF_STOCK",
    ).length;

    const status: InventoryStatus =
      totalStock <= 0
        ? "OUT_OF_STOCK"
        : lowCount > 0 || outCount > 0
          ? "LOW_STOCK"
          : "IN_STOCK";

    return {
      totalStock,
      status,
      lowCount,
      outCount,
    };
  };

  const getStatusBadgeClasses = (
    status: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK",
  ) => {
    if (status === "OUT_OF_STOCK")
      return "border-destructive/20 bg-destructive/10 text-destructive";
    if (status === "LOW_STOCK")
      return "border-accent/20 bg-accent/10 text-accent-foreground";
    return "border-primary/20 bg-primary/10 text-primary";
  };

  const getStatusLabel = (
    status: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK",
  ) => {
    if (status === "OUT_OF_STOCK") return "Out of Stock";
    if (status === "LOW_STOCK") return "Low Stock";
    return "In Stock";
  };

  const getFlashSaleStatus = (product: any) => {
    if (!product.flashSaleEnabled || !product.flashSaleStartsAt || !product.flashSaleEndsAt) {
      return null;
    }
    const startsAt = new Date(product.flashSaleStartsAt).getTime();
    const endsAt = new Date(product.flashSaleEndsAt).getTime();
    const now = Date.now();
    if (Number.isNaN(startsAt) || Number.isNaN(endsAt)) return null;
    if (startsAt > now) return "Scheduled";
    if (endsAt <= now) return "Expired";
    return "Live";
  };

  const filterSelectClass =
    "w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="min-h-screen bg-background pb-6">
      {/* DELETE MODAL */}
      <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deletingProduct?.name}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ACTIVATE / DEACTIVATE MODAL */}
      <AlertDialog
        open={availabilityDialogOpen}
        onOpenChange={(open) => {
          if (isChangingAvailability) return;
          if (open) setAvailabilityDialogOpen(true);
          else closeAvailabilityModal();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {availabilityProduct?.available
                ? "Deactivate Product?"
                : "Activate Product?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {availabilityProduct?.available
                ? `“${availabilityProduct?.name}” will be removed from storefront listings, search and product details. New cart and order requests will be blocked. Inventory and historical orders will be preserved.`
                : `“${availabilityProduct?.name}” will become visible on the storefront and can be purchased when its product type and stock rules allow it.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isChangingAvailability}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleAvailabilityChange();
              }}
              disabled={isChangingAvailability}
              className={
                availabilityProduct?.available
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }
            >
              {isChangingAvailability
                ? "Saving..."
                : availabilityProduct?.available
                  ? "Deactivate"
                  : "Activate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {flashSaleProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Flame className="h-5 w-5 fill-orange-500 text-orange-500" />
                  <h2 className="text-lg font-semibold">Configure Flash Sale</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {flashSaleProduct.name}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={flashSaleSaving}
                onClick={closeFlashSaleModal}
              >
                Close
              </Button>
            </div>

            <form onSubmit={handleFlashSaleSave} className="space-y-4">
              <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Regular price</span>
                  <strong>৳{Number(flashSaleProduct.basePrice ?? 0).toLocaleString("en-US")}</strong>
                </div>
                {flashSaleProduct.flashSalePrice ? (
                  <div className="mt-1 flex justify-between gap-3">
                    <span className="text-muted-foreground">Current flash price</span>
                    <strong className="text-rose-600">
                      ৳{Number(flashSaleProduct.flashSalePrice).toLocaleString("en-US")}
                    </strong>
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="flash-sale-price">Sale price</Label>
                  <Input
                    id="flash-sale-price"
                    type="number"
                    min="1"
                    step="0.01"
                    value={flashSaleForm.salePrice}
                    onChange={(event) =>
                      setFlashSaleForm((prev) => ({
                        ...prev,
                        salePrice: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="flash-sale-order">Display order</Label>
                  <Input
                    id="flash-sale-order"
                    type="number"
                    min="0"
                    max="9999"
                    value={flashSaleForm.sortOrder}
                    onChange={(event) =>
                      setFlashSaleForm((prev) => ({
                        ...prev,
                        sortOrder: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="flash-sale-days">Duration days</Label>
                  <Input
                    id="flash-sale-days"
                    type="number"
                    min="0"
                    value={flashSaleForm.durationDays}
                    onChange={(event) =>
                      setFlashSaleForm((prev) => ({
                        ...prev,
                        durationDays: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="flash-sale-hours">Duration hours</Label>
                  <Input
                    id="flash-sale-hours"
                    type="number"
                    min="0"
                    max="23"
                    value={flashSaleForm.durationHours}
                    onChange={(event) =>
                      setFlashSaleForm((prev) => ({
                        ...prev,
                        durationHours: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={flashSaleForm.enabled}
                  onChange={(event) =>
                    setFlashSaleForm((prev) => ({
                      ...prev,
                      enabled: event.target.checked,
                    }))
                  }
                  className="mt-0.5 h-4 w-4 accent-orange-600"
                />
                <span>
                  <span className="block font-semibold">Enable flash sale</span>
                  <span className="text-muted-foreground">
                    The deal starts immediately and ends after the selected duration.
                  </span>
                </span>
              </label>

              {flashSaleError ? (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                  {flashSaleError}
                </p>
              ) : null}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  disabled={flashSaleSaving || !flashSaleProduct.flashSalePrice}
                  onClick={handleFlashSaleRemove}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  Remove flash sale
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={flashSaleSaving}
                    onClick={closeFlashSaleModal}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={flashSaleSaving || !flashSaleProduct.available}
                    className="bg-orange-600 text-white hover:bg-orange-700"
                  >
                    {flashSaleSaving ? "Saving..." : "Save flash sale"}
                  </Button>
                </div>
              </div>
              {!flashSaleProduct.available ? (
                <p className="text-right text-sm text-destructive">
                  Activate this product before enabling a flash sale.
                </p>
              ) : null}
            </form>
          </div>
        </div>
      ) : null}

      {/* WAREHOUSE CONTROLS */}
      {/* Page Header */}
      <div className="mb-4 border-b bg-card">
        <div className="px-4 py-6 sm:px-6 sm:py-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
                Product Management
              </h1>
              <p className="mt-2 text-muted-foreground">
                Manage all products with warehouse-specific insights
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:w-auto">
              <div className="grid grid-cols-2 gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto">
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-between rounded-2xl px-4 py-3 text-sm font-medium sm:min-w-[240px] sm:w-auto"
                    >
                      <span className="truncate">{selectedWarehouseLabel}</span>
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-[280px] rounded-2xl"
                  >
                    <DropdownMenuLabel>Warehouse scope</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={warehouseId || "all"}
                      onValueChange={(value) => {
                        const nextWarehouseId = value === "all" ? "" : value;
                        setWarehouseId(nextWarehouseId);
                        void fetchWarehouseData(nextWarehouseId);
                      }}
                    >
                      <DropdownMenuRadioItem value="all">
                        All warehouses
                      </DropdownMenuRadioItem>
                      <DropdownMenuSeparator />
                      {warehouses.map((warehouse) => (
                        <DropdownMenuRadioItem
                          key={warehouse.id}
                          value={String(warehouse.id)}
                        >
                          {warehouse.name} ({warehouse.code})
                          {warehouse.isDefault ? " - Default" : ""}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                <button
                  type="button"
                  onClick={() => void fetchWarehouseData(undefined, true)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition hover:bg-accent sm:w-auto"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                  />
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* WAREHOUSE STATISTICS */}
      <section className="mb-6 grid gap-4 px-4 grid-cols-2 sm:px-6 xl:grid-cols-4">
        {warehouseStatsCards.map((card) => (
          <article
            key={card.title}
            className="rounded-3xl border bg-card p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">{card.title}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">
                  {card.value}
                </p>
              </div>
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <card.icon className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{card.note}</p>
          </article>
        ))}
      </section>

      {/* SEARCH + ADD + FILTERS */}
      <Card className="mx-4 mb-6 border bg-card shadow-sm sm:mx-6">
        <CardContent className="space-y-6 p-4 sm:p-6">
          {/* Header with Stats and Actions */}

          {/* Filters Section */}
          <div className="space-y-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <h2 className="text-lg font-semibold text-foreground">Filters</h2>
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-end">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAttributesOpen(true)}
                    className="w-full"
                  >
                    Attributes
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDigitalAssetsOpen(true)}
                    className="w-full"
                  >
                    Digital Assets
                  </Button>
                  <Button onClick={openAdd} className="w-full">
                    <Plus className="h-4 w-4 mr-1" /> New Product
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => router.push("/admin/operations/products/bundles")}
                    className="w-full border-primary/20 text-primary hover:bg-primary/10"
                  >
                    <Package className="h-4 w-4 mr-1" /> Bundles
                  </Button>
                </div>

                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearFilters}
                    className="w-full xl:w-auto"
                  >
                    Clear All Filters
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-3 grid-cols-2 xl:grid-cols-6">
              <div className="relative sm:col-span-2 xl:col-span-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-11 pl-10"
                  placeholder="Search products..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className={filterSelectClass}
              >
                <option value="">All Categories</option>
                {(categories || []).map((category: any) => (
                  <option key={category.id} value={String(category.id)}>
                    {category.name}
                  </option>
                ))}
              </select>

              <select
                value={productTypeFilter}
                onChange={(e) => setProductTypeFilter(e.target.value)}
                className={filterSelectClass}
              >
                <option value="">All Types</option>
                <option value="PHYSICAL">Physical</option>
                <option value="DIGITAL">Digital</option>
                <option value="SERVICE">Service</option>
                <option value="BUNDLE">Bundle</option>
              </select>

              <select
                value={availabilityFilter}
                onChange={(e) => setAvailabilityFilter(e.target.value)}
                className={filterSelectClass}
              >
                <option value="">All Availability</option>
                <option value="available">Available</option>
                <option value="unavailable">Unavailable</option>
              </select>

              <select
                value={featuredFilter}
                onChange={(e) => setFeaturedFilter(e.target.value)}
                className={filterSelectClass}
              >
                <option value="">All Visibility</option>
                <option value="featured">Featured</option>
                <option value="regular">Regular</option>
              </select>

              <select
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value)}
                className={filterSelectClass}
              >
                <option value="">All Stock States</option>
                <option value="in-stock">In Stock</option>
                <option value="low-stock">Low Stock</option>
                <option value="out-of-stock">Out of Stock</option>
                <option value="non-physical">Non-Physical</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className={filterSelectClass}
              >
                <option value="name-asc">Name (A-Z)</option>
                <option value="name-desc">Name (Z-A)</option>
                <option value="category-asc">Category (A-Z)</option>
                <option value="category-desc">Category (Z-A)</option>
                <option value="price-asc">Price (Low to High)</option>
                <option value="price-desc">Price (High to Low)</option>
                <option value="stock-asc">Stock (Low to High)</option>
                <option value="stock-desc">Stock (High to Low)</option>
              </select>
            </div>

            {/* Active Filters Tags */}
            {hasActiveFilters && (
              <div className="flex flex-wrap gap-2 border-t border-border/50 pt-3">
                <span className="text-sm text-muted-foreground">
                  Active filters:
                </span>
                {search && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                    Search: {search}
                    <button onClick={() => setSearch("")}>×</button>
                  </span>
                )}
                {categoryFilter && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                    Category:{" "}
                    {categories?.find(
                      (category: any) => String(category.id) === categoryFilter,
                    )?.name || categoryFilter}
                    <button onClick={() => setCategoryFilter("")}>×</button>
                  </span>
                )}
                {productTypeFilter && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                    Type: {productTypeFilter}
                    <button onClick={() => setProductTypeFilter("")}>×</button>
                  </span>
                )}
                {availabilityFilter && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                    {availabilityFilter === "available"
                      ? "Available"
                      : "Unavailable"}
                    <button onClick={() => setAvailabilityFilter("")}>×</button>
                  </span>
                )}
                {featuredFilter && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                    {featuredFilter === "featured" ? "Featured" : "Regular"}
                    <button onClick={() => setFeaturedFilter("")}>×</button>
                  </span>
                )}
                {stockFilter && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                    Stock: {stockFilter}
                    <button onClick={() => setStockFilter("")}>×</button>
                  </span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!loading && filtered.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 px-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            Showing {pageStart}-{pageEnd} of {filtered.length} products
          </p>
        </div>
      )}

      {/* LOADING */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 px-4 sm:grid-cols-2 sm:gap-6 sm:px-6 xl:grid-cols-3 2xl:grid-cols-4">
          {[...Array(8)].map((_, index) => (
            <Card
              key={`skeleton-${index}`}
              className="bg-card shadow-sm rounded-2xl overflow-hidden border"
            >
              {/* Image Skeleton */}
              <div className="relative h-48 bg-muted sm:h-56">
                <div className="absolute inset-0 bg-gradient-to-r from-muted via-muted/50 to-muted animate-pulse" />
              </div>

              {/* Content Skeleton */}
              <CardContent className="p-5">
                {/* Title Skeleton */}
                <div className="h-6 bg-muted rounded animate-pulse mb-2" />

                {/* Product Info Skeletons */}
                <div className="space-y-2 mb-3">
                  <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
                  <div className="h-4 bg-muted rounded w-2/3 animate-pulse" />
                  <div className="h-4 bg-muted rounded w-1/2 animate-pulse" />
                  <div className="h-4 bg-muted rounded w-2/3 animate-pulse" />
                  <div className="h-4 bg-muted rounded w-1/3 animate-pulse" />
                  <div className="h-4 bg-muted rounded w-1/4 animate-pulse" />
                </div>

                {/* Price Skeleton */}
                <div className="h-6 bg-muted rounded w-1/3 animate-pulse mb-4" />

                {/* Buttons Skeleton */}
                <div className="flex gap-2">
                  <div className="h-9 bg-muted rounded flex-1 animate-pulse" />
                  <div className="h-9 bg-muted rounded flex-1 animate-pulse" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 px-4 pb-6 sm:grid-cols-2 sm:gap-6 sm:px-6 xl:grid-cols-3 2xl:grid-cols-4">
          {paginatedProducts.map((p: any) => {
            const flashSaleStatus = getFlashSaleStatus(p);

            return (
              <SpotlightCard
                key={p.id}
                className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card transition-all duration-200 hover:border-border hover:shadow-md"
              >
              {/* Image */}
              <div className="relative h-44 overflow-hidden bg-muted sm:h-48">
                {p.image ? (
                  <Image
                    src={p.image}
                    alt={p.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}

                {/* Top-left badges */}
                <div className="absolute top-3 left-3 flex gap-1.5">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      p.available
                        ? "border-primary/20 bg-primary text-primary-foreground"
                        : "border-destructive/20 bg-destructive text-destructive-foreground"
                    }`}
                  >
                    {p.available ? "Available" : "Unavailable"}
                  </span>
                  {p.featured && (
                    <span className="rounded-full border border-accent/20 bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                      Featured
                    </span>
                  )}
                  {flashSaleStatus ? (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        flashSaleStatus === "Live"
                          ? "border-orange-200 bg-orange-500 text-white"
                          : flashSaleStatus === "Scheduled"
                            ? "border-blue-200 bg-blue-600 text-white"
                            : "border-muted bg-muted text-muted-foreground"
                      }`}
                    >
                      Flash {flashSaleStatus}
                    </span>
                  ) : null}
                </div>

                {/* Top-right type badge */}
                <div className="absolute top-3 right-3">
                  <span className="rounded-full border border-border/60 bg-destructive px-2 py-0.5 text-[11px] text-destructive-foreground">
                    {p.type || "-"}
                  </span>
                </div>
              </div>

              <CardContent className="flex flex-1 flex-col p-4">
                {/* Top content */}
                <div>
                  {/* Name + Price */}
                  <div className="mb-1 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <h3 className="line-clamp-2 min-h-[40px] font-medium text-[15px] leading-snug">
                      {p.name}
                    </h3>
                    <span className="whitespace-nowrap font-medium text-[15px]">
                      ৳{p.basePrice}
                    </span>
                  </div>

                  <p className="mb-3 text-[11px] text-muted-foreground">
                    SKU: {p.sku || "-"}
                  </p>

                  {/* Meta grid */}
                  <div className="mb-3 grid grid-cols-2 gap-1.5">
                    {[
                      { label: "Category", value: p.category?.name || "-" },
                      { label: "Brand", value: p.brand?.name || "-" },
                      ...(p.type === "PHYSICAL"
                        ? [
                            {
                              label: "Stock",
                              value: `${getProductInventorySummary(p).totalStock} units`,
                            },
                            {
                              label: "Threshold",
                              value: `${p.lowStockThreshold ?? 10} units`,
                            },
                          ]
                        : [
                            { label: "Type", value: p.type || "-" },
                            {
                              label: "Status",
                              value: p.available ? "Available" : "Unavailable",
                            },
                          ]),
                    ].map(({ label, value }) => (
                      <div
                        key={label}
                        className="rounded-lg bg-muted/60 px-2.5 py-2"
                      >
                        <p className="mb-0.5 text-[10px] text-muted-foreground">
                          {label}
                        </p>
                        <p className="break-words text-[12px] font-medium sm:truncate">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Inventory status badges */}
                  <div className="min-h-[28px]">
                    {p.type === "PHYSICAL" && (
                      <div className="mb-3 flex flex-wrap gap-1.5">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getStatusBadgeClasses(
                            getProductInventorySummary(p).status,
                          )}`}
                        >
                          {getStatusLabel(getProductInventorySummary(p).status)}
                        </span>

                        {getProductInventorySummary(p).lowCount > 0 && (
                          <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                            {getProductInventorySummary(p).lowCount} low variant
                            {getProductInventorySummary(p).lowCount > 1
                              ? "s"
                              : ""}
                          </span>
                        )}

                        {getProductInventorySummary(p).outCount > 0 && (
                          <span className="rounded-full border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                            {getProductInventorySummary(p).outCount} out
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions fixed bottom */}
                <div className="mt-auto border-t border-border/50 pt-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => openEdit(p)}
                      variant="default"
                      size="sm"
                      className="w-full text-xs"
                    >
                      <Edit3 className="mr-1 h-3 w-3" />
                      Edit
                    </Button>

                    <Button
                      onClick={() => openManage(p)}
                      variant="default"
                      size="sm"
                      className="w-full text-xs"
                    >
                      Manage
                    </Button>

                    <Button
                      onClick={() => openAvailabilityModal(p)}
                      variant="outline"
                      size="sm"
                      aria-label={`${p.available ? "Deactivate" : "Activate"} ${p.name}`}
                      className={`w-full text-xs ${
                        p.available
                          ? "border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          : "border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
                      }`}
                    >
                      {p.available ? (
                        <PowerOff className="mr-1 h-3.5 w-3.5" />
                      ) : (
                        <Power className="mr-1 h-3.5 w-3.5" />
                      )}
                      {p.available ? "Deactivate" : "Activate"}
                    </Button>

                    <Button
                      onClick={() => openFlashSaleModal(p)}
                      variant="outline"
                      size="sm"
                      className="w-full border-orange-300 text-orange-700 hover:bg-orange-50 hover:text-orange-800"
                    >
                      <Flame className="mr-1 h-3.5 w-3.5" />
                      Flash Sale
                    </Button>

                    <Button
                      onClick={() => openDeleteModal(p)}
                      variant="destructive"
                      size="sm"
                      aria-label={`Delete ${p.name}`}
                      className="h-9 w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
              </SpotlightCard>
            );
          })}
        </div>
      )}

      {!loading && filtered.length > 0 && totalPages > 1 && (
        <div className="mb-6 flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {paginationPages.map((page) => (
              <Button
                key={page}
                type="button"
                variant={page === currentPage ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentPage(page)}
                className="min-w-8"
              >
                {page}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage === totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <Card className="mx-4 mb-6 border bg-card p-6 text-center shadow-sm sm:mx-6 sm:p-10">
          <h3 className="text-xl font-bold mb-2">
            {warehouseId
              ? `No products found in ${selectedWarehouseLabel}`
              : "No products found"}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {warehouseId || hasActiveFilters
              ? "Try adjusting your filters or selecting a different warehouse."
              : "Try adjusting your search or add your first product."}
          </p>
          {hasActiveFilters && (
            <div className="mb-4">
              <Button variant="outline" onClick={clearFilters}>
                Clear Filters
              </Button>
            </div>
          )}
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" /> Add Product
          </Button>
        </Card>
      )}

      {modalOpen && (
        <ProductAddModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          editing={editing}
          onSubmit={editing ? onUpdate : onCreate}
          categories={categories}
          brands={brands}
          vatClasses={vatClasses}
          digitalAssets={digitalAssets}
        />
      )}

      {manageOpen && (
        <ProductRelationsModal
          open={manageOpen}
          onClose={() => {
            setManageOpen(false);
            setManagingProduct(null);
          }}
          product={
            managingProduct
              ? {
                  id: managingProduct.id,
                  name: managingProduct.name,
                  type: managingProduct.type,
                }
              : null
          }
        />
      )}

      {attributesOpen && (
        <AttributesManagerModal
          open={attributesOpen}
          onClose={() => setAttributesOpen(false)}
        />
      )}

      {digitalAssetsOpen && (
        <DigitalAssetManagerModal
          open={digitalAssetsOpen}
          onClose={() => setDigitalAssetsOpen(false)}
        />
      )}
    </div>
  );
}
