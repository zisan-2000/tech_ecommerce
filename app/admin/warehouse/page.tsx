"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  Loader2,
  Plus,
  PackageCheck,
  RefreshCw,
  Truck,
  Warehouse,
  Map,
  LayoutDashboard,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import WarehouseDashboardSkeleton from "@/components/ui/WarehouseDashboardSkeleton";
import WarehouseLocationPicker from "@/components/Settings/WarehouseLocationPicker";
import WarehouseFormModal from "@/components/Settings/WarehouseFormModal";
import WarehouseSkeleton from "@/components/ui/WarehouseSkeleton";
import {
  Warehouse as WarehouseType,
  WarehouseMapData,
} from "@/lib/types/warehouse";

type WarehouseOption = {
  id: number;
  name: string;
  code: string;
  isDefault: boolean;
};

type WarehouseCard = {
  warehouseId: number;
  name: string;
  code: string;
  isDefault: boolean;
  totalUnits: number;
  reservedUnits: number;
  lowStockItems: number;
  pendingShipments: number;
  deliveredToday: number;
};

type DashboardData = {
  selectedWarehouseIds: number[];
  warehouses: WarehouseOption[];
  summary: {
    totalWarehouses: number;
    totalUnits: number;
    reservedUnits: number;
    lowStockItems: number;
    pendingShipments: number;
    deliveredToday: number;
    ordersInQueue: number;
  };
  warehouseCards: WarehouseCard[];
  lowStock: Array<{
    warehouseId: number;
    variantId: number;
    sku: string | null;
    productName: string;
    available: number;
    threshold: number;
  }>;
  recentShipments: Array<{
    id: number;
    warehouseId: number | null;
    orderId: number;
    status: string;
    courier: string;
    trackingNumber: string | null;
    createdAt: string;
    customerName: string;
    orderStatus: string;
  }>;
  recentLogs: Array<{
    id: number;
    createdAt: string;
    change: number;
    reason: string;
    productName: string;
    warehouseName: string;
    warehouseCode: string;
  }>;
};

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function WarehouseDashboardPage() {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [mapData, setMapData] = useState<WarehouseMapData[]>([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
  const [warehousesLoading, setWarehousesLoading] = useState(true);
  const [showAddWarehouseModal, setShowAddWarehouseModal] = useState(false);
  const [editingWarehouse, setEditingWarehouse] =
    useState<WarehouseType | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const fetchDashboard = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");

      const response = await fetch("/api/admin/warehouse-dashboard", {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load warehouse dashboard");
      }

      setData(payload);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to load warehouse dashboard",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadMapData = useCallback(async () => {
    setMapLoading(true);
    try {
      const res = await fetch("/api/warehouses/map");
      const data = await res.json();
      setMapData(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load map data:", error);
      setMapData([]);
    } finally {
      setMapLoading(false);
    }
  }, []);

  const loadWarehouses = useCallback(async () => {
    setWarehousesLoading(true);
    try {
      const res = await fetch("/api/warehouses", { cache: "no-store" });
      const payload = await res.json().catch(() => []);
      setWarehouses(Array.isArray(payload) ? payload : []);
    } catch (error) {
      console.error("Failed to load warehouses:", error);
      setWarehouses([]);
    } finally {
      setWarehousesLoading(false);
    }
  }, []);

  const selectedMapWarehouseId =
    warehouseId && warehouseId !== "all" ? warehouseId : null;

  useEffect(() => {
    fetchDashboard();
    loadMapData();
    loadWarehouses();
  }, [fetchDashboard, loadMapData, loadWarehouses]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchDashboard(true), loadMapData(), loadWarehouses()]);
  }, [fetchDashboard, loadMapData, loadWarehouses]);

  const selectedWarehouseLabel = useMemo(() => {
    if (!data) return "All assigned warehouses";

    if (data.selectedWarehouseIds.length === 0) {
      return "All assigned warehouses";
    }

    const selectedWarehouses = data.warehouses.filter((warehouse) =>
      data.selectedWarehouseIds.includes(warehouse.id),
    );

    if (selectedWarehouses.length === 1) {
      const selected = selectedWarehouses[0];
      return `${selected.name} (${selected.code})`;
    }

    if (selectedWarehouses.length > 1) {
      return `${selectedWarehouses.length} warehouses selected`;
    }

    return "Assigned warehouses";
  }, [data]);

  const summaryCards = useMemo(
    () => [
      {
        title: "Warehouse Scope",
        value: String(data?.summary.totalWarehouses ?? 0),
        note: selectedWarehouseLabel,
        icon: Warehouse,
      },
      {
        title: "Units On Hand",
        value: String(data?.summary.totalUnits ?? 0),
        note: `${data?.summary.reservedUnits ?? 0} reserved units`,
        icon: Boxes,
      },
      {
        title: "Pending Shipments",
        value: String(data?.summary.pendingShipments ?? 0),
        note: `${data?.summary.ordersInQueue ?? 0} still pending`,
        icon: Truck,
      },
      {
        title: "Low Stock Alerts",
        value: String(data?.summary.lowStockItems ?? 0),
        note: `${data?.summary.deliveredToday ?? 0} delivered today`,
        icon: AlertTriangle,
      },
    ],
    [data, selectedWarehouseLabel],
  );

  const handleWarehouseCardClick = useCallback(
    (selectedWarehouseId: number) => {
      setWarehouseId(String(selectedWarehouseId));
    },
    [],
  );

  const warehouseCardItems = useMemo(() => {
    if (!data?.warehouseCards.length) return null;

    return data.warehouseCards.map((card) => {
      const isSelected = String(card.warehouseId) === warehouseId;
      return (
        <button
          type="button"
          key={card.warehouseId}
          onClick={() => void handleWarehouseCardClick(card.warehouseId)}
          className={`grid gap-3 w-full rounded-2xl border bg-background p-4 text-left transition hover:bg-accent/10 focus:outline-none md:grid-cols-6 ${
            isSelected ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          <div className="md:col-span-2">
            <p className="font-medium text-foreground">
              {card.name} ({card.code})
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {card.isDefault ? "Default warehouse" : "Operational warehouse"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                {Math.max(0, card.totalUnits - card.reservedUnits)} available
              </span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700">
                {card.deliveredToday} delivered today
              </span>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Units
            </p>
            <p className="mt-1 text-base font-semibold text-foreground">
              {card.totalUnits}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Reserved
            </p>
            <p className="mt-1 text-base font-semibold text-foreground">
              {card.reservedUnits}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Low Stock
            </p>
            <p className="mt-1 text-base font-semibold text-foreground">
              {card.lowStockItems}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Shipments
            </p>
            <p className="mt-1 text-base font-semibold text-foreground">
              {card.pendingShipments} pending
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Pressure indicator
            </p>
          </div>
        </button>
      );
    });
  }, [data?.warehouseCards, handleWarehouseCardClick, warehouseId]);

  const lowStockItems = useMemo(() => {
    if (!data?.lowStock.length) return null;

    // Filter by selected warehouse if one is selected
    const filteredLowStock = warehouseId
      ? data.lowStock.filter((item) => String(item.warehouseId) === warehouseId)
      : data.lowStock;

    return filteredLowStock.map((item) => (
      <div
        key={`${item.warehouseId}:${item.variantId}`}
        className="rounded-2xl border bg-background p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium text-foreground">{item.productName}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {item.sku || "No SKU"} · Warehouse #{item.warehouseId}
            </p>
          </div>
          <div className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700">
            {item.available} left
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Threshold: {item.threshold} units
        </p>
      </div>
    ));
  }, [data?.lowStock, warehouseId]);

  const recentShipmentItems = useMemo(() => {
    if (!data?.recentShipments.length) return null;

    // Filter by selected warehouse if one is selected
    const filteredShipments = warehouseId
      ? data.recentShipments.filter(
          (shipment) =>
            shipment.warehouseId &&
            String(shipment.warehouseId) === warehouseId,
        )
      : data.recentShipments;

    return filteredShipments.map((shipment) => (
      <div key={shipment.id} className="rounded-2xl border bg-background p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium text-foreground">
              Shipment #{shipment.id} for Order #{shipment.orderId}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {shipment.customerName || "Unknown customer"} · {shipment.courier}
            </p>
          </div>
          <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {shipment.status}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>Order: {shipment.orderStatus || "-"}</span>
          <span>Tracking: {shipment.trackingNumber || "-"}</span>
          <span>{formatDateTime(shipment.createdAt)}</span>
        </div>
      </div>
    ));
  }, [data?.recentShipments, warehouseId]);

  const recentLogItems = useMemo(() => {
    if (!data?.recentLogs.length) return null;

    // Filter by selected warehouse if one is selected
    let filteredLogs = data.recentLogs;
    if (warehouseId) {
      const selectedWarehouse = data.warehouses.find(
        (w) => String(w.id) === warehouseId,
      );
      if (selectedWarehouse) {
        filteredLogs = data.recentLogs.filter(
          (log) => log.warehouseName === selectedWarehouse.name,
        );
      }
    }

    return filteredLogs.map((log) => (
      <div key={log.id} className="rounded-2xl border bg-background p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium text-foreground">{log.productName}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {log.warehouseName} ({log.warehouseCode || "-"})
            </p>
          </div>
          <div
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              log.change >= 0
                ? "bg-emerald-500/10 text-emerald-700"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {log.change > 0 ? `+${log.change}` : log.change}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{log.reason}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {formatDateTime(log.createdAt)}
        </p>
      </div>
    ));
  }, [data?.recentLogs, data?.warehouses, warehouseId]);

  if (loading) {
    return <WarehouseDashboardSkeleton />;
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="space-y-6">
        <section className="rounded-3xl border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/70">
                Warehouse Operations
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">
                Warehouse Dashboard
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Monitor assigned warehouse activity, shipment queue, and stock
                health from a single scoped workspace.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-w-[240px] justify-between rounded-2xl px-4 py-3 text-sm font-medium"
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
                    }}
                  >
                    <DropdownMenuRadioItem value="all">
                      All assigned
                    </DropdownMenuRadioItem>
                    <DropdownMenuSeparator />
                    {data?.warehouses.map((warehouse) => (
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

              <Button
                type="button"
                className="rounded-2xl px-4 py-3 text-sm font-medium"
                onClick={() => setShowAddWarehouseModal(true)}
              >
                <Plus className="h-4 w-4" />
                Add Warehouse
              </Button>

              <button
                type="button"
                onClick={() => void refreshAll()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition hover:bg-accent"
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
            </div>
          </div>
          {error ? (
            <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <article
              key={card.title}
              className="rounded-3xl border bg-card p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">{card.title}</p>
                  <p className="mt-2 text-3xl font-semibold text-foreground">
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

        {/* Warehouse Section with Internal Tabs */}
        <section className="rounded-3xl border bg-card p-5 shadow-sm min-h-[600px]">
          <div className="flex flex-col gap-4 border-b pb-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                Warehouse Coverage & Management
              </h2>
              <p className="text-sm text-muted-foreground">
                Monitor warehouse coverage map, assigned warehouses, and manage
                warehouse configuration from one section.
              </p>
            </div>

            {/* Tab Navigation inside section */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveTab("overview")}
                className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "overview"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <LayoutDashboard className="h-4 w-4" />
                Warehouse Coverage
              </button>

              <button
                onClick={() => setActiveTab("management")}
                className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "management"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Settings className="h-4 w-4" />
                Warehouse Management
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="mt-6">
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                  <article className="rounded-3xl border bg-background p-5 shadow-sm">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">
                        Warehouse Coverage
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Assigned warehouses with current stock and shipment
                        pressure.
                      </p>
                    </div>

                    <div className="mt-4 space-y-3 max-h-[500px] overflow-y-auto pr-1">
                      {warehouseCardItems ? (
                        warehouseCardItems
                      ) : (
                        <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                          No assigned warehouses found for this dashboard.
                        </div>
                      )}
                    </div>
                  </article>

                  <article className="rounded-3xl border bg-background p-5 shadow-sm">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-foreground">
                        Warehouse Coverage Map
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Visual map of assigned warehouse locations and coverage.
                      </p>
                    </div>

                    {!mapLoading && mapData.length > 0 ? (
                      <div className="mb-4 text-sm text-muted-foreground">
                        {mapData.length} warehouse(s) found with location data
                        {warehouseId &&
                          warehouseId !== "all" &&
                          " · highlighting selected warehouse"}
                      </div>
                    ) : null}

                    {mapLoading ? (
                      <div className="animate-pulse space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                        <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                        <div className="h-96 bg-gray-200 rounded mt-4"></div>
                      </div>
                    ) : mapData.length === 0 ? (
                      <div className="text-center py-8">
                        <Map className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-sm text-muted-foreground">
                          {warehouseId && warehouseId !== "all"
                            ? "Selected warehouse has no location data. Add GPS coordinates to see it on the map."
                            : "No warehouses with location data found. Add GPS coordinates to warehouses to see them on the map."}
                        </p>
                      </div>
                    ) : (
                      <div className="relative">
                        <div
                          className="absolute inset-0 flex items-center justify-center bg-background/80 z-50"
                          id="map-error-boundary"
                          style={{ display: "none" }}
                        >
                          <div className="text-center">
                            <Map className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-sm text-muted-foreground">
                              Map failed to load. Please refresh the page.
                            </p>
                          </div>
                        </div>

                        <WarehouseLocationPicker
                          readonly
                          markers={mapData.map((warehouse) => ({
                            id: warehouse.id,
                            name: warehouse.name,
                            code: warehouse.code,
                            label: warehouse.mapLabel,
                            latitude: warehouse.latitude ?? 0,
                            longitude: warehouse.longitude ?? 0,
                            district: warehouse.district,
                            area: warehouse.area,
                            coverageRadiusKm:
                              warehouse.coverageRadiusKm ?? null,
                          }))}
                          selectedMarkerId={selectedMapWarehouseId}
                          title="Warehouse Coverage Map"
                          heightClassName="h-96"
                          onMarkerSelect={(id) => {
                            if (id !== null) {
                              setWarehouseId(String(id));
                            }
                          }}
                          onError={() => {
                            const errorBoundary =
                              document.getElementById("map-error-boundary");
                            if (errorBoundary) {
                              errorBoundary.style.display = "flex";
                            }
                          }}
                        />
                      </div>
                    )}
                  </article>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                  <article className="rounded-3xl border bg-background p-5 shadow-sm  max-h-[500px] overflow-y-auto pr-1">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">
                        Low Stock Watchlist
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Variants at or below their warehouse threshold.
                      </p>
                    </div>

                    <div className="mt-4 space-y-3">
                      {lowStockItems ? (
                        lowStockItems
                      ) : (
                        <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                          No low-stock alerts in the current warehouse scope.
                        </div>
                      )}
                    </div>
                  </article>

                  <article className="rounded-3xl border bg-background p-5 shadow-sm  max-h-[500px] overflow-y-auto pr-1">
                    <div className="flex items-center gap-2">
                      <PackageCheck className="h-4 w-4 text-primary" />
                      <h3 className="text-lg font-semibold text-foreground">
                        Recent Inventory Activity
                      </h3>
                    </div>

                    <div className="mt-4 space-y-3">
                      {recentLogItems ? (
                        recentLogItems
                      ) : (
                        <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                          No recent inventory events found.
                        </div>
                      )}
                    </div>
                  </article>
                </div>

                <article className="rounded-3xl border bg-background p-5 shadow-sm  max-h-[500px] overflow-y-auto pr-1">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-primary" />
                    <h3 className="text-lg font-semibold text-foreground">
                      Recent Shipments
                    </h3>
                  </div>

                  <div className="mt-4 space-y-3">
                    {recentShipmentItems ? (
                      recentShipmentItems
                    ) : (
                      <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                        No shipment activity found for this scope.
                      </div>
                    )}
                  </div>
                </article>
              </div>
            )}

            {activeTab === "management" && (
              <div className="space-y-6">
                <article className="rounded-3xl border bg-background p-5 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">
                        Warehouse Management
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Create, update, and maintain warehouse configuration.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() => void loadWarehouses()}
                        disabled={warehousesLoading}
                      >
                        {warehousesLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        Refresh
                      </Button>

                      <Button
                        type="button"
                        className="rounded-2xl"
                        onClick={() => setShowAddWarehouseModal(true)}
                      >
                        <Plus className="h-4 w-4" />
                        Add Warehouse
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {warehousesLoading ? (
                      <WarehouseSkeleton />
                    ) : warehouses.length === 0 ? (
                      <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                        No warehouses found.
                      </div>
                    ) : (
                      warehouses.map((warehouse) => (
                        <div
                          key={warehouse.id}
                          className="rounded-2xl border bg-card p-4"
                        >
                          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium text-foreground">
                                  {warehouse.name}
                                </p>
                                {warehouse.isDefault ? (
                                  <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                                    Default
                                  </span>
                                ) : null}
                                <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                                  {warehouse.code}
                                </span>
                              </div>

                              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                {warehouse.address?.location ? (
                                  <div>
                                    Address: {warehouse.address.location}
                                  </div>
                                ) : null}
                                {warehouse.division ||
                                warehouse.district ||
                                warehouse.area ? (
                                  <div>
                                    {[
                                      warehouse.division,
                                      warehouse.district,
                                      warehouse.area,
                                    ]
                                      .filter(Boolean)
                                      .join(", ")}
                                  </div>
                                ) : null}
                                {warehouse.latitude && warehouse.longitude ? (
                                  <div>
                                    GPS: {warehouse.latitude.toFixed(4)},{" "}
                                    {warehouse.longitude.toFixed(4)}
                                  </div>
                                ) : null}
                                {warehouse.mapLabel ? (
                                  <div>Map Label: {warehouse.mapLabel}</div>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="rounded-2xl"
                                onClick={() => router.push(`/admin/warehouse/${warehouse.id}`)}
                              >
                                Details
                              </Button>

                              {warehouse.latitude &&
                              warehouse.longitude &&
                              warehouse.isMapEnabled ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="rounded-2xl"
                                  onClick={() => {
                                    window.open(
                                      `https://www.google.com/maps?q=${warehouse.latitude},${warehouse.longitude}`,
                                      "_blank",
                                    );
                                  }}
                                >
                                  Map
                                </Button>
                              ) : null}

                              <Button
                                type="button"
                                className="rounded-2xl"
                                onClick={() => setEditingWarehouse(warehouse)}
                              >
                                Edit
                              </Button>

                              <Button
                                type="button"
                                variant="destructive"
                                className="rounded-2xl"
                                onClick={async () => {
                                  if (
                                    confirm(
                                      `Are you sure you want to delete ${warehouse.name}?`,
                                    )
                                  ) {
                                    await fetch(
                                      `/api/warehouses/${warehouse.id}`,
                                      {
                                        method: "DELETE",
                                      },
                                    );
                                    void loadWarehouses();
                                    void loadMapData();
                                    void fetchDashboard();
                                  }
                                }}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </article>
              </div>
            )}
          </div>
        </section>
      </div>

      {showAddWarehouseModal ? (
        <WarehouseFormModal
          onClose={() => setShowAddWarehouseModal(false)}
          refresh={() => {
            void loadWarehouses();
            void loadMapData();
            void fetchDashboard();
          }}
        />
      ) : null}

      {editingWarehouse ? (
        <WarehouseFormModal
          onClose={() => setEditingWarehouse(null)}
          refresh={() => {
            void loadWarehouses();
            void loadMapData();
            void fetchDashboard();
          }}
          editingWarehouse={editingWarehouse}
        />
      ) : null}
    </div>
  );
}
