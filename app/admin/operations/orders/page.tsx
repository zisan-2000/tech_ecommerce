//app/admin/operations/orders/page.tsx

"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Image from "next/image";
import {
  AssignDeliveryManModal,
  type DeliveryManAssignmentOption,
  type ShipmentAssignmentOption,
} from "@/components/admin/shipments/AssignDeliveryManModal";
import {
  AssignmentStatusBadge,
  ASSIGNMENT_STATUS_LABELS,
} from "@/components/delivery/AssignmentStatusBadge";
import { getVariantMediaMeta } from "@/lib/product-variants";

type OrderStatusType =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "FAILED"
  | "RETURNED"
  | "CANCELLED";

type PaymentStatusType = "PAID" | "UNPAID" | "REFUNDED";

type ShipmentStatusType =
  | "PENDING"
  | "ASSIGNED"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED"
  | "RETURNED"
  | "CANCELLED";

type DeliveryAssignmentStatusType =
  | "ASSIGNED"
  | "ACCEPTED"
  | "REJECTED"
  | "PICKUP_CONFIRMED"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED"
  | "RETURNED";

type PickupProofStatusType = "PENDING" | "CONFIRMED";

interface OrderItem {
  id: number;
  quantity: number;
  price: number;
  product?: {
    id: number;
    name: string;
    image?: string | null;
    gallery?: string[] | null;
  };
  variant?: {
    id: number;
    sku?: string | null;
    colorImage?: string | null;
    options?: Record<string, unknown> | null;
  } | null;
}

interface Order {
  id: number;
  name: string | null;
  email?: string | null;
  phone_number: string | null;
  alt_phone_number?: string | null;
  country: string;
  district: string;
  area: string;
  address_details: string;
  payment_method: string;
  order_date: string;
  total: number;
  shipping_cost: number;
  grand_total: number;
  currency: string;
  Vat_total?: number | null;
  discount_total?: number | null;
  status: OrderStatusType;
  paymentStatus: PaymentStatusType;
  transactionId?: string | null;
  image?: string | null; // payment screenshot URL (from DB)
  createdAt: string;
  orderItems?: OrderItem[];
  user?: {
    id: string;
    name?: string | null;
  };
}

interface Shipment {
  id: number;
  orderId: number;
  courier: string;
  courierId?: number | null;
  warehouseId?: number | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  externalId?: string | null;
  courierStatus?: string | null;
  lastSyncedAt?: string | null;
  status: ShipmentStatusType;
  shippedAt?: string | null;
  expectedDate?: string | null;
  deliveredAt?: string | null;
  createdAt?: string;
  deliveryConfirmationToken?: string | null;
  deliveryConfirmationUrl?: string | null;
  deliveryConfirmationPin?: string | null;
  deliveryProof?: {
    id: number;
    tickReceived: boolean;
    tickCorrectItems: boolean;
    tickGoodCondition: boolean;
    photoUrl?: string | null;
    note?: string | null;
    confirmedAt: string;
    userId?: string | null;
  } | null;
  deliveryAssignments?: DeliveryAssignment[];
}

interface DeliveryAssignmentLog {
  id: string;
  fromStatus?: DeliveryAssignmentStatusType | null;
  toStatus: DeliveryAssignmentStatusType;
  note?: string | null;
  createdAt: string;
  actor?: {
    id: string;
    name?: string | null;
  } | null;
}

interface DeliveryAssignmentPickupProof {
  id: string;
  status: PickupProofStatusType;
  imageUrl?: string | null;
  confirmedAt?: string | null;
}

interface DeliveryAssignment {
  id: string;
  status: DeliveryAssignmentStatusType;
  pickupProofStatus: PickupProofStatusType;
  note?: string | null;
  latestNote?: string | null;
  rejectionReason?: string | null;
  assignedAt: string;
  respondedAt?: string | null;
  acceptedAt?: string | null;
  rejectedAt?: string | null;
  pickupConfirmedAt?: string | null;
  inTransitAt?: string | null;
  outForDeliveryAt?: string | null;
  deliveredAt?: string | null;
  failedAt?: string | null;
  returnedAt?: string | null;
  deliveryMan: {
    id: string;
    userId: string;
    fullName: string;
    phone: string;
    employeeCode?: string | null;
  };
  pickupProof?: DeliveryAssignmentPickupProof | null;
  logs: DeliveryAssignmentLog[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface CourierOption {
  id: number;
  name: string;
  type: "PATHAO" | "REDX" | "STEADFAST" | "CUSTOM";
  isActive: boolean;
}

interface WarehouseOption {
  id: number;
  name: string;
  code: string;
  isDefault: boolean;
}

interface OrderListCacheEntry {
  orders: Order[];
  pagination: Pagination | null;
}

interface OrderListQueryState {
  page: number;
  statusFilter: string;
  search: string;
}

const orderListCache = new Map<string, OrderListCacheEntry>();
let lastOrderListQueryState: OrderListQueryState = {
  page: 1,
  statusFilter: "ALL",
  search: "",
};

const getOrderListCacheKey = (query: Omit<OrderListQueryState, "search">) =>
  JSON.stringify({
    page: query.page,
    statusFilter: query.statusFilter,
    limit: 9,
  });

const OrderManagement = () => {
  const initialCacheKey = getOrderListCacheKey({
    page: lastOrderListQueryState.page,
    statusFilter: lastOrderListQueryState.statusFilter,
  });
  const initialCachedOrders = orderListCache.get(initialCacheKey);

  const [orders, setOrders] = useState<Order[]>(
    () => initialCachedOrders?.orders ?? [],
  );
  const [pagination, setPagination] = useState<Pagination | null>(
    () => initialCachedOrders?.pagination ?? null,
  );
  const [page, setPage] = useState(lastOrderListQueryState.page);
  const [statusFilter, setStatusFilter] = useState<string>(
    lastOrderListQueryState.statusFilter,
  );
  const [search, setSearch] = useState(lastOrderListQueryState.search);
  const [loading, setLoading] = useState(() => !initialCachedOrders);
  const [error, setError] = useState<string | null>(null);

  // details modal states
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [orderDetail, setOrderDetail] = useState<Order | null>(null);
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // success modal
  const [successOpen, setSuccessOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>("");

  // error modal
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // editable fields (order)
  const [editOrderStatus, setEditOrderStatus] =
    useState<OrderStatusType>("PENDING");
  const [editPaymentStatus, setEditPaymentStatus] =
    useState<PaymentStatusType>("UNPAID");
  const [editTransactionId, setEditTransactionId] = useState<string>("");

  // editable fields (shipment)
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [deliveryMen, setDeliveryMen] = useState<DeliveryManAssignmentOption[]>(
    [],
  );
  const [editCourierId, setEditCourierId] = useState<string>("");
  const [editWarehouseId, setEditWarehouseId] = useState<string>("");
  const [editCourier, setEditCourier] = useState("");
  const [editTrackingNumber, setEditTrackingNumber] = useState("");
  const [editShipmentStatus, setEditShipmentStatus] =
    useState<ShipmentStatusType>("PENDING");
  const [editExpectedDate, setEditExpectedDate] = useState<string>("");
  const [editDeliveredDate, setEditDeliveredDate] = useState<string>("");
  const [assignModalOpen, setAssignModalOpen] = useState(false);

  // ------------------- ORDER LIST -------------------

  // Memoize fetch function with caching
  const fetchOrders = useCallback(async () => {
    const query = {
      page,
      statusFilter,
    };
    const cacheKey = getOrderListCacheKey(query);
    lastOrderListQueryState = {
      page,
      statusFilter,
      search: lastOrderListQueryState.search,
    };

    try {
      setLoading(true);
      setError(null);

      // Check cache first
      if (orderListCache.has(cacheKey)) {
        const cachedData = orderListCache.get(cacheKey);
        if (cachedData) {
          setOrders(cachedData.orders);
          setPagination(cachedData.pagination);
          setLoading(false);
          return;
        }
      }

      let url = `/api/orders?page=${page}&limit=9`;
      if (statusFilter !== "ALL") {
        url += `&status=${statusFilter}`;
      }

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Something went wrong");
      }

      const data = await res.json();

      // Update cache
      orderListCache.set(cacheKey, {
        orders: data.orders || [],
        pagination: data.pagination || null,
      });

      setOrders(data.orders || []);
      setPagination(data.pagination || null);
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Failed to load orders";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    lastOrderListQueryState = {
      ...lastOrderListQueryState,
      search,
    };
  }, [search]);

  const filteredOrders = useMemo(() => {
    if (!search) return orders;
    const term = search.toLowerCase();
    return orders.filter((o) => {
      return (
        o.name?.toLowerCase().includes(term) ||
        o.phone_number?.toLowerCase().includes(term) ||
        String(o.id).toLowerCase().includes(term)
      );
    });
  }, [orders, search]);

  const totalOrders = pagination?.total ?? orders.length;

  const pageTotalAmount = useMemo(
    () =>
      filteredOrders.reduce(
        (sum, o) => sum + Number(o.grand_total ?? o.total ?? 0),
        0,
      ),
    [filteredOrders],
  );

  // ------------------- HELPERS -------------------

  // Memoize badge functions to prevent unnecessary re-renders
  const statusBadgeClass = useCallback((status: string) => {
    switch (status) {
      case "PENDING":
        return "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:bg-amber-400/10 dark:text-amber-400 dark:border-amber-400/20";
      case "CONFIRMED":
        return "bg-cyan-500/10 text-cyan-600 border-cyan-500/20 dark:bg-cyan-400/10 dark:text-cyan-400 dark:border-cyan-400/20";
      case "PROCESSING":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:bg-blue-400/10 dark:text-blue-400 dark:border-blue-400/20";
      case "SHIPPED":
        return "bg-indigo-500/10 text-indigo-600 border-indigo-500/20 dark:bg-indigo-400/10 dark:text-indigo-400 dark:border-indigo-400/20";
      case "DELIVERED":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-400/10 dark:text-emerald-400 dark:border-emerald-400/20";
      case "FAILED":
        return "bg-rose-500/10 text-rose-600 border-rose-500/20 dark:bg-rose-400/10 dark:text-rose-400 dark:border-rose-400/20";
      case "RETURNED":
        return "bg-violet-500/10 text-violet-600 border-violet-500/20 dark:bg-violet-400/10 dark:text-violet-400 dark:border-violet-400/20";
      case "CANCELLED":
        return "bg-destructive/10 text-destructive border-destructive/20";
      default:
        return "bg-muted/10 text-muted-foreground border-border";
    }
  }, []);

  const paymentBadgeClass = useCallback((status: string) => {
    if (status === "PAID") {
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-400/10 dark:text-emerald-400 dark:border-emerald-400/20";
    }
    if (status === "REFUNDED") {
      return "bg-violet-500/10 text-violet-600 border-violet-500/20 dark:bg-violet-400/10 dark:text-violet-400 dark:border-violet-400/20";
    }
    return "bg-destructive/10 text-destructive border-destructive/20";
  }, []);

  const shipmentBadgeClass = useCallback((status: ShipmentStatusType) => {
    switch (status) {
      case "PENDING":
        return "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:bg-amber-400/10 dark:text-amber-400 dark:border-amber-400/20";
      case "ASSIGNED":
        return "bg-sky-500/10 text-sky-600 border-sky-500/20 dark:bg-sky-400/10 dark:text-sky-400 dark:border-sky-400/20";
      case "IN_TRANSIT":
      case "OUT_FOR_DELIVERY":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:bg-blue-400/10 dark:text-blue-400 dark:border-blue-400/20";
      case "DELIVERED":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-400/10 dark:text-emerald-400 dark:border-emerald-400/20";
      case "FAILED":
      case "RETURNED":
      case "CANCELLED":
        return "bg-destructive/10 text-destructive border-destructive/20";
      default:
        return "bg-muted/10 text-muted-foreground border-border";
    }
  }, []);

  const formatDate = useCallback((dateStr?: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, []);

  const formatDateTime = useCallback((dateStr?: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, []);

  const formatMoney = useCallback(
    (amount?: number | null, currency = "BDT") => {
      const value = Number(amount ?? 0);
      return `${currency} ${value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    },
    [],
  );

  const formatVariantLabel = useCallback((item?: OrderItem | null) => {
    if (!item?.variant) return "";

    const options =
      item.variant.options && typeof item.variant.options === "object"
        ? Object.entries(item.variant.options)
            .filter(
              ([key, value]) =>
                key &&
                key !== "__meta" &&
                value !== null &&
                value !== undefined &&
                String(value).trim(),
            )
            .map(([key, value]) => `${key}: ${String(value)}`)
        : [];

    if (options.length > 0) {
      return options.join(", ");
    }

    return item.variant.sku || "";
  }, []);

  const getOrderItemImage = useCallback((item?: OrderItem | null) => {
    if (!item) return "";

    const variantImage =
      typeof item.variant?.colorImage === "string" &&
      item.variant.colorImage.trim()
        ? item.variant.colorImage.trim()
        : "";
    if (variantImage) return variantImage;

    const variantMedia = getVariantMediaMeta(item.variant?.options);
    if (variantMedia?.image) return variantMedia.image;
    if (variantMedia?.gallery?.[0]) return variantMedia.gallery[0];

    const productImage =
      typeof item.product?.image === "string" && item.product.image.trim()
        ? item.product.image.trim()
        : "";
    if (productImage) return productImage;

    return item.product?.gallery?.find(
      (image) => typeof image === "string" && image.trim(),
    ) ?? "";
  }, []);

  const applyShipmentState = useCallback((nextShipment: Shipment | null) => {
    if (nextShipment) {
      setShipment(nextShipment);
      setEditCourierId(
        nextShipment.courierId ? String(nextShipment.courierId) : "",
      );
      setEditWarehouseId(
        nextShipment.warehouseId ? String(nextShipment.warehouseId) : "",
      );
      setEditCourier(nextShipment.courier || "");
      setEditTrackingNumber(nextShipment.trackingNumber || "");
      setEditShipmentStatus(nextShipment.status);
      setEditExpectedDate(
        nextShipment.expectedDate
          ? new Date(nextShipment.expectedDate).toISOString().substring(0, 10)
          : "",
      );
      setEditDeliveredDate(
        nextShipment.deliveredAt
          ? new Date(nextShipment.deliveredAt).toISOString().substring(0, 10)
          : "",
      );
      return;
    }

    setShipment(null);
    setEditCourierId("");
    setEditWarehouseId("");
    setEditCourier("");
    setEditTrackingNumber("");
    setEditShipmentStatus("PENDING");
    setEditExpectedDate("");
    setEditDeliveredDate("");
  }, []);

  const loadShipmentDetails = useCallback(
    async (orderId: number) => {
      const shipRes = await fetch(
        `/api/shipments?orderId=${orderId}&limit=1&page=1`,
        {
          cache: "no-store",
        },
      );

      if (shipRes.ok) {
        const shipmentData = await shipRes.json().catch(() => ({}));
        const nextShipment = Array.isArray(shipmentData.shipments)
          ? (shipmentData.shipments[0] as Shipment | undefined)
          : undefined;
        applyShipmentState(nextShipment ?? null);
        return;
      }

      if (shipRes.status === 404) {
        applyShipmentState(null);
        return;
      }

      throw new Error("Shipment load failed");
    },
    [applyShipmentState],
  );

  // ------------------- DETAILS MODAL LOGIC -------------------

  // Memoize handler functions
  const openDetails = useCallback((id: number) => {
    setSelectedOrderId(id);
    setDetailOpen(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailOpen(false);
    setSelectedOrderId(null);
    setOrderDetail(null);
    applyShipmentState(null);
    setCouriers([]);
    setWarehouses([]);
    setDeliveryMen([]);
    setDetailError(null);
    setAssignModalOpen(false);
  }, [applyShipmentState]);

  useEffect(() => {
    if (!detailOpen || !selectedOrderId) return;

    const loadDetails = async () => {
      try {
        setDetailLoading(true);
        setDetailError(null);

        // 1) Order details
        const orderRes = await fetch(`/api/orders/${selectedOrderId}`, {
          cache: "no-store",
        });
        if (!orderRes.ok) {
          const data = await orderRes.json().catch(() => ({}));
          throw new Error(data?.error || "Order load failed");
        }
        const orderData: Order = await orderRes.json();
        setOrderDetail(orderData);

        // init editable fields
        setEditOrderStatus(orderData.status);
        setEditPaymentStatus(orderData.paymentStatus);
        setEditTransactionId(orderData.transactionId || "");

        // 2) Supporting options + Shipment (if any)
        const [courierRes, warehouseRes, deliveryManRes] = await Promise.all([
          fetch("/api/couriers", { cache: "no-store" }),
          fetch("/api/warehouses", { cache: "no-store" }),
          fetch("/api/delivery-men?status=ACTIVE&limit=200&page=1", {
            cache: "no-store",
          }),
        ]);

        if (courierRes.ok) {
          const cData = await courierRes.json().catch(() => []);
          setCouriers(Array.isArray(cData) ? cData : []);
        } else {
          setCouriers([]);
        }

        if (warehouseRes.ok) {
          const wData = await warehouseRes.json().catch(() => []);
          setWarehouses(Array.isArray(wData) ? wData : []);
        } else {
          setWarehouses([]);
        }

        if (deliveryManRes.ok) {
          const deliveryManData = await deliveryManRes.json().catch(() => ({}));
          const nextDeliveryMen = Array.isArray(
            deliveryManData?.data?.deliveryMen,
          )
            ? (
                deliveryManData.data.deliveryMen as Array<{
                  id: string;
                  fullName: string;
                  phone: string;
                  employeeCode?: string | null;
                  warehouse?: {
                    id: number;
                    name: string;
                    code: string;
                  } | null;
                }>
              ).map((deliveryMan) => ({
                id: deliveryMan.id,
                fullName: deliveryMan.fullName,
                phone: deliveryMan.phone,
                employeeCode: deliveryMan.employeeCode ?? null,
                warehouse: deliveryMan.warehouse ?? null,
              }))
            : [];
          setDeliveryMen(nextDeliveryMen);
        } else {
          setDeliveryMen([]);
        }

        await loadShipmentDetails(selectedOrderId);
      } catch (err: unknown) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Failed to load details";
        setDetailError(message);
      } finally {
        setDetailLoading(false);
      }
    };

    loadDetails();
  }, [detailOpen, loadShipmentDetails, selectedOrderId]);

  // ---- UNIFIED SAVE: ORDER + SHIPMENT ----
  const handleSaveAll = useCallback(async () => {
    if (!orderDetail) return;

    try {
      setSaving(true);

      // 1) Update Order (image DB theke already ache, ekhane change korchi na)
      const orderRes = await fetch(`/api/orders/${orderDetail.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: editOrderStatus,
          paymentStatus: editPaymentStatus,
          transactionId: editTransactionId || null,
        }),
      });

      const orderData = await orderRes.json().catch(() => ({}));
      if (!orderRes.ok) {
        throw new Error(orderData?.error || "Order update failed");
      }

      // local order state sync
      setOrderDetail((prev) =>
        prev
          ? {
              ...prev,
              status: editOrderStatus,
              paymentStatus: editPaymentStatus,
              transactionId: editTransactionId || null,
            }
          : prev,
      );
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderDetail.id
            ? {
                ...o,
                status: editOrderStatus,
                paymentStatus: editPaymentStatus,
              }
            : o,
        ),
      );

      // Clear cache to force refresh on next load
      orderListCache.clear();

      // 2) Create / Update Shipment
      const hasShipmentInput =
        editCourierId ||
        editWarehouseId ||
        editCourier ||
        editTrackingNumber ||
        editExpectedDate ||
        editDeliveredDate ||
        editShipmentStatus !== "PENDING";

      if (shipment) {
        // PATCH existing shipment
        const res = await fetch(`/api/shipments/${shipment.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            courierId: editCourierId ? Number(editCourierId) : undefined,
            warehouseId: editWarehouseId ? Number(editWarehouseId) : null,
            courier: editCourier || undefined,
            trackingNumber: editTrackingNumber || null,
            status: editShipmentStatus,
            expectedDate: editExpectedDate || null,
            deliveredAt: editDeliveredDate || null,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || "Shipment update failed");
        }

        applyShipmentState(data as Shipment);
      } else if (hasShipmentInput) {
        if (!editCourierId && !editCourier) {
          throw new Error("Please select a courier before creating shipment");
        }
        // POST new shipment (only if some shipment data is provided)
        const res = await fetch("/api/shipments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            orderId: orderDetail.id,
            courierId: editCourierId ? Number(editCourierId) : undefined,
            warehouseId: editWarehouseId ? Number(editWarehouseId) : undefined,
            courier: editCourier || undefined,
            trackingNumber: editTrackingNumber || undefined,
            status: editShipmentStatus,
            expectedDate: editExpectedDate || undefined,
            deliveredAt: editDeliveredDate || undefined,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || "Shipment create failed");
        }

        applyShipmentState(data as Shipment);
      }

      const shipmentToOrderStatus =
        editShipmentStatus === "DELIVERED"
          ? "DELIVERED"
          : editShipmentStatus === "RETURNED"
            ? "RETURNED"
            : editShipmentStatus === "FAILED"
              ? "FAILED"
              : editShipmentStatus === "CANCELLED"
                ? "CANCELLED"
                : null;

      if (shipmentToOrderStatus && shipmentToOrderStatus !== editOrderStatus) {
        try {
          const autoRes = await fetch(`/api/orders/${orderDetail.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              status: shipmentToOrderStatus,
            }),
          });

          const autoData = await autoRes.json().catch(() => ({}));

          if (autoRes.ok) {
            setOrderDetail((prev) =>
              prev ? { ...prev, status: shipmentToOrderStatus } : prev,
            );
            setOrders((prev) =>
              prev.map((o) =>
                o.id === orderDetail.id
                  ? { ...o, status: shipmentToOrderStatus }
                  : o,
              ),
            );
          } else {
            console.warn("Order auto status sync failed:", autoData);
          }
        } catch (e) {
          console.warn("Order auto-update error:", e);
        }
      }

      // 4) Show success modal
      setSuccessMessage(
        "Order and shipment information updated successfully ✅",
      );
      setSuccessOpen(true);
    } catch (err: any) {
      setErrorMessage(err?.message || "Problem updating information");
      setErrorOpen(true);
    } finally {
      setSaving(false);
    }
  }, [
    orderDetail,
    editOrderStatus,
    editPaymentStatus,
    editTransactionId,
    shipment,
    editCourierId,
    editWarehouseId,
    editCourier,
    editTrackingNumber,
    editShipmentStatus,
    editExpectedDate,
    editDeliveredDate,
    applyShipmentState,
  ]);

  const currentAssignment = shipment?.deliveryAssignments?.[0] ?? null;
  const selectedShipmentForAssignment = useMemo<ShipmentAssignmentOption[]>(
    () =>
      shipment
        ? [
            {
              id: shipment.id,
              orderId: shipment.orderId,
              courier: shipment.courier,
              warehouseId: shipment.warehouseId ?? null,
            },
          ]
        : [],
    [shipment],
  );

  const handleAssigned = useCallback(
    async (message: string) => {
      if (!selectedOrderId) {
        return;
      }

      try {
        await loadShipmentDetails(selectedOrderId);
        setSuccessMessage(message);
        setSuccessOpen(true);
      } catch (assignError) {
        setErrorMessage(
          assignError instanceof Error
            ? assignError.message
            : "Assigned successfully, but refresh failed",
        );
        setErrorOpen(true);
      }
    },
    [loadShipmentDetails, selectedOrderId],
  );

  // ------------------- RENDER -------------------

  return (
    <div className="min-h-screen w-full bg-background px-3 py-4 sm:px-4">
      <div className="flex-col gap-8">
        {/* Heading */}
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
            Order Management
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            View all library orders, update status and track shipments
          </p>
        </div>

        {/* Top stats + search row */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,0.85fr)_minmax(0,1.3fr)]">
          {/* Total Orders */}
          <div className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-4 shadow-sm sm:px-6">
            <div>
              <p className="text-xs text-muted-foreground">Total Orders</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {totalOrders}
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <svg
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <circle
                  cx="9"
                  cy="7"
                  r="3"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M22 21v-2a4 4 0 0 0-3-3.87"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M16 3.13a3 3 0 0 1 0 5.76"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>

          {/* Total Amount (This Page) */}
          <div className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-4 shadow-sm sm:px-6">
            <div>
              <p className="text-xs text-muted-foreground">Page Total Amount</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {formatMoney(pageTotalAmount, "BDT")}
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <svg
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <rect
                  x="3"
                  y="5"
                  width="18"
                  height="14"
                  rx="2"
                  strokeWidth="1.8"
                />
                <circle cx="12" cy="12" r="3" strokeWidth="1.8" />
              </svg>
            </div>
          </div>

          {/* search + status filter */}
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-4 shadow-sm sm:px-6 lg:flex-row lg:items-center">
            <div className="flex flex-1 items-center gap-2 rounded-full border border-border bg-muted px-4 py-2">
              <svg
                className="h-4 w-4 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <circle cx="11" cy="11" r="6" strokeWidth="1.6" />
                <path d="M16 16l4 4" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by order ID, name or mobile..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-full border border-border bg-primary px-4 py-2 text-sm text-primary-foreground shadow-sm focus:outline-none lg:w-auto"
            >
              <option
                className="bg-background text-foreground hover:bg-primary/20"
                value="ALL"
              >
                All Status
              </option>
              <option className="bg-background text-foreground" value="PENDING">
                Pending
              </option>
              <option className="bg-background text-foreground" value="CONFIRMED">
                Confirmed
              </option>
              <option className="bg-background text-foreground" value="PROCESSING">
                Processing
              </option>
              <option className="bg-background text-foreground" value="SHIPPED">
                Shipped
              </option>
              <option className="bg-background text-foreground" value="DELIVERED">
                Delivered
              </option>
              <option className="bg-background text-foreground" value="FAILED">
                Failed
              </option>
              <option className="bg-background text-foreground" value="RETURNED">
                Returned
              </option>
              <option className="bg-background text-foreground" value="CANCELLED">
                Cancelled
              </option>
            </select>
          </div>
        </div>

        {/* Loading / Error */}
        {loading && (
          <div className="mt-6">
            {/* Stats Cards Skeleton */}
            <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,0.85fr)_minmax(0,1.3fr)]">
              <div className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-4 shadow-sm sm:px-6">
                <div>
                  <div className="h-3 bg-muted rounded w-16 mb-2 animate-pulse"></div>
                  <div className="h-8 bg-muted rounded w-12 animate-pulse"></div>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted animate-pulse"></div>
              </div>
              <div className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-4 shadow-sm sm:px-6">
                <div>
                  <div className="h-3 bg-muted rounded w-20 mb-2 animate-pulse"></div>
                  <div className="h-8 bg-muted rounded w-16 animate-pulse"></div>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted animate-pulse"></div>
              </div>
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-4 shadow-sm sm:px-6 lg:flex-row lg:items-center">
                <div className="flex flex-1 items-center gap-2 rounded-full border border-border bg-muted px-4 py-2">
                  <div className="h-4 w-4 bg-muted rounded animate-pulse"></div>
                  <div className="h-4 bg-muted rounded flex-1 animate-pulse"></div>
                </div>
                <div className="h-8 w-full rounded bg-muted animate-pulse lg:w-24"></div>
              </div>
            </div>

            {/* Order Cards Skeleton */}
            <div className="grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-2xl bg-card shadow-sm border-border"
                >
                  {/* Header Gradient */}
                  <div className="h-24 bg-gradient-to-r from-muted to-muted/50 animate-pulse"></div>

                  <div className="-mt-10 px-5 pb-5">
                    {/* Avatar Circle */}
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted shadow-md animate-pulse"></div>

                    <div className="mt-3 space-y-2">
                      <div className="h-5 bg-muted rounded w-3/4 animate-pulse"></div>
                      <div className="h-3 bg-muted rounded w-1/2 animate-pulse"></div>
                      <div className="h-3 bg-muted rounded w-2/3 animate-pulse"></div>
                      <div className="h-3 bg-muted rounded w-1/2 animate-pulse"></div>
                    </div>

                    {/* Totals */}
                    <div className="mt-3 rounded-xl bg-muted/30 px-3 py-2">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="h-3 bg-muted rounded w-20 animate-pulse"></div>
                          <div className="h-3 bg-muted rounded w-8 animate-pulse"></div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="h-3 bg-muted rounded w-16 animate-pulse"></div>
                          <div className="h-3 bg-muted rounded w-12 animate-pulse"></div>
                        </div>
                      </div>
                    </div>

                    {/* Status Badges */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <div className="h-6 bg-muted rounded-full w-20 animate-pulse"></div>
                      <div className="h-6 bg-muted rounded-full w-16 animate-pulse"></div>
                    </div>

                    {/* Action Button */}
                    <div className="mt-4">
                      <div className="h-8 bg-muted rounded-full w-full animate-pulse"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {error && (
          <div className="mt-6 rounded-xl bg-destructive/10 px-4 py-3 text-center text-sm text-destructive border border-destructive/20">
            {error}
          </div>
        )}

        {/* Order cards */}
        {!loading && !error && (
          <>
            {filteredOrders.length === 0 ? (
              <div className="mt-8 text-center text-sm text-muted-foreground">
                No orders found.
              </div>
            ) : (
              <div className="mt-6 grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
                {filteredOrders.map((order) => {
                  const firstItem = order.orderItems?.[0];
                  const firstItemImage = getOrderItemImage(firstItem);
                  const firstItemVariantLabel = formatVariantLabel(firstItem);
                  const firstItemTitle = firstItem?.product?.name
                    ? firstItemVariantLabel
                      ? `${firstItem.product.name} - ${firstItemVariantLabel}`
                      : firstItem.product.name
                    : "No product details";

                  return (
                  <div
                    key={order.id}
                    className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                  >
                    <div className="border-b border-border bg-muted/20 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            Order #{order.id} • {order.name || "Guest Customer"}
                          </p>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {order.address_details}, {order.area},{" "}
                            {order.district}, {order.country}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusBadgeClass(
                            order.status,
                          )}`}
                        >
                          {order.status.toLowerCase()}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 px-4 py-3 text-[11px] sm:grid-cols-3">
                      <div>
                        <p className="text-muted-foreground">Created on</p>
                        <p className="mt-1 font-semibold text-foreground">
                          {formatDate(order.createdAt)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Payment</p>
                        <p className="mt-1 font-semibold text-foreground">
                          {order.payment_method}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Items</p>
                        <p className="mt-1 font-semibold text-foreground">
                          {order.orderItems?.reduce(
                            (sum, item) => sum + Number(item.quantity || 0),
                            0,
                          ) || 0}
                        </p>
                      </div>
                    </div>

                    <div className="px-4 pb-3">
                      <div className="flex items-center gap-3 rounded-xl border border-border bg-background/60 p-2">
                        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                          {firstItemImage ? (
                            <Image
                              src={firstItemImage}
                              alt={firstItemTitle}
                              fill
                              className="object-cover"
                              sizes="56px"
                            />
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              No Image
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-foreground">
                            {firstItemTitle}
                          </p>
                          {(order.orderItems?.length ?? 0) > 1 && (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              +{(order.orderItems?.length ?? 1) - 1} more item
                              {(order.orderItems?.length ?? 0) > 2 ? "s" : ""}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${paymentBadgeClass(
                          order.paymentStatus,
                        )}`}
                      >
                        {order.paymentStatus.toLowerCase()}
                      </span>

                      <div className="text-left sm:text-right">
                        <p className="text-xs text-muted-foreground">
                          Grand Total
                        </p>
                        <p className="text-xl font-semibold text-foreground">
                          {formatMoney(
                            Number(order.grand_total ?? 0),
                            order.currency || "BDT",
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="px-4 pb-4">
                      <button
                        type="button"
                        className="w-full rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition hover:bg-primary/90"
                        onClick={() => openDetails(order.id)}
                      >
                        View / Assign Delivery
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}

            {/* pagination */}
            {pagination && pagination.pages > 1 && (
              <div className="mt-8 flex flex-col items-center justify-center gap-3 text-sm sm:flex-row sm:gap-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-full bg-card px-4 py-2 text-foreground shadow-sm border-border disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-center text-muted-foreground">
                  Page {page} / {pagination.pages}
                </span>
                <button
                  onClick={() =>
                    setPage((p) =>
                      pagination ? Math.min(pagination.pages, p + 1) : p + 1,
                    )
                  }
                  disabled={page === pagination.pages}
                  className="rounded-full bg-card px-4 py-2 text-foreground shadow-sm border-border disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ------------- DETAILS MODAL ------------- */}
      {detailOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-2 backdrop-blur-sm sm:p-4">
          <div className="relative max-h-[96vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-xl sm:max-h-[90vh] sm:rounded-3xl">
            {/* Header */}
            <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground">
                  Order Details
                </h2>
                {orderDetail && (
                  <p className="text-xs text-muted-foreground">
                    Order ID: {orderDetail.id} •{" "}
                    {formatDate(
                      orderDetail.order_date || orderDetail.createdAt,
                    )}
                  </p>
                )}
              </div>
              <button
                onClick={handleCloseDetail}
                className="w-full rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground hover:bg-muted/80 sm:w-auto"
              >
                Close ✕
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[78vh] overflow-y-auto px-4 py-4 sm:max-h-[70vh] sm:px-6">
              {detailLoading && (
                <div className="space-y-5 text-sm animate-pulse">
                  {/* Customer + Address Skeleton */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl bg-muted/30 p-4">
                      <div className="mb-2 h-3 w-24 rounded bg-gray-200"></div>
                      <div className="h-4 w-32 rounded bg-gray-200 mb-2"></div>
                      <div className="h-3 w-40 rounded bg-gray-200 mb-1"></div>
                      <div className="h-3 w-36 rounded bg-gray-200 mb-1"></div>
                      <div className="h-3 w-28 rounded bg-gray-200 mb-1"></div>
                      <div className="h-3 w-32 rounded bg-gray-200 mb-1"></div>
                      <div className="h-3 w-20 rounded bg-gray-200 mb-1"></div>
                      <div className="h-3 w-24 rounded bg-gray-200"></div>
                    </div>
                    <div className="rounded-2xl bg-muted/30 p-4">
                      <div className="mb-2 h-3 w-28 rounded bg-gray-200"></div>
                      <div className="h-3 w-full rounded bg-gray-200 mb-1"></div>
                      <div className="h-3 w-20 rounded bg-gray-200 mb-1"></div>
                      <div className="h-3 w-24 rounded bg-gray-200 mb-1"></div>
                      <div className="h-3 w-16 rounded bg-gray-200"></div>
                    </div>
                  </div>

                  {/* Payment Screenshot Skeleton */}
                  <div className="rounded-2xl bg-muted/30 p-4">
                    <div className="mb-3 h-3 w-32 rounded bg-gray-200"></div>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <div className="w-full max-w-xs overflow-hidden rounded-xl border border-border bg-card">
                        <div className="h-48 w-full bg-gray-200"></div>
                      </div>
                      <div className="space-y-3">
                        <div className="h-3 w-48 rounded bg-gray-200"></div>
                        <div className="h-8 w-32 rounded-full bg-gray-200"></div>
                      </div>
                    </div>
                  </div>

                  {/* Order Items Skeleton */}
                  <div className="rounded-2xl bg-muted/30 p-4">
                    <div className="mb-3 h-3 w-24 rounded bg-gray-200"></div>
                    <div className="space-y-2">
                      {[...Array(3)].map((_, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between rounded-xl bg-card px-3 py-2"
                        >
                          <div>
                            <div className="h-3 w-32 rounded bg-gray-200 mb-1"></div>
                            <div className="h-3 w-20 rounded bg-gray-200"></div>
                          </div>
                          <div className="h-3 w-16 rounded bg-gray-200"></div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 border-t border-border pt-2">
                      <div className="flex justify-between mb-1">
                        <div className="h-3 w-16 rounded bg-gray-200"></div>
                        <div className="h-3 w-12 rounded bg-gray-200"></div>
                      </div>
                      <div className="flex justify-between mb-1">
                        <div className="h-3 w-14 rounded bg-gray-200"></div>
                        <div className="h-3 w-10 rounded bg-gray-200"></div>
                      </div>
                      <div className="flex justify-between mb-1">
                        <div className="h-3 w-8 rounded bg-gray-200"></div>
                        <div className="h-3 w-10 rounded bg-gray-200"></div>
                      </div>
                      <div className="flex justify-between mb-1">
                        <div className="h-3 w-12 rounded bg-gray-200"></div>
                        <div className="h-3 w-10 rounded bg-gray-200"></div>
                      </div>
                      <div className="flex justify-between">
                        <div className="h-4 w-16 rounded bg-gray-200"></div>
                        <div className="h-4 w-16 rounded bg-gray-200"></div>
                      </div>
                    </div>
                  </div>

                  {/* Order Status Skeleton */}
                  <div className="rounded-2xl bg-muted/30 p-4">
                    <div className="mb-3 h-3 w-24 rounded bg-gray-200"></div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <div className="h-3 w-20 rounded bg-gray-200"></div>
                        <div className="h-8 w-full rounded bg-gray-200"></div>
                      </div>
                      <div className="space-y-1">
                        <div className="h-3 w-24 rounded bg-gray-200"></div>
                        <div className="h-8 w-full rounded bg-gray-200"></div>
                      </div>
                      <div className="space-y-1">
                        <div className="h-3 w-28 rounded bg-gray-200"></div>
                        <div className="h-8 w-full rounded bg-gray-200"></div>
                      </div>
                    </div>
                    <div className="mt-1 h-3 w-48 rounded bg-gray-200"></div>
                  </div>

                  {/* Shipment Status Skeleton */}
                  <div className="rounded-2xl bg-muted/30 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="h-3 w-28 rounded bg-gray-200"></div>
                      <div className="h-5 w-16 rounded-full bg-gray-200"></div>
                    </div>
                    <div className="mb-3 h-3 w-64 rounded bg-gray-200"></div>
                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="space-y-1">
                        <div className="h-3 w-12 rounded bg-gray-200"></div>
                        <div className="h-8 w-full rounded bg-gray-200"></div>
                      </div>
                      <div className="space-y-1">
                        <div className="h-3 w-16 rounded bg-gray-200"></div>
                        <div className="h-8 w-full rounded bg-gray-200"></div>
                      </div>
                      <div className="space-y-1">
                        <div className="h-3 w-28 rounded bg-gray-200"></div>
                        <div className="h-8 w-full rounded bg-gray-200"></div>
                      </div>
                      <div className="space-y-1">
                        <div className="h-3 w-24 rounded bg-gray-200"></div>
                        <div className="h-8 w-full rounded bg-gray-200"></div>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <div className="space-y-1">
                        <div className="h-3 w-20 rounded bg-gray-200"></div>
                        <div className="h-8 w-full rounded bg-gray-200"></div>
                      </div>
                      <div className="space-y-1">
                        <div className="h-3 w-24 rounded bg-gray-200"></div>
                        <div className="h-8 w-full rounded bg-gray-200"></div>
                      </div>
                      <div className="space-y-1">
                        <div className="h-3 w-16 rounded bg-gray-200"></div>
                        <div className="h-8 w-full rounded bg-gray-200"></div>
                      </div>
                    </div>
                    <div className="mt-3 h-3 w-56 rounded bg-gray-200"></div>
                  </div>

                  {/* Save Button Skeleton */}
                  <div className="pt-2 pb-4">
                    <div className="h-8 w-full rounded-full bg-gray-200"></div>
                  </div>
                </div>
              )}

              {detailError && (
                <div className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive border border-destructive/20">
                  {detailError}
                </div>
              )}

              {!detailLoading && orderDetail && (
                <div className="space-y-5 text-sm">
                  {/* 1. Customer + Address */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl bg-muted/30 p-4">
                      <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
                        Customer Information
                      </h3>
                      <p className="text-sm font-semibold text-foreground">
                        {orderDetail.name || "No Name"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Mobile: {orderDetail.phone_number || "-"}
                      </p>
                      {orderDetail.alt_phone_number && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Alt Mobile: {orderDetail.alt_phone_number}
                        </p>
                      )}
                      {orderDetail.email && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Email: {orderDetail.email}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-muted-foreground">
                        Payment Method:{" "}
                        <span className="font-medium">
                          {orderDetail.payment_method}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Currency:{" "}
                        <span className="font-medium">
                          {orderDetail.currency || "BDT"}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Order Date:{" "}
                        <span className="font-medium">
                          {formatDate(
                            orderDetail.order_date || orderDetail.createdAt,
                          )}
                        </span>
                      </p>
                    </div>

                    <div className="rounded-2xl bg-muted/30 p-4">
                      <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
                        Delivery Address
                      </h3>
                      <p className="text-xs text-foreground">
                        {orderDetail.address_details}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Area: {orderDetail.area}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        District: {orderDetail.district}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Country: {orderDetail.country}
                      </p>
                    </div>
                  </div>

                  {/* 1.5 Payment Screenshot (only show from DB URL) */}
                  {orderDetail.image && (
                    <div className="rounded-2xl bg-muted/30 p-4">
                      <h3 className="mb-3 text-xs font-semibold text-muted-foreground">
                        Payment Screenshot
                      </h3>

                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                        {/* Preview Card */}
                        <div className="w-full max-w-xs overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                          <img
                            src={orderDetail.image}
                            alt="Payment screenshot"
                            className="h-full w-full max-h-72 object-contain bg-muted"
                          />
                        </div>

                        {/* Right side: text + link */}
                        <div className="space-y-3 text-xs text-muted-foreground">
                          <p>
                            Customer uploaded this screenshot after payment.
                          </p>

                          <a
                            href={orderDetail.image}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center rounded-full bg-primary px-4 py-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                          >
                            View Screenshot
                            <svg
                              className="ml-1 h-3 w-3"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                            >
                              <path
                                d="M14 3h7v7"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M10 14L21 3"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                              />
                              <path
                                d="M5 5h5M5 5v5M5 19h5M5 19v-5M19 19h-5M19 19v-5"
                                strokeWidth="1.4"
                                strokeLinecap="round"
                              />
                            </svg>
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2. Items */}
                  <div className="rounded-2xl bg-muted/30 p-4">
                    <h3 className="mb-3 text-xs font-semibold text-muted-foreground">
                      Order Books
                    </h3>
                    <div className="space-y-2">
                      {orderDetail.orderItems?.map((item) => {
                        const itemImage = getOrderItemImage(item);
                        const variantLabel = formatVariantLabel(item);

                        return (
                          <div
                            key={item.id}
                            className="flex flex-col gap-3 rounded-xl bg-card px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                                {itemImage ? (
                                  <Image
                                    src={itemImage}
                                    alt={item.product?.name || "Order item"}
                                    fill
                                    className="object-cover"
                                    sizes="48px"
                                  />
                                ) : (
                                  <span className="text-[9px] text-muted-foreground">
                                    No Image
                                  </span>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-foreground">
                                  {item.product?.name ||
                                    "Product Name Not Available"}
                                </p>
                                {variantLabel && (
                                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                                    Variant: {variantLabel}
                                  </p>
                                )}
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  Qty: {item.quantity} x{" "}
                                  {formatMoney(
                                    Number(item.price),
                                    orderDetail.currency || "BDT",
                                  )}
                                </p>
                              </div>
                            </div>
                            <p className="shrink-0 text-left text-[11px] font-semibold text-foreground sm:text-right">
                              {formatMoney(
                                Number(item.quantity * item.price),
                                orderDetail.currency || "BDT",
                              )}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 border-t border-border pt-2 text-xs text-foreground">
                      <div className="flex justify-between">
                        <span>Subtotal</span>
                        <span>
                          {formatMoney(
                            Number(orderDetail.total),
                            orderDetail.currency || "BDT",
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Discount</span>
                        <span>
                          {formatMoney(
                            Number(orderDetail.discount_total || 0),
                            orderDetail.currency || "BDT",
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>VAT</span>
                        <span>
                          {formatMoney(
                            Number(orderDetail.Vat_total || 0),
                            orderDetail.currency || "BDT",
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Shipping</span>
                        <span>
                          {formatMoney(
                            Number(orderDetail.shipping_cost),
                            orderDetail.currency || "BDT",
                          )}
                        </span>
                      </div>
                      <div className="mt-1 flex justify-between font-semibold">
                        <span>Grand Total</span>
                        <span>
                          {formatMoney(
                            Number(orderDetail.grand_total),
                            orderDetail.currency || "BDT",
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 3. Order meta (status, payment, transaction) */}
                  <div className="rounded-2xl bg-muted/30 p-4">
                    <h3 className="mb-3 text-xs font-semibold text-muted-foreground">
                      Order Status
                    </h3>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1 text-xs">
                        <p className="text-muted-foreground">Order Status</p>
                        <select
                          value={editOrderStatus}
                          onChange={(e) =>
                            setEditOrderStatus(
                              e.target.value as OrderStatusType,
                            )
                          }
                          className="w-full rounded-xl border border-border bg-card px-2 py-2 text-xs"
                        >
                          <option value="PENDING">PENDING</option>
                          <option value="CONFIRMED">CONFIRMED</option>
                          <option value="PROCESSING">PROCESSING</option>
                          <option value="SHIPPED">SHIPPED</option>
                          <option value="DELIVERED">DELIVERED</option>
                          <option value="FAILED">FAILED</option>
                          <option value="RETURNED">RETURNED</option>
                          <option value="CANCELLED">CANCELLED</option>
                        </select>
                      </div>
                      <div className="space-y-1 text-xs">
                        <p className="text-muted-foreground">Payment Status</p>
                        <select
                          value={editPaymentStatus}
                          onChange={(e) =>
                            setEditPaymentStatus(
                              e.target.value as PaymentStatusType,
                            )
                          }
                          className="w-full rounded-xl border border-border bg-card px-2 py-2 text-xs"
                        >
                          <option value="PAID">PAID</option>
                          <option value="UNPAID">UNPAID</option>
                          <option value="REFUNDED">REFUNDED</option>
                        </select>
                      </div>
                      <div className="space-y-1 text-xs">
                        <p className="text-muted-foreground">Transaction ID</p>
                        <input
                          value={editTransactionId}
                          onChange={(e) => setEditTransactionId(e.target.value)}
                          placeholder="Bkash/Nagad txn id..."
                          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs outline-none"
                        />
                      </div>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      * Only admin can successfully update these options.
                    </p>
                  </div>

                  {/* 4. Shipment */}
                  <div className="rounded-2xl bg-muted/30 p-4">
                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-xs font-semibold text-muted-foreground">
                        Shipment Status
                      </h3>
                      {shipment && (
                        <span
                          className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${shipmentBadgeClass(
                            shipment.status,
                          )}`}
                        >
                          Current: {shipment.status}
                        </span>
                      )}
                    </div>

                    {!shipment && (
                      <p className="mb-3 text-[11px] text-muted-foreground">
                        No shipment created for this order yet. Fill the form
                        below to create a new shipment.
                      </p>
                    )}

                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="space-y-1 text-xs">
                        <p className="text-muted-foreground">Warehouse</p>
                        <select
                          value={editWarehouseId}
                          onChange={(e) => setEditWarehouseId(e.target.value)}
                          className="w-full rounded-xl border border-border bg-card px-2 py-2 text-xs"
                        >
                          <option value="">Select Warehouse</option>
                          {warehouses.map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>
                              {warehouse.name} ({warehouse.code})
                              {warehouse.isDefault ? " - Default" : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1 text-xs">
                        <p className="text-muted-foreground">Courier</p>
                        {couriers.length > 0 ? (
                          <select
                            value={editCourierId}
                            onChange={(e) => {
                              const nextId = e.target.value;
                              setEditCourierId(nextId);
                              const selectedCourier = couriers.find(
                                (c) => String(c.id) === nextId,
                              );
                              setEditCourier(selectedCourier?.name || "");
                            }}
                            className="w-full rounded-xl border border-border bg-card px-2 py-2 text-xs"
                          >
                            <option value="">Select Courier</option>
                            {couriers
                              .filter((c) => c.isActive)
                              .map((courier) => (
                                <option key={courier.id} value={courier.id}>
                                  {courier.name} ({courier.type})
                                </option>
                              ))}
                          </select>
                        ) : (
                          <input
                            value={editCourier}
                            onChange={(e) => setEditCourier(e.target.value)}
                            placeholder="Courier name..."
                            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs outline-none"
                          />
                        )}
                      </div>

                      <div className="space-y-1 text-xs">
                        <p className="text-muted-foreground">Tracking Number</p>
                        <input
                          value={editTrackingNumber}
                          onChange={(e) =>
                            setEditTrackingNumber(e.target.value)
                          }
                          placeholder="tracking no..."
                          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs outline-none"
                        />
                      </div>
                      <div className="space-y-1 text-xs">
                        <p className="text-muted-foreground">Shipment Status</p>
                        <select
                          value={editShipmentStatus}
                          onChange={(e) =>
                            setEditShipmentStatus(
                              e.target.value as ShipmentStatusType,
                            )
                          }
                          className="w-full rounded-xl border border-border bg-card px-2 py-2 text-xs"
                        >
                          <option value="PENDING">PENDING</option>
                          <option value="ASSIGNED">ASSIGNED</option>
                          <option value="IN_TRANSIT">IN_TRANSIT</option>
                          <option value="OUT_FOR_DELIVERY">
                            OUT_FOR_DELIVERY
                          </option>
                          <option value="DELIVERED">DELIVERED</option>
                          <option value="FAILED">FAILED</option>
                          <option value="RETURNED">RETURNED</option>
                          <option value="CANCELLED">CANCELLED</option>
                        </select>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <div className="space-y-1 text-xs">
                        <p className="text-muted-foreground">Expected Date</p>
                        <input
                          type="date"
                          value={editExpectedDate}
                          onChange={(e) => setEditExpectedDate(e.target.value)}
                          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs outline-none"
                        />
                      </div>
                      <div className="space-y-1 text-xs">
                        <p className="text-muted-foreground">Delivered Date</p>
                        <input
                          type="date"
                          value={editDeliveredDate}
                          onChange={(e) => setEditDeliveredDate(e.target.value)}
                          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs outline-none"
                        />
                      </div>
                      {shipment && (
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <p>Created At</p>
                          <p className="rounded-xl bg-card px-3 py-2 text-[11px]">
                            {formatDate(shipment.createdAt || "")}
                          </p>
                        </div>
                      )}
                    </div>

                    {shipment && (
                      <div className="mt-3 grid gap-3 md:grid-cols-2 text-xs text-muted-foreground">
                        <div className="rounded-xl bg-card px-3 py-2">
                          Courier Status: {shipment.courierStatus || "-"}
                        </div>
                        <div className="rounded-xl bg-card px-3 py-2">
                          Last Synced:{" "}
                          {formatDate(shipment.lastSyncedAt || "") || "-"}
                        </div>
                        <div className="rounded-xl bg-card px-3 py-2">
                          External ID: {shipment.externalId || "-"}
                        </div>
                        <div className="rounded-xl bg-card px-3 py-2">
                          Tracking URL:{" "}
                          {shipment.trackingUrl ? (
                            <a
                              href={shipment.trackingUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline"
                            >
                              Open
                            </a>
                          ) : (
                            "-"
                          )}
                        </div>
                      </div>
                    )}

                    <div className="mt-4 rounded-2xl border border-border bg-card p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Delivery Man Assignment
                          </h4>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Assign or reassign this shipment to an active
                            delivery man directly from order management.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAssignModalOpen(true)}
                          disabled={!shipment}
                          className="btn-primary rounded-full px-4 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {currentAssignment
                            ? "Reassign Delivery Man"
                            : "Assign Delivery Man"}
                        </button>
                      </div>

                      {!shipment ? (
                        <div className="mt-4 rounded-xl border border-dashed border-border bg-background px-4 py-4 text-xs text-muted-foreground">
                          Create and save a shipment first. Once a shipment
                          exists, you can assign a delivery man from here.
                        </div>
                      ) : currentAssignment ? (
                        <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
                          <div className="rounded-xl border border-border bg-background p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-sm font-semibold text-foreground">
                                  {currentAssignment.deliveryMan.fullName}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {currentAssignment.deliveryMan.phone}
                                  {currentAssignment.deliveryMan.employeeCode
                                    ? ` - ${currentAssignment.deliveryMan.employeeCode}`
                                    : ""}
                                </p>
                              </div>
                              <AssignmentStatusBadge
                                status={currentAssignment.status}
                              />
                            </div>

                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                              <div className="rounded-xl border border-border bg-card px-3 py-3 text-xs text-muted-foreground">
                                <p className="font-medium text-foreground">
                                  Assigned at
                                </p>
                                <p className="mt-1">
                                  {formatDateTime(currentAssignment.assignedAt)}
                                </p>
                              </div>
                              <div className="rounded-xl border border-border bg-card px-3 py-3 text-xs text-muted-foreground">
                                <p className="font-medium text-foreground">
                                  Pickup proof
                                </p>
                                <p className="mt-1">
                                  {currentAssignment.pickupProof
                                    ? currentAssignment.pickupProof.status
                                    : currentAssignment.pickupProofStatus}
                                </p>
                                {currentAssignment.pickupProof?.confirmedAt ? (
                                  <p className="mt-1">
                                    Confirmed on{" "}
                                    {formatDateTime(
                                      currentAssignment.pickupProof.confirmedAt,
                                    )}
                                  </p>
                                ) : null}
                                {currentAssignment.pickupProof?.imageUrl ? (
                                  <a
                                    href={
                                      currentAssignment.pickupProof.imageUrl
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-2 inline-flex text-primary underline"
                                  >
                                    View pickup image
                                  </a>
                                ) : null}
                              </div>
                            </div>

                            {currentAssignment.note ? (
                              <div className="mt-3 rounded-xl border border-border bg-card px-3 py-3 text-xs text-muted-foreground">
                                <p className="font-medium text-foreground">
                                  Assignment note
                                </p>
                                <p className="mt-1">{currentAssignment.note}</p>
                              </div>
                            ) : null}

                            {currentAssignment.rejectionReason ? (
                              <div className="mt-3 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-3 text-xs text-destructive">
                                <p className="font-medium">Rejection reason</p>
                                <p className="mt-1">
                                  {currentAssignment.rejectionReason}
                                </p>
                              </div>
                            ) : null}
                          </div>

                          <div className="rounded-xl border border-border bg-background p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Recent Assignment Logs
                            </p>
                            {currentAssignment.logs.length > 0 ? (
                              <div className="mt-3 space-y-3">
                                {currentAssignment.logs.map((log) => (
                                  <div
                                    key={log.id}
                                    className="rounded-xl border border-border bg-card px-3 py-3 text-xs text-muted-foreground"
                                  >
                                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                      <p className="font-medium text-foreground">
                                        {log.fromStatus
                                          ? `${ASSIGNMENT_STATUS_LABELS[log.fromStatus]} -> ${ASSIGNMENT_STATUS_LABELS[log.toStatus]}`
                                          : ASSIGNMENT_STATUS_LABELS[
                                              log.toStatus
                                            ]}
                                      </p>
                                      <span>
                                        {formatDateTime(log.createdAt)}
                                      </span>
                                    </div>
                                    {log.actor?.name ? (
                                      <p className="mt-1">
                                        By {log.actor.name}
                                      </p>
                                    ) : null}
                                    {log.note ? (
                                      <p className="mt-2 rounded-lg border border-border bg-background px-2 py-2">
                                        {log.note}
                                      </p>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-3 text-xs text-muted-foreground">
                                No assignment history recorded yet.
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 rounded-xl border border-dashed border-border bg-background px-4 py-4 text-xs text-muted-foreground">
                          No delivery man assigned yet for this shipment.
                        </div>
                      )}
                    </div>

                    {shipment && (
                      <div className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <h4 className="delivery-proof-header text-xs font-semibold uppercase tracking-[0.18em]">
                              Delivery Proof Flow
                            </h4>
                            <p className="mt-1 text-xs text-muted-foreground">
                              When shipment reaches{" "}
                              <strong>OUT_FOR_DELIVERY</strong>, customer can
                              confirm with PIN + checklist + optional photo.
                            </p>
                          </div>
                          <div className="delivery-pin-container rounded-xl border border-border px-3 py-2 text-right shadow-sm">
                            <p className="delivery-pin-label text-[10px] uppercase tracking-[0.18em]">
                              Delivery PIN
                            </p>
                            <p className="delivery-pin-value mt-1 font-mono text-sm font-semibold">
                              {shipment.deliveryConfirmationPin ||
                                "Will generate on OFD"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div className="delivery-link-container rounded-xl border border-border px-3 py-3 shadow-sm">
                            <p className="delivery-link-label text-[10px] uppercase tracking-[0.18em]">
                              Confirmation Link
                            </p>
                            {shipment.deliveryConfirmationUrl ? (
                              <a
                                href={shipment.deliveryConfirmationUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="delivery-link-value mt-1 block break-all text-xs font-medium underline"
                              >
                                {shipment.deliveryConfirmationUrl}
                              </a>
                            ) : (
                              <p className="delivery-status-value mt-1 text-xs">
                                Link will appear automatically when shipment is
                                out for delivery.
                              </p>
                            )}
                          </div>

                          <div className="delivery-status-container rounded-xl border border-border px-3 py-3 shadow-sm">
                            <p className="delivery-status-label text-[10px] uppercase tracking-[0.18em]">
                              Customer Proof Status
                            </p>
                            {shipment.deliveryProof ? (
                              <div className="delivery-status-value mt-1 space-y-1 text-xs">
                                <p className="font-medium">
                                  Confirmed on{" "}
                                  {formatDate(
                                    shipment.deliveryProof.confirmedAt,
                                  )}
                                </p>
                                <p>
                                  Checks: received / correct items / good
                                  condition
                                </p>
                                {shipment.deliveryProof.photoUrl ? (
                                  <a
                                    href={shipment.deliveryProof.photoUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex text-xs font-medium text-primary underline"
                                  >
                                    View proof photo
                                  </a>
                                ) : null}
                                {shipment.deliveryProof.note ? (
                                  <p className="rounded-lg border border-border bg-card px-2 py-1 text-muted-foreground">
                                    {shipment.deliveryProof.note}
                                  </p>
                                ) : null}
                              </div>
                            ) : (
                              <p className="mt-1 text-xs text-muted-foreground">
                                No customer delivery proof submitted yet.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <p className="mt-1 text-[10px] text-muted-foreground">
                      * Only admin can create/update shipment; other users will
                      get Forbidden from API.
                    </p>
                  </div>

                  {/* unified save button */}
                  <div className="pt-2 pb-4">
                    <button
                      type="button"
                      onClick={handleSaveAll}
                      disabled={saving}
                      className="w-full rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                    >
                      {saving
                        ? "Saving..."
                        : "Save All Order and Shipment Updates"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ✅ Success Modal */}
      <AssignDeliveryManModal
        open={assignModalOpen}
        onOpenChange={setAssignModalOpen}
        shipments={selectedShipmentForAssignment}
        deliveryMen={deliveryMen}
        onAssigned={handleAssigned}
      />

      {successOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-xs rounded-2xl bg-card px-5 py-4 shadow-xl border-border">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path
                    d="M5 13l4 4L19 7"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Update Successful
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {successMessage || "Information updated successfully."}
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setSuccessOpen(false)}
                className="rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ❌ Error Modal */}
      {errorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-xs rounded-2xl bg-card px-5 py-4 shadow-xl border-border">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/10 text-red-600">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path
                    d="M6 18L18 6M6 6l12 12"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Error</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {errorMessage || "An error occurred."}
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setErrorOpen(false)}
                className="rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderManagement;
