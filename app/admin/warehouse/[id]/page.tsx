"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Search, ChevronLeft, ChevronRight, Calendar } from "lucide-react";

type WarehouseDetailsResponse = {
  warehouse: any;
  summary: {
    totalUnits: number;
    reservedUnits: number;
    availableUnits: number;
    productVariants: number;
    distinctProducts: number;
    lowStockItems: number;
    outOfStockItems: number;
    shipments: { total: number; byStatus: Record<string, number> };
    deliveredToday: number;
    soldUnits: number;
    deliveryMen: { count: number };
    deliveryAssignments: { total: number; byStatus: Record<string, number> };
    staff: { count: number };
  };
  stockLevels: Array<{
    id: number;
    quantity: number;
    reserved: number;
    available: number;
    updatedAt: string;
    soldUnits: number;
    variant: {
      id: number;
      sku: string | null;
      lowStockThreshold: number;
      product: {
        id: number;
        name: string;
        type: string;
        categoryId?: number;
        category?: {
          id: number;
          name: string;
          slug: string;
        };
      };
    };
  }>;
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
  filters: {
    categories: Array<{
      id: number;
      name: string;
      slug: string;
    }>;
  };
};

function FieldRow({ label, value }: { label: string; value: any }) {
  const rendered =
    value === null || value === undefined || value === ""
      ? "-"
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

  return (
    <div className="grid grid-cols-1 gap-1 rounded-lg border border-border bg-background px-3 py-2 text-sm md:grid-cols-[220px_1fr]">
      <div className="font-medium text-foreground">{label}</div>
      <div className="break-words text-muted-foreground">{rendered}</div>
    </div>
  );
}

export default function WarehouseDetailsPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params?.id;

  const [data, setData] = useState<WarehouseDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [allStockLevels, setAllStockLevels] = useState<
    WarehouseDetailsResponse["stockLevels"]
  >([]);
  const [filtersLoading, setFiltersLoading] = useState(false);

  const currentPage = Number(searchParams.get("page") || "1");
  const search = searchParams.get("search") || "";
  const category = searchParams.get("category") || "";
  const productType = searchParams.get("productType") || "";
  const soldFilter = searchParams.get("soldFilter") || "";
  const sortBy = searchParams.get("sortBy") || "name";
  const sortOrder = searchParams.get("sortOrder") || "asc";
  const dateFrom = searchParams.get("dateFrom") || "";
  const dateTo = searchParams.get("dateTo") || "";

  const updateURL = (updates: Record<string, string | number | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });

    const newUrl = `/admin/settings/warehouses/${id}?${params.toString()}`;
    router.push(newUrl, { scroll: false });
  };

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError("");

        // Build query parameters for API call
        const queryParams = new URLSearchParams();
        queryParams.set("limit", "1000");

        if (search) queryParams.set("search", search);
        if (category) queryParams.set("category", category);
        if (productType) queryParams.set("productType", productType);
        if (soldFilter) queryParams.set("soldFilter", soldFilter);
        if (sortBy) queryParams.set("sortBy", sortBy);
        if (sortOrder) queryParams.set("sortOrder", sortOrder);
        if (dateFrom) queryParams.set("dateFrom", dateFrom);
        if (dateTo) queryParams.set("dateTo", dateTo);

        const res = await fetch(
          `/api/warehouses/${id}/details?${queryParams.toString()}`,
          {
            cache: "no-store",
          },
        );

        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(payload?.error || "Failed to load warehouse details");
        }

        setData(payload);
        setAllStockLevels(payload.stockLevels || []);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to load warehouse details",
        );
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      void run();
    }
  }, [id, search, category, productType, soldFilter, sortBy, sortOrder, dateFrom, dateTo]);

  const warehouseFields = useMemo(() => {
    const warehouse = data?.warehouse;
    if (!warehouse) return [] as Array<{ key: string; value: any }>;

    return Object.keys(warehouse)
      .sort()
      .map((key) => ({ key, value: warehouse[key] }));
  }, [data?.warehouse]);

  const shipmentStatusItems = useMemo(() => {
    const byStatus = data?.summary.shipments.byStatus;
    if (!byStatus) return null;

    return Object.entries(byStatus)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([status, count]) => (
        <div
          key={status}
          className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <span className="text-muted-foreground">{status}</span>
          <span className="font-medium text-foreground">{count}</span>
        </div>
      ));
  }, [data?.summary.shipments.byStatus]);

  const assignmentStatusItems = useMemo(() => {
    const byStatus = data?.summary.deliveryAssignments.byStatus;
    if (!byStatus) return null;

    return Object.entries(byStatus)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([status, count]) => (
        <div
          key={status}
          className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <span className="text-muted-foreground">{status}</span>
          <span className="font-medium text-foreground">{count}</span>
        </div>
      ));
  }, [data?.summary.deliveryAssignments.byStatus]);

  const processedStockLevels = useMemo(() => {
    let filtered = [...allStockLevels];

    filtered.sort((a, b) => {
      let aValue: string | number = "";
      let bValue: string | number = "";

      switch (sortBy) {
        case "name":
          aValue = a.variant.product.name.toLowerCase();
          bValue = b.variant.product.name.toLowerCase();
          break;
        case "quantity":
          aValue = a.quantity;
          bValue = b.quantity;
          break;
        case "available":
          aValue = a.available;
          bValue = b.available;
          break;
        case "sold":
          aValue = a.soldUnits || 0;
          bValue = b.soldUnits || 0;
          break;
        case "updatedAt":
          aValue = new Date(a.updatedAt).getTime();
          bValue = new Date(b.updatedAt).getTime();
          break;
        default:
          aValue = a.variant.product.name.toLowerCase();
          bValue = b.variant.product.name.toLowerCase();
      }

      if (sortOrder === "desc") {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }

      return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
    });

    return filtered;
  }, [
    allStockLevels,
    sortBy,
    sortOrder,
  ]);

  const filteredAndPaginatedStockLevels = useMemo(() => {
    const startIndex = (currentPage - 1) * 20;
    const endIndex = startIndex + 20;
    return processedStockLevels.slice(startIndex, endIndex);
  }, [processedStockLevels, currentPage]);

  const paginationInfo = useMemo(() => {
    const totalCount = processedStockLevels.length;
    const totalPages = Math.ceil(totalCount / 20);
    const startIndex = (currentPage - 1) * 20;
    const endIndex = Math.min(currentPage * 20, totalCount);

    return {
      totalCount,
      totalPages,
      startIndex: startIndex + 1,
      endIndex,
      currentPage,
    };
  }, [processedStockLevels, currentPage]);

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Warehouse Details
            {data?.warehouse?.name ? `: ${data.warehouse.name}` : ""}
          </h1>
          {data?.warehouse?.code ? (
            <p className="text-sm text-muted-foreground">
              Code: {data.warehouse.code}
            </p>
          ) : null}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => router.push("/admin/warehouse")}
            className="btn-secondary rounded px-4 py-2"
          >
            Back
          </button>

          <button
            onClick={() => {
              window.location.reload();
            }}
            className="btn-primary rounded px-4 py-2"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card-theme rounded-lg border p-4">
          <div className="animate-pulse space-y-2">
            <div className="h-4 w-1/3 rounded bg-muted"></div>
            <div className="h-4 w-1/2 rounded bg-muted"></div>
            <div className="h-4 w-2/3 rounded bg-muted"></div>
          </div>
        </div>
      ) : error ? (
        <div className="card-theme rounded-lg border p-4">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <div className="card-theme rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Products</p>
              <p className="text-2xl font-bold">
                {data.summary.distinctProducts}
              </p>
              <p className="text-xs text-muted-foreground">
                {data.summary.productVariants} variants
              </p>
            </div>

            <div className="card-theme rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Stock Units</p>
              <p className="text-2xl font-bold">{data.summary.totalUnits}</p>
              <p className="text-xs text-muted-foreground">
                {data.summary.availableUnits} available ·{" "}
                {data.summary.reservedUnits} reserved
              </p>
            </div>

            <div className="card-theme rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Sold Units</p>
              <p className="text-2xl font-bold">{data.summary.soldUnits}</p>
              <p className="text-xs text-muted-foreground">
                Delivered shipment items
              </p>
            </div>

            <div className="card-theme rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Delivery Men</p>
              <p className="text-2xl font-bold">
                {data.summary.deliveryMen.count}
              </p>
              <p className="text-xs text-muted-foreground">
                Staff: {data.summary.staff.count}
              </p>
            </div>
          </div>

          {/* Global Filters Section */}
          <div className="card-theme rounded-lg border p-4 space-y-4">
            <h2 className="text-lg font-semibold">Filters</h2>

            <div className="flex flex-wrap gap-4">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={search}
                  onChange={(e) =>
                    updateURL({ search: e.target.value, page: 1 })
                  }
                  className="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary dark:border-border/50 dark:bg-background dark:focus:ring-primary/50"
                />
              </div>

              {/* Date Range */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Date Range:
                  </span>
                </div>

                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) =>
                    updateURL({ dateFrom: e.target.value, page: 1 })
                  }
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary dark:border-border/50 dark:bg-background dark:focus:ring-primary/50"
                />

                <span className="text-sm text-muted-foreground">to</span>

                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) =>
                    updateURL({ dateTo: e.target.value, page: 1 })
                  }
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary dark:border-border/50 dark:bg-background dark:focus:ring-primary/50"
                />

                {(dateFrom || dateTo) && (
                  <button
                    onClick={() =>
                      updateURL({ dateFrom: null, dateTo: null, page: 1 })
                    }
                    className="text-sm text-red-600 hover:underline dark:text-red-400"
                  >
                    Clear Dates
                  </button>
                )}
              </div>

              {/* Category Filter */}
              <select
                value={category}
                onChange={(e) =>
                  updateURL({ category: e.target.value, page: 1 })
                }
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary dark:border-border/50 dark:bg-background dark:focus:ring-primary/50"
              >
                <option value="">All Categories</option>
                {data?.filters.categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>

              {/* Product Type Filter */}
              <select
                value={productType}
                onChange={(e) =>
                  updateURL({ productType: e.target.value, page: 1 })
                }
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary dark:border-border/50 dark:bg-background dark:focus:ring-primary/50"
              >
                <option value="">All Types</option>
                <option value="PHYSICAL">Physical</option>
                <option value="DIGITAL">Digital</option>
                <option value="SERVICE">Service</option>
              </select>

              {/* Sold Filter */}
              <select
                value={soldFilter}
                onChange={(e) =>
                  updateURL({ soldFilter: e.target.value, page: 1 })
                }
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary dark:border-border/50 dark:bg-background dark:focus:ring-primary/50"
              >
                <option value="">All Products</option>
                <option value="best-selling">🔥 Best Selling (Top 20%)</option>
                <option value="low-selling">📉 Low Selling (Bottom 20%)</option>
              </select>

              {/* Sort */}
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [newSortBy, newSortOrder] = e.target.value.split("-");
                  updateURL({
                    sortBy: newSortBy,
                    sortOrder: newSortOrder,
                    page: 1,
                  });
                }}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary dark:border-border/50 dark:bg-background dark:focus:ring-primary/50"
              >
                <option value="name-asc">Name (A-Z)</option>
                <option value="name-desc">Name (Z-A)</option>
                <option value="quantity-asc">Quantity (Low to High)</option>
                <option value="quantity-desc">Quantity (High to Low)</option>
                <option value="available-asc">Available (Low to High)</option>
                <option value="available-desc">Available (High to Low)</option>
                <option value="sold-desc">Best Selling</option>
                <option value="sold-asc">Low Selling</option>
                <option value="updatedAt-desc">Recently Updated</option>
              </select>
            </div>

            {/* Active Filters */}
            {(search ||
              category ||
              productType ||
              soldFilter ||
              dateFrom ||
              dateTo) && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
                <span className="text-sm text-muted-foreground">
                  Active filters:
                </span>
                {search && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary dark:bg-primary/20">
                    Search: {search}
                    <button
                      onClick={() => updateURL({ search: null, page: 1 })}
                      className="ml-1 hover:text-primary/80 dark:hover:text-primary/70"
                    >
                      ×
                    </button>
                  </span>
                )}

                {category && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary dark:bg-primary/20">
                    Category:{" "}
                    {data?.filters.categories.find(
                      (c) => c.id === Number(category),
                    )?.name || category}
                    <button
                      onClick={() => updateURL({ category: null, page: 1 })}
                      className="ml-1 hover:text-primary/80 dark:hover:text-primary/70"
                    >
                      ×
                    </button>
                  </span>
                )}

                {productType && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary dark:bg-primary/20">
                    Type: {productType}
                    <button
                      onClick={() => updateURL({ productType: null, page: 1 })}
                      className="ml-1 hover:text-primary/80 dark:hover:text-primary/70"
                    >
                      ×
                    </button>
                  </span>
                )}

                {soldFilter && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary dark:bg-primary/20">
                    {soldFilter === "best-selling"
                      ? "🔥 Best Selling"
                      : "📉 Low Selling"}
                    <button
                      onClick={() => updateURL({ soldFilter: null, page: 1 })}
                      className="ml-1 hover:text-primary/80 dark:hover:text-primary/70"
                    >
                      ×
                    </button>
                  </span>
                )}

                {(dateFrom || dateTo) && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary dark:bg-primary/20">
                    Date:{" "}
                    {dateFrom && dateTo
                      ? `${dateFrom} to ${dateTo}`
                      : dateFrom
                        ? `From ${dateFrom}`
                        : `Until ${dateTo}`}
                    <button
                      onClick={() =>
                        updateURL({ dateFrom: null, dateTo: null, page: 1 })
                      }
                      className="ml-1 hover:text-primary/80 dark:hover:text-primary/70"
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="card-theme rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Shipments</h2>
                {(dateFrom || dateTo) && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {dateFrom && dateTo
                        ? `${dateFrom} to ${dateTo}`
                        : dateFrom
                          ? `From ${dateFrom}`
                          : `Until ${dateTo}`}
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-xl font-bold text-foreground">
                    {data.summary.shipments.total}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Delivered today: {data.summary.deliveredToday}
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-xs text-muted-foreground">Issues</p>
                  <p className="text-xl font-bold text-foreground">
                    {data.summary.lowStockItems} low stock
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data.summary.outOfStockItems} out of stock
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {shipmentStatusItems}
              </div>
            </div>

            <div className="card-theme rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Delivery Assignments</h2>
                {(dateFrom || dateTo) && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {dateFrom && dateTo
                        ? `${dateFrom} to ${dateTo}`
                        : dateFrom
                          ? `From ${dateFrom}`
                          : `Until ${dateTo}`}
                    </span>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-xl font-bold text-foreground">
                  {data.summary.deliveryAssignments.total}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {assignmentStatusItems}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1">
            <div className="card-theme rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Quick Summary</h2>
                {(dateFrom || dateTo) && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {dateFrom && dateTo
                        ? `${dateFrom} to ${dateTo}`
                        : dateFrom
                          ? `From ${dateFrom}`
                          : `Until ${dateTo}`}
                    </span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <FieldRow label="Total Units" value={data.summary.totalUnits} />
                <FieldRow
                  label="Reserved Units"
                  value={data.summary.reservedUnits}
                />
                <FieldRow
                  label="Available Units"
                  value={data.summary.availableUnits}
                />
                <FieldRow
                  label="Distinct Products"
                  value={data.summary.distinctProducts}
                />
                <FieldRow
                  label="Product Variants"
                  value={data.summary.productVariants}
                />
                <FieldRow
                  label="Low Stock Items"
                  value={data.summary.lowStockItems}
                />
                <FieldRow
                  label="Out of Stock Items"
                  value={data.summary.outOfStockItems}
                />
                <FieldRow label="Sold Units" value={data.summary.soldUnits} />
                <FieldRow
                  label="Delivered Today"
                  value={data.summary.deliveredToday}
                />
                <FieldRow
                  label="Delivery Men"
                  value={data.summary.deliveryMen.count}
                />
                <FieldRow
                  label="Staff Count"
                  value={data.summary.staff.count}
                />
                <FieldRow
                  label="Assignments Total"
                  value={data.summary.deliveryAssignments.total}
                />
              </div>
            </div>
          </div>

          <div className="card-theme rounded-lg border p-4 space-y-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold">
                  Products in this Warehouse
                </h2>
                {(dateFrom || dateTo) && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {dateFrom && dateTo
                        ? `${dateFrom} to ${dateTo}`
                        : dateFrom
                          ? `From ${dateFrom}`
                          : `Until ${dateTo}`}
                    </span>
                  </div>
                )}
              </div>

              <div className="text-sm text-muted-foreground">
                Showing {filteredAndPaginatedStockLevels.length} of{" "}
                {paginationInfo.totalCount} products
                {soldFilter && (
                  <span className="ml-2">
                    (
                    {soldFilter === "best-selling"
                      ? "🔥 Best Selling"
                      : "📉 Low Selling"}
                    )
                  </span>
                )}
              </div>
            </div>

            <div className="relative">
              {filtersLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                  <div className="text-sm text-muted-foreground">
                    Filtering...
                  </div>
                </div>
              )}

              {filteredAndPaginatedStockLevels.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    {search ||
                    category ||
                    productType ||
                    soldFilter ||
                    dateFrom ||
                    dateTo
                      ? "No products found matching your filters."
                      : "No stock levels found for this warehouse."}
                  </p>

                  {(search ||
                    category ||
                    productType ||
                    soldFilter ||
                    dateFrom ||
                    dateTo) && (
                    <button
                      onClick={() =>
                        updateURL({
                          search: null,
                          category: null,
                          productType: null,
                          soldFilter: null,
                          dateFrom: null,
                          dateTo: null,
                          page: 1,
                        })
                      }
                      className="mt-2 text-sm text-primary hover:underline dark:text-primary/80"
                    >
                      Clear all filters
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="px-2 py-2">Product</th>
                          <th className="px-2 py-2">Category</th>
                          <th className="px-2 py-2">Type</th>
                          <th className="px-2 py-2">SKU</th>
                          <th className="px-2 py-2">Qty</th>
                          <th className="px-2 py-2">Reserved</th>
                          <th className="px-2 py-2">Available</th>
                          <th className="px-2 py-2">Sold Units</th>
                          <th className="px-2 py-2">Low Stock</th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredAndPaginatedStockLevels.map((level) => {
                          const isLowStock =
                            level.available > 0 &&
                            level.available <= level.variant.lowStockThreshold;
                          const isOutOfStock = level.available <= 0;

                          return (
                            <tr
                              key={level.id}
                              className="border-b border-border/60"
                            >
                              <td className="px-2 py-3 font-medium text-foreground">
                                {level.variant.product.name}
                              </td>

                              <td className="px-2 py-3 text-muted-foreground">
                                {level.variant.product.category?.name || "-"}
                              </td>

                              <td className="px-2 py-3 text-muted-foreground">
                                <span className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs">
                                  {level.variant.product.type}
                                </span>
                              </td>

                              <td className="px-2 py-3 text-muted-foreground">
                                {level.variant.sku || "-"}
                              </td>

                              <td className="px-2 py-3 text-foreground">
                                {level.quantity}
                              </td>

                              <td className="px-2 py-3 text-foreground">
                                {level.reserved}
                              </td>

                              <td className="px-2 py-3 font-medium text-foreground">
                                {level.available}
                              </td>

                              <td className="px-2 py-3 text-foreground">
                                {level.soldUnits}
                              </td>

                              <td className="px-2 py-3">
                                {isOutOfStock ? (
                                  <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                    Out of Stock
                                  </span>
                                ) : isLowStock ? (
                                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                    Low Stock ({level.variant.lowStockThreshold}
                                    )
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                    OK
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {paginationInfo.totalPages > 1 && (
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="text-sm text-muted-foreground">
                        Showing{" "}
                        {paginationInfo.totalCount > 0
                          ? paginationInfo.startIndex
                          : 0}{" "}
                        to {paginationInfo.endIndex} of{" "}
                        {paginationInfo.totalCount} products
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            updateURL({
                              page: Math.max(1, paginationInfo.currentPage - 1),
                            })
                          }
                          disabled={paginationInfo.currentPage <= 1}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 dark:border-border/50 dark:bg-background dark:hover:bg-muted/50"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </button>

                        <div className="flex items-center gap-1">
                          {Array.from(
                            {
                              length: Math.min(5, paginationInfo.totalPages),
                            },
                            (_, i) => {
                              let pageNum: number;

                              if (paginationInfo.totalPages <= 5) {
                                pageNum = i + 1;
                              } else if (paginationInfo.currentPage <= 3) {
                                pageNum = i + 1;
                              } else if (
                                paginationInfo.currentPage >=
                                paginationInfo.totalPages - 2
                              ) {
                                pageNum = paginationInfo.totalPages - 4 + i;
                              } else {
                                pageNum = paginationInfo.currentPage - 2 + i;
                              }

                              return (
                                <button
                                  key={pageNum}
                                  onClick={() => updateURL({ page: pageNum })}
                                  className={`h-8 w-8 rounded-lg text-sm ${
                                    pageNum === paginationInfo.currentPage
                                      ? "bg-primary text-primary-foreground"
                                      : "border border-border bg-background hover:bg-muted dark:border-border/50 dark:bg-background dark:hover:bg-muted/50"
                                  }`}
                                >
                                  {pageNum}
                                </button>
                              );
                            },
                          )}
                        </div>

                        <button
                          onClick={() =>
                            updateURL({
                              page: Math.min(
                                paginationInfo.totalPages,
                                paginationInfo.currentPage + 1,
                              ),
                            })
                          }
                          disabled={
                            paginationInfo.currentPage >=
                            paginationInfo.totalPages
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 dark:border-border/50 dark:bg-background dark:hover:bg-muted/50"
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
