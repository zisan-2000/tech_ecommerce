// app/ecommerce/user/orders/[invoiceId]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle,
  Truck,
  Package,
  Calendar,
  Receipt,
  ShieldCheck,
  MapPin,
  X,
} from "lucide-react";
import { DeliveryConfirmationForm } from "@/components/customer/DeliveryConfirmationForm";
import ProductReviews from "@/components/ecommarce/ProductReviews";

interface CartItem {
  id: number | string;
  productId: number;
  variantId: number | null;
  name: string;
  price: number;
  quantity: number;
  image: string;
}

function mergeIdenticalOrderItems(items: CartItem[]) {
  const merged = new Map<string, CartItem>();

  for (const item of items) {
    const key = `${item.productId}:${item.variantId ?? "default"}:${item.price}`;
    const current = merged.get(key);
    if (current) {
      current.quantity += item.quantity;
    } else {
      merged.set(key, { ...item });
    }
  }

  return [...merged.values()];
}

interface OrderRefund {
  id: number;
  orderItemId: number | null;
  status: string;
  reason: string;
  amount: number;
  quantity: number | null;
  createdAt: string;
  updatedAt: string;
}

interface Customer {
  name: string;
  mobile: string;
  email: string;
  location?: string;
  address?: string;
  deliveryAddress?: string;
}

interface Order {
  invoiceId: string;
  customer: Customer;
  cartItems?: CartItem[] | null;
  paymentMethod: string;
  transactionId: string | null;
  total: number;
  createdAt: string;
  status: string;
  paymentStatus: string;
  vatTotal?: number;
  discountTotal?: number;
  coupon?: {
    id: string;
    code: string;
    discountType: string;
    discountValue: number;
  } | null;
  refunds?: OrderRefund[];
}

interface Shipment {
  id?: number;
  status: string;
  courier?: string | null;
  trackingNumber?: string | null;
  deliveryConfirmationToken?: string | null;
  deliveryConfirmationUrl?: string | null;
  shippedAt?: string | null;
  expectedDate?: string | null;
  deliveredAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  deliveryProof?: {
    id: number;
    confirmedAt: string;
    photoUrl?: string | null;
    note?: string | null;
  } | null;
}

const formatDate = (date: string | null | undefined) => {
  if (!date) return "Processing...";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const getOrderStatusConfig = (status: string) => {
  const s = status?.toUpperCase();
  if (s === "DELIVERED") {
    return {
      label: "Delivered",
      className: "bg-emerald-100 text-emerald-800 border border-emerald-200",
    };
  }
  if (s === "RETURNED") {
    return {
      label: "Returned",
      className: "bg-violet-100 text-violet-800 border border-violet-200",
    };
  }
  if (s === "FAILED") {
    return {
      label: "Failed",
      className: "bg-rose-100 text-rose-800 border border-rose-200",
    };
  }
  if (s === "SHIPPED" || s === "PROCESSING" || s === "CONFIRMED") {
    return {
      label:
        s === "SHIPPED"
          ? "Shipped"
          : s === "PROCESSING"
            ? "Processing"
            : "Confirmed",
      className: "bg-blue-100 text-blue-800 border border-blue-200",
    };
  }
  if (s === "CANCELLED") {
    return {
      label: "Cancelled",
      className: "bg-red-100 text-red-800 border border-red-200",
    };
  }
  return {
    label: "Pending",
    className: "bg-amber-100 text-amber-800 border border-amber-200",
  };
};

const getPaymentStatusConfig = (paymentStatus: string) => {
  const s = paymentStatus?.toUpperCase();
  if (s === "PAID") {
    return {
      label: "Paid",
      className: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    };
  }
  if (s === "REFUNDED") {
    return {
      label: "Refunded",
      className: "bg-violet-50 text-violet-700 border border-violet-200",
    };
  }
  return {
    label: "Unpaid",
    className: "bg-rose-50 text-rose-700 border border-rose-200",
  };
};

/* =========================
   ✅ Skeleton helpers
========================= */
function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-muted ${className}`}
      aria-hidden="true"
    />
  );
}

function OrderDetailsSkeleton() {
  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header skeleton */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <Skeleton className="h-4 w-24" />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-72" />
            </div>

            <div className="bg-card text-card-foreground px-4 py-3 rounded-lg border border-border shadow-sm text-sm w-full sm:w-[260px]">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-32 mt-2" />
              <div className="mt-3 flex gap-2">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main */}
          <div className="lg:col-span-2 space-y-8">
            {/* Status card skeleton */}
            <Card className="bg-primary text-primary-foreground overflow-hidden border-0">
              <div className="p-8">
                <div className="flex items-center gap-4 mb-4">
                  <div className="bg-primary-foreground/10 p-3 rounded-2xl">
                    <Skeleton className="h-8 w-8 rounded-xl bg-primary-foreground/20" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-6 w-72 bg-primary-foreground/20" />
                    <Skeleton className="h-4 w-80 bg-primary-foreground/20" />
                  </div>
                </div>

                <div className="bg-primary-foreground/10 rounded-xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-28 bg-primary-foreground/20" />
                      <Skeleton className="h-5 w-40 bg-primary-foreground/20" />
                    </div>
                    <Skeleton className="h-10 w-28 rounded-lg bg-primary-foreground/20" />
                  </div>
                </div>
              </div>
            </Card>

            {/* Order Journey skeleton */}
            <Card className="card-theme p-8">
              <div className="flex items-center gap-3 mb-8">
                <Skeleton className="h-6 w-6 rounded-md" />
                <Skeleton className="h-6 w-40" />
              </div>

              <div className="space-y-6">
                {[1, 2, 3, 4].map((k) => (
                  <div key={k} className="flex gap-6">
                    <div className="flex flex-col items-center">
                      <Skeleton className="h-12 w-12 rounded-2xl" />
                      {k !== 4 && (
                        <Skeleton className="w-0.5 flex-1 mt-2 mb-1 rounded-none" />
                      )}
                    </div>

                    <div className="flex-1 pb-6">
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-3">
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-4 w-72" />
                          <Skeleton className="h-4 w-56" />
                        </div>
                        <Skeleton className="h-6 w-24 rounded-full" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Order Summary skeleton */}
            <Card className="card-theme p-0 shadow-sm">
              <div className="px-6 py-3 border-b border-border">
                <Skeleton className="h-5 w-32" />
              </div>

              <div className="px-4 md:px-6 py-4 space-y-4">
                {[1, 2, 3].map((k) => (
                  <div
                    key={k}
                    className="flex gap-4 pb-4 border-b last:border-b-0 border-dashed border-border"
                  >
                    <Skeleton className="w-20 h-28 rounded-sm" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <div className="flex gap-4">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                      <Skeleton className="h-4 w-40" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-6 py-4 border-t border-border flex justify-end">
                <div className="w-full sm:w-[260px] space-y-2">
                  <div className="flex justify-between gap-8">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <div className="flex justify-between gap-8">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <div className="flex justify-between gap-8">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Sidebar skeleton */}
          <div className="space-y-8">
            <Card className="card-theme p-6">
              <div className="flex items-center gap-3 mb-6">
                <Skeleton className="h-5 w-5 rounded-md" />
                <Skeleton className="h-5 w-44" />
              </div>

              <div className="space-y-4">
                {[1, 2, 3, 4].map((k) => (
                  <div key={k} className="space-y-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-56" />
                  </div>
                ))}
              </div>
            </Card>

            <Card className="bg-accent text-accent-foreground border border-border p-6">
              <div className="text-center">
                <Skeleton className="h-16 w-16 rounded-2xl mx-auto mb-4" />
                <Skeleton className="h-5 w-40 mx-auto mb-3" />
                <Skeleton className="h-4 w-56 mx-auto mb-4" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrderDetailsPage() {
  const params = useParams();
  const invoiceId = params?.invoiceId as string | undefined;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewProduct, setReviewProduct] = useState<{
    productId: number;
    name: string;
  } | null>(null);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundItem, setRefundItem] = useState<{
    orderItemId: number;
    productId: number;
    name: string;
    quantity: number;
  } | null>(null);
  const [refundQuantity, setRefundQuantity] = useState(1);
  const [refundReason, setRefundReason] = useState("");
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceId) {
      setError("Order ID not found.");
      setLoading(false);
      return;
    }

    const fetchOrder = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/orders/${invoiceId}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });

        if (res.status === 401) {
          setError("You must be logged in to view this order.");
          setOrder(null);
          return;
        }

        if (res.status === 404) {
          setError("No order found.");
          setOrder(null);
          return;
        }

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          console.error("Failed to fetch order:", data || res.statusText);
          setError("Failed to load order.");
          setOrder(null);
          return;
        }

        const o = await res.json();

        const orderItemsRaw: any[] = Array.isArray(o.orderItems)
          ? o.orderItems
          : [];

        const uniqueProductIds = Array.from(
          new Set(
            orderItemsRaw
              .map((oi) => Number(oi.productId))
              .filter((id) => !!id && !Number.isNaN(id)),
          ),
        );

        const imageMap: Record<number, string> = {};

        if (uniqueProductIds.length > 0) {
          await Promise.all(
            uniqueProductIds.map(async (pid) => {
              try {
                const pRes = await fetch(`/api/products/${pid}`, {
                  method: "GET",
                  headers: { "Content-Type": "application/json" },
                  cache: "no-store",
                });

                if (!pRes.ok) return;
                const pData = await pRes.json();
                if (pData && pData.image) {
                  imageMap[pid] = pData.image as string;
                }
              } catch (err) {
                console.error("Failed to fetch product image:", pid, err);
              }
            }),
          );
        }

        const items: CartItem[] = orderItemsRaw.map((oi: any) => {
          const pidNum = Number(oi.productId);
          const imageFromProducts =
            (!Number.isNaN(pidNum) && imageMap[pidNum]) || "";
          const fallbackImage = oi.product?.image ?? "";

          return {
            id: oi.id,
            productId: Number(oi.productId),
            variantId:
              oi.variantId === null || oi.variantId === undefined
                ? null
                : Number(oi.variantId),
            name: oi.product?.name ?? "Unknown product",
            price: Number(oi.price ?? 0),
            quantity: Math.max(1, Number(oi.quantity ?? 1)),
            image: imageFromProducts || fallbackImage,
          };
        });

        const mapped: Order = {
          invoiceId: String(o.id),
          customer: {
            name: o.name,
            mobile: o.phone_number,
            email: o.email ?? "",
            address: o.address_details ?? "",
            location: `${o.area || ""}, ${o.district || ""}, ${o.country || ""}`
              .replace(/^[,\s]+|[,\s]+$/g, "")
              .replace(/,\s*,/g, ","),
            deliveryAddress: o.address_details ?? "",
          },
          cartItems: items,
          paymentMethod: o.payment_method,
          transactionId: o.transactionId ?? null,
          total: Number(o.grand_total ?? o.total ?? 0),
          createdAt: o.createdAt ?? o.order_date,
          status: o.status ?? "PENDING",
          paymentStatus: o.paymentStatus ?? "UNPAID",
          vatTotal: Number(o.Vat_total ?? 0),
          discountTotal: Number(o.discount_total ?? 0),
          coupon: o.coupon
            ? {
                id: o.coupon.id,
                code: o.coupon.code,
                discountType: o.coupon.discountType,
                discountValue: Number(o.coupon.discountValue),
              }
            : null,
          refunds: Array.isArray(o.refunds)
            ? o.refunds.map((refund: any) => ({
                id: Number(refund.id),
                orderItemId:
                  refund.orderItemId === null ||
                  refund.orderItemId === undefined
                    ? null
                    : Number(refund.orderItemId),
                status: String(refund.status ?? "REQUESTED"),
                reason: String(refund.reason ?? ""),
                amount: Number(refund.amount ?? 0),
                quantity:
                  refund.quantity === null || refund.quantity === undefined
                    ? null
                    : Number(refund.quantity),
                createdAt: refund.createdAt ?? new Date().toISOString(),
                updatedAt:
                  refund.updatedAt ??
                  refund.createdAt ??
                  new Date().toISOString(),
              }))
            : [],
        };

        setOrder(mapped);
      } catch (err) {
        console.error("Error fetching order:", err);
        setError("Failed to load order.");
        setOrder(null);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [invoiceId]);

  useEffect(() => {
    if (!invoiceId) return;

    const fetchShipment = async () => {
      try {
        const res = await fetch(`/api/shipments?orderId=${invoiceId}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });

        if (!res.ok) return;

        const data = await res.json();

        let s: any = null;
        if (Array.isArray(data)) {
          s = data[0] ?? null;
        } else if (Array.isArray(data?.shipments)) {
          s = data.shipments[0] ?? null;
        } else if (data?.shipment) {
          s = data.shipment;
        } else {
          s = data;
        }

        if (s) {
          setShipment({
            id: s.id,
            status: s.status,
            courier: s.courier,
            trackingNumber: s.trackingNumber,
            deliveryConfirmationToken: s.deliveryConfirmationToken,
            deliveryConfirmationUrl: s.deliveryConfirmationUrl,
            shippedAt: s.shippedAt,
            expectedDate: s.expectedDate,
            deliveredAt: s.deliveredAt,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            deliveryProof: s.deliveryProof || null,
          });
        }
      } catch (err) {
        console.error("Error fetching shipment:", err);
      }
    };

    fetchShipment();
  }, [invoiceId]);

  // ✅ Order Journey status colors (UNCHANGED)
  const getStatusColor = (color: string) => {
    const colors = {
      emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
      blue: "bg-blue-50 border-blue-200 text-blue-700",
      purple: "bg-purple-50 border-purple-200 text-purple-700",
      orange: "bg-orange-50 border-orange-200 text-orange-700",
      amber: "bg-amber-50 border-amber-200 text-amber-700",
      green: "bg-green-50 border-green-200 text-green-700",
      red: "bg-red-50 border-red-200 text-red-700",
    };
    return colors[color as keyof typeof colors] || colors.emerald;
  };

  // ✅ Order Journey icon colors (UNCHANGED)
  const getIconColor = (color: string) => {
    const colors = {
      emerald: "text-emerald-600",
      blue: "text-blue-600",
      purple: "text-purple-600",
      orange: "text-orange-600",
      amber: "text-amber-600",
      green: "text-green-600",
      red: "text-red-600",
    };
    return colors[color as keyof typeof colors] || colors.emerald;
  };

  type Stage = {
    id: number;
    label: string;
    description: string;
    dateLabel: string;
    icon: any;
    color: "emerald" | "blue" | "purple" | "orange" | "amber" | "green" | "red";
  };

  const buildStages = (order: Order, shipment: Shipment | null): Stage[] => {
    const sStatus = shipment?.status?.toUpperCase() ?? "PENDING";
    const oStatus = order.status?.toUpperCase();

    if (sStatus === "CANCELLED" || oStatus === "CANCELLED") {
      return [
        {
          id: 1,
          label: "Order Cancelled",
          description: "This order has been cancelled.",
          dateLabel: formatDate(shipment?.updatedAt || order.createdAt),
          icon: ShieldCheck,
          color: "red",
        },
      ];
    }

    const placed: Stage = {
      id: 1,
      label: "Order Placed",
      description: "We received your order and it is being processed.",
      dateLabel: formatDate(order.createdAt),
      icon: ShieldCheck,
      color: "emerald",
    };

    const shipped: Stage = {
      id: 2,
      label: "Shipped",
      description: shipment?.courier
        ? `Handed over to courier (${shipment.courier})${
            shipment.trackingNumber
              ? `, Tracking: ${shipment.trackingNumber}`
              : ""
          }.`
        : "Order has been shipped from our warehouse.",
      dateLabel: formatDate(shipment?.shippedAt || shipment?.createdAt),
      icon: Package,
      color: "blue",
    };

    const outForDelivery: Stage = {
      id: 3,
      label: "Out for Delivery",
      description: "Courier is on the way to your delivery address.",
      dateLabel: formatDate(shipment?.expectedDate || shipment?.shippedAt),
      icon: Truck,
      color: "orange",
    };

    const delivered: Stage = {
      id: 4,
      label: "Delivered",
      description: "Order delivered to your address.",
      dateLabel: formatDate(shipment?.deliveredAt),
      icon: CheckCircle,
      color: "green",
    };

    return [placed, shipped, outForDelivery, delivered];
  };

  const getActiveStageIndex = (
    stages: Stage[],
    order: Order,
    shipment: Shipment | null,
  ) => {
    if (stages.length === 1 && stages[0].label === "Order Cancelled") return 0;

    const sStatus = shipment?.status?.toUpperCase() ?? "PENDING";
    const oStatus = order.status?.toUpperCase();

    if (sStatus === "DELIVERED" || oStatus === "DELIVERED") {
      return stages.length - 1;
    }
    if (sStatus === "RETURNED" || oStatus === "RETURNED") {
      return stages.length - 1;
    }
    if (sStatus === "FAILED" || oStatus === "FAILED") {
      return Math.min(1, stages.length - 1);
    }
    if (sStatus === "OUT_FOR_DELIVERY") return Math.min(2, stages.length - 1);
    if (sStatus === "IN_TRANSIT") return Math.min(1, stages.length - 1);
    return 0;
  };

  // ✅ only skeleton, no text
  if (loading) return <OrderDetailsSkeleton />;

  if (error || !order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="card-theme px-6 py-4 text-sm text-muted-foreground text-center space-y-3">
          <p>{error || "Order not found."}</p>
          <Link
            href="/ecommerce/user/orders"
            className="text-sm text-primary hover:underline"
          >
            Back to My Orders
          </Link>
        </Card>
      </div>
    );
  }

  const items = Array.isArray(order.cartItems) ? order.cartItems : [];
  const displayItems = mergeIdenticalOrderItems(items);
  const subTotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const vatTotal = Number(order.vatTotal ?? 0);
  const discountTotal = Number(order.discountTotal ?? 0);
  const deliveryCharge = Math.max(
    order.total - subTotal - vatTotal + discountTotal,
    0,
  );

  const statusCfg = getOrderStatusConfig(order.status);
  const paymentCfg = getPaymentStatusConfig(order.paymentStatus);

  const stages = buildStages(order, shipment);
  const activeStageIndex = getActiveStageIndex(stages, order, shipment);
  const canConfirmDelivery =
    Boolean(shipment?.deliveryConfirmationUrl) &&
    ["OUT_FOR_DELIVERY", "DELIVERED"].includes(
      shipment?.status?.toUpperCase() || "",
    ) &&
    !shipment?.deliveryProof;
  const canLeaveReview =
    statusCfg.label === "Delivered" ||
    shipment?.status?.toUpperCase() === "DELIVERED";
  const proofToken =
    shipment?.deliveryConfirmationToken ||
    shipment?.deliveryConfirmationUrl?.split("/").pop() ||
    "";

  const openReviewModal = (productId: number, name: string) => {
    setReviewProduct({ productId, name });
    setReviewModalOpen(true);
  };

  const closeReviewModal = () => {
    setReviewModalOpen(false);
    setReviewProduct(null);
  };

  const getRefundedQuantity = (orderItemId: number) =>
    (order?.refunds || []).reduce((sum, refund) => {
      const activeStatuses = new Set(["REQUESTED", "APPROVED", "COMPLETED"]);
      if (refund.orderItemId !== orderItemId) return sum;
      if (!activeStatuses.has(String(refund.status).toUpperCase())) return sum;
      return sum + Math.max(0, Number(refund.quantity) || 0);
    }, 0);

  const refundDeadline = shipment?.deliveredAt
    ? new Date(shipment.deliveredAt)
    : null;
  if (refundDeadline) {
    refundDeadline.setDate(refundDeadline.getDate() + 7);
  }
  const canRequestRefund =
    Boolean(refundDeadline) && Date.now() <= refundDeadline!.getTime();

  const openRefundModal = (item: CartItem) => {
    const availableQuantity = Math.max(
      item.quantity - getRefundedQuantity(Number(item.id)),
      0,
    );
    setRefundItem({
      orderItemId: Number(item.id),
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
    });
    setRefundQuantity(Math.max(1, availableQuantity || 1));
    setRefundReason("");
    setRefundError(null);
    setRefundModalOpen(true);
  };

  const closeRefundModal = () => {
    setRefundModalOpen(false);
    setRefundItem(null);
    setRefundQuantity(1);
    setRefundReason("");
    setRefundError(null);
    setRefundSubmitting(false);
  };

  const submitRefundRequest = async () => {
    if (!refundItem) return;

    const itemRefundedQuantity = getRefundedQuantity(refundItem.orderItemId);
    const availableQuantity = Math.max(
      refundItem.quantity - itemRefundedQuantity,
      0,
    );

    if (!canRequestRefund || !refundDeadline) {
      setRefundError("Refunds are available only within 7 days of delivery.");
      return;
    }

    if (!refundReason.trim() || refundReason.trim().length < 10) {
      setRefundError("Please add a clear reason for the refund.");
      return;
    }

    const nextQuantity = Math.min(
      Math.max(1, Math.floor(refundQuantity || 1)),
      availableQuantity,
    );

    if (nextQuantity <= 0) {
      setRefundError("No refundable quantity is left for this item.");
      return;
    }

    try {
      setRefundSubmitting(true);
      setRefundError(null);

      const res = await fetch("/api/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          orderItemId: refundItem.orderItemId,
          quantity: nextQuantity,
          reason: refundReason.trim(),
        }),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setRefundError(payload?.error || "Failed to submit refund request.");
        return;
      }

      const createdRefund = payload?.refund;
      if (createdRefund) {
        setOrder((prev) =>
          prev
            ? {
                ...prev,
                refunds: [
                  ...(prev.refunds || []),
                  {
                    id: Number(createdRefund.id),
                    orderItemId:
                      createdRefund.orderItemId === null ||
                      createdRefund.orderItemId === undefined
                        ? null
                        : Number(createdRefund.orderItemId),
                    status: String(createdRefund.status ?? "REQUESTED"),
                    reason: String(createdRefund.reason ?? ""),
                    amount: Number(createdRefund.amount ?? 0),
                    quantity:
                      createdRefund.quantity === null ||
                      createdRefund.quantity === undefined
                        ? null
                        : Number(createdRefund.quantity),
                    createdAt:
                      createdRefund.createdAt ?? new Date().toISOString(),
                    updatedAt:
                      createdRefund.updatedAt ??
                      createdRefund.createdAt ??
                      new Date().toISOString(),
                  },
                ],
              }
            : prev,
        );
      }

      closeRefundModal();
    } catch (error) {
      console.error("Failed to submit refund request:", error);
      setRefundError("Failed to submit refund request.");
      setRefundSubmitting(false);
    } finally {
      setRefundSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/ecommerce/user/orders"
            className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 mb-4"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Orders
          </Link>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                Order Details
              </h1>
              <p className="text-muted-foreground mt-2">
                Track your order progress and details
              </p>
            </div>

            <div className="bg-card text-card-foreground px-4 py-3 rounded-lg border border-border shadow-sm text-sm">s
              <p className="text-muted-foreground">Order Date</p>
              <p className="font-semibold">{formatDate(order.createdAt)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusCfg.className}`}
                >
                  Status: {statusCfg.label}
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${paymentCfg.className}`}
                >
                  Payment: {paymentCfg.label}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main */}
          <div className="lg:col-span-2 space-y-8">
            {/* Status Card — redesigned */}
            <Card className="overflow-hidden border border-border shadow-sm">
              {/* Top row: icon + title + badge */}
              <div className="flex items-center gap-3.5 px-6 py-4 border-b border-border">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <CheckCircle className="h-4.5 w-4.5" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium text-foreground">
                    {statusCfg.label === "Delivered"
                      ? "Order delivered"
                      : `Order status: ${statusCfg.label}`}
                  </p>
                  <p className="text-[13px] text-muted-foreground mt-0.5 truncate">
                    Payment: {paymentCfg.label}&nbsp;·&nbsp;Method:{" "}
                    {order.paymentMethod}
                    {order.transactionId
                      ? ` · TxID: ${order.transactionId}`
                      : ""}
                  </p>
                </div>

                <span
                  className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusCfg.className}`}
                >
                  {statusCfg.label}
                </span>
              </div>

              {/* Bottom row: order number + payment badge */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-0.5">
                    Order number
                  </p>
                  <p className="font-mono text-sm font-medium text-foreground">
                    #{order.invoiceId}
                  </p>
                </div>

                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${paymentCfg.className}`}
                >
                  Payment: {paymentCfg.label}
                </span>
              </div>
            </Card>
            {/* Order Summary */}
            <Card className="card-theme p-0 shadow-sm">
              <div className="px-6 py-3 border-b border-border">
                <h2 className="text-sm md:text-base font-semibold text-foreground">
                  Order Summary
                </h2>
              </div>

              <div className="px-4 md:px-6 py-4 space-y-4">
                {displayItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex gap-4 pb-4 border-b last:border-b-0 border-dashed border-border"
                  >
                    <div className="w-20 h-28 flex-shrink-0 bg-muted border border-border rounded-sm overflow-hidden flex items-center justify-center">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] text-muted-foreground px-2 text-center">
                          No Image
                        </span>
                      )}
                    </div>

                    <div className="flex-1 flex flex-col justify-between text-sm">
                      <div>
                        <p className="font-medium text-foreground mb-1 line-clamp-2">
                          {item.name}
                        </p>
                        <div className="flex flex-wrap gap-3 text-[13px] text-muted-foreground">
                          <span>
                            Price:{" "}
                            <span className="font-semibold text-foreground">
                              TK. {item.price.toFixed(2)}
                            </span>
                          </span>
                          <span>
                            Qty:{" "}
                            <span className="font-semibold text-foreground">
                              {item.quantity}
                            </span>
                          </span>
                        </div>
                      </div>

                      <p className="text-[12px] text-muted-foreground mt-2">
                        Line Total:{" "}
                        <span className="font-semibold text-foreground">
                          TK. {(item.price * item.quantity).toFixed(2)}
                        </span>
                      </p>
                      {canLeaveReview && (
                        <button
                          type="button"
                          onClick={() =>
                            openReviewModal(item.productId, item.name)
                          }
                          className="mt-3 inline-flex text-sm font-medium text-primary underline underline-offset-2 transition-colors hover:text-primary/80"
                        >
                          Leave a review
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-6 py-4 border-t border-border flex justify-end">
                <div className="text-sm space-y-1 text-right">
                  <div className="flex justify-between gap-8 text-[13px] text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="text-foreground">
                      TK. {subTotal.toFixed(2)}
                    </span>
                  </div>
                  {discountTotal > 0 && (
                    <div className="flex justify-between gap-8 text-[13px] text-emerald-600">
                      <span>
                        Coupon Discount
                        {order.coupon && (
                          <span className="text-muted-foreground ml-1">
                            ({order.coupon.code})
                          </span>
                        )}
                      </span>
                      <span className="text-emerald-600">
                        -TK. {discountTotal.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between gap-8 text-[13px] text-muted-foreground">
                    <span>Delivery Charge</span>
                    <span className="text-foreground">
                      TK. {deliveryCharge.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-8 text-[13px] text-muted-foreground">
                    <span>VAT</span>
                    <span className="text-foreground">
                      TK. {vatTotal.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-8 text-[13px] text-muted-foreground">
                    <span>Payable Amount</span>
                    <span className="font-semibold text-foreground">
                      TK. {order.total.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Order Journey */}
            <Card className="card-theme p-8">
              <div className="flex items-center gap-3 mb-8">
                <Receipt className="w-6 h-6 text-foreground" />
                <h3 className="text-xl font-bold text-foreground">
                  Order Journey
                </h3>
              </div>

              <div className="space-y-6">
                {stages.map((stage, index) => {
                  const IconComponent = stage.icon;

                  const isActive = index <= activeStageIndex;
                  const isCurrent = index === activeStageIndex;
                  const isCompleted = index < activeStageIndex;

                  const circleBase =
                    "w-12 h-12 rounded-2xl border-2 flex items-center justify-center transition-all duration-300 group-hover:scale-110";

                  const circleClass = isActive
                    ? `${circleBase} ${getStatusColor(stage.color)}`
                    : `${circleBase} bg-card border-border`;

                  const iconClass = isActive
                    ? `w-5 h-5 ${getIconColor(stage.color)}`
                    : "w-5 h-5 text-muted-foreground";

                  const shipmentStatus = shipment?.status?.toUpperCase();
                  const orderStatus = order.status?.toUpperCase();
                  const isDeliveredStage = stage.label === "Delivered";
                  const isDeliveredFinal =
                    shipmentStatus === "DELIVERED" ||
                    orderStatus === "DELIVERED";
                  const isReturnedFinal =
                    shipmentStatus === "RETURNED" || orderStatus === "RETURNED";

                  let badgeText = "Pending";
                  let badgeClass =
                    "bg-muted text-muted-foreground border-border";

                  if (isReturnedFinal && isDeliveredStage) {
                    badgeText = "Returned";
                    badgeClass = "bg-red-50 text-red-700 border-red-200";
                  } else if (
                    isCompleted ||
                    (isDeliveredStage && isDeliveredFinal)
                  ) {
                    badgeText = "Completed";
                    badgeClass =
                      "bg-emerald-50 text-emerald-700 border-emerald-200";
                  } else if (isCurrent && isActive) {
                    badgeText = "In Progress";
                    badgeClass = "bg-blue-50 text-blue-700 border-blue-200";
                  }

                  return (
                    <div key={stage.id} className="flex gap-6 group">
                      <div className="flex flex-col items-center">
                        <div className={circleClass}>
                          <IconComponent className={iconClass} />
                        </div>
                        {index !== stages.length - 1 && (
                          <div className="flex-1 w-0.5 bg-border mt-2 mb-1" />
                        )}
                      </div>

                      <div className="flex-1 pb-6">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-3">
                          <div className="flex-1">
                            <p className="font-semibold text-foreground mb-1">
                              {stage.label}
                            </p>
                            <p className="text-muted-foreground mb-2">
                              {stage.description}
                            </p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Calendar className="w-4 h-4" />
                              <span>{stage.dateLabel}</span>
                            </div>
                          </div>

                          <div
                            className={`px-3 py-1 rounded-full text-xs font-medium border ${badgeClass}`}
                          >
                            {badgeText}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            <Card className="card-theme p-6">
              <div className="flex items-center gap-3 mb-6">
                <MapPin className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-foreground">
                  Delivery Information
                </h3>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">
                    Customer Name
                  </p>
                  <p className="font-semibold text-foreground">
                    {order.customer.name}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">
                    Contact Number
                  </p>
                  <p className="font-semibold text-foreground">
                    {order.customer.mobile}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">
                    Email Address
                  </p>
                  <p className="font-semibold text-foreground break-all">
                    {order.customer.email || "N/A"}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">
                    Delivery Address
                  </p>
                  <p className="font-semibold text-foreground leading-relaxed">
                    {order.customer.deliveryAddress ||
                      order.customer.address ||
                      "N/A"}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="card-theme overflow-hidden border border-emerald-200/70 p-0">
              <div className="bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(15,23,42,0.04))] px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      Delivery Proof
                    </p>
                    <h3 className="mt-1 font-semibold text-foreground">
                      Customer confirmation
                    </h3>
                  </div>
                </div>
              </div>

              <div className="space-y-4 px-6 py-5">
                {shipment?.deliveryProof ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Delivery was confirmed on{" "}
                      <span className="font-medium text-foreground">
                        {formatDate(shipment?.deliveryProof?.confirmedAt)}
                      </span>
                      .
                    </p>
                    <button
                      type="button"
                      onClick={() => setProofModalOpen(true)}
                      className="inline-flex w-full items-center justify-center rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
                    >
                      View delivery proof
                    </button>
                  </>
                ) : canConfirmDelivery ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Once the courier shares the delivery PIN, complete the
                      proof form to confirm you received the parcel.
                    </p>
                    <button
                      type="button"
                      onClick={() => setProofModalOpen(true)}
                      className="inline-flex w-full items-center justify-center rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
                    >
                      Open delivery confirmation
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Delivery confirmation will appear here when the shipment is
                    out for delivery.
                  </p>
                )}
              </div>
            </Card>

            <Card>
              {canLeaveReview && displayItems.length > 0 && (
                <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold uppercase tracking-[0.18em] text-amber-700 shadow-md">
                      Review This Product
                    </h3>
                    <p className="text-sm mt-2 text-muted-foreground">
                      Write a review for delivered products
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {displayItems.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() =>
                          openReviewModal(item.productId, item.name)
                        }
                        className="inline-flex w-full items-center justify-center rounded-full bg-amber-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-700"
                      >
                        Review {item.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <Card>
              {canLeaveReview && items.length > 0 && (
                <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold uppercase tracking-[0.18em] text-red-700 shadow-md">
                      Refund
                    </h3>
                    <p className="text-sm mt-2 text-muted-foreground">
                      Request a refund for any product in this order within 7
                      days after delivery.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {items.map((item) =>
                      (() => {
                        const refundedQuantity = getRefundedQuantity(
                          Number(item.id),
                        );
                        const remainingQuantity = Math.max(
                          item.quantity - refundedQuantity,
                          0,
                        );

                        if (!canRequestRefund) {
                          return (
                            <div
                              key={item.id}
                              className="inline-flex w-full items-center justify-center rounded-full border border-border bg-muted px-5 py-3 text-sm font-semibold text-muted-foreground"
                            >
                              Refund window closed for {item.name}
                            </div>
                          );
                        }

                        if (remainingQuantity <= 0) {
                          return (
                            <div
                              key={item.id}
                              className="inline-flex w-full items-center justify-center rounded-full border border-border bg-muted px-5 py-3 text-sm font-semibold text-muted-foreground"
                            >
                              {item.name} already refunded
                            </div>
                          );
                        }

                        return (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => openRefundModal(item)}
                            className="inline-flex w-full items-center justify-center rounded-full bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700"
                          >
                            Refund {item.name}
                          </button>
                        );
                      })(),
                    )}
                  </div>
                </div>
              )}
            </Card>

            <Card className="bg-accent text-accent-foreground border border-border p-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-background rounded-2xl flex items-center justify-center mx-auto mb-4 border border-border">
                  <ShieldCheck className="w-8 h-8 text-primary" />
                </div>

                <h4 className="font-bold mb-2">Order Status & Payment</h4>

                <p className="text-sm opacity-80 mb-4">
                  Current Status: <strong>{statusCfg.label}</strong>
                  <br />
                  Payment: <strong>{paymentCfg.label}</strong> (
                  {order.paymentMethod})
                </p>

                <div className="bg-card text-card-foreground rounded-lg p-3 border border-border">
                  <p className="text-xs opacity-80 font-mono">
                    TRACKING ID: {order.invoiceId}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {proofModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setProofModalOpen(false)}
        >
          <div
            className="w-full max-w-4xl rounded-3xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setProofModalOpen(false)}
                className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[80vh] overflow-y-auto">
              {proofToken ? (
                <div className="space-y-6">
                  <DeliveryConfirmationForm token={proofToken} />
                </div>
              ) : (
                <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                  Delivery confirmation link is unavailable for this shipment.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {reviewModalOpen && reviewProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeReviewModal}
        >
          <div
            className="w-full max-w-5xl rounded-3xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  Review New Product
                </p>
                <h3 className="mt-1 text-lg font-semibold text-foreground">
                  {reviewProduct.name}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Submit your rating and review without leaving this page.
                </p>
              </div>

              <button
                type="button"
                onClick={closeReviewModal}
                className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 max-h-[80vh] overflow-y-auto rounded-2xl border border-border bg-background p-4">
              <ProductReviews productId={reviewProduct.productId} />
            </div>
          </div>
        </div>
      )}

      {refundModalOpen && refundItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeRefundModal}
        >
          <div
            className="w-full max-w-3xl rounded-3xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
                  Refund Request
                </p>
                <h3 className="mt-1 text-lg font-semibold text-foreground">
                  {refundItem.name}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Refunds are allowed only within 7 days after delivery.
                  {refundDeadline ? (
                    <> Deadline: {formatDate(refundDeadline.toISOString())}</>
                  ) : null}
                </p>
              </div>

              <button
                type="button"
                onClick={closeRefundModal}
                className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 max-h-[80vh] overflow-y-auto rounded-2xl border border-border bg-background p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Refund details
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                    <p>
                      Quantity ordered:{" "}
                      <span className="font-semibold text-foreground">
                        {refundItem.quantity}
                      </span>
                    </p>
                    <p>
                      Refundable quantity:{" "}
                      <span className="font-semibold text-foreground">
                        {Math.max(
                          refundItem.quantity -
                            getRefundedQuantity(refundItem.orderItemId),
                          0,
                        )}
                      </span>
                    </p>
                    <p>
                      Status:{" "}
                      <span className="font-semibold text-foreground">
                        {canRequestRefund ? "Eligible" : "Refund window closed"}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="refund-quantity"
                      className="text-sm font-medium text-foreground"
                    >
                      Quantity
                    </label>
                    <Input
                      id="refund-quantity"
                      type="number"
                      min={1}
                      max={Math.max(
                        refundItem.quantity -
                          getRefundedQuantity(refundItem.orderItemId),
                        1,
                      )}
                      value={refundQuantity}
                      onChange={(e) =>
                        setRefundQuantity(Number(e.target.value || 1))
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <label
                  htmlFor="refund-reason"
                  className="text-sm font-medium text-foreground"
                >
                  Reason
                </label>
                <Textarea
                  id="refund-reason"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Tell us why you need a refund..."
                  className="min-h-[140px]"
                />
              </div>

              {refundError ? (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {refundError}
                </div>
              ) : null}

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeRefundModal}
                  className="inline-flex items-center justify-center rounded-full border border-border px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={refundSubmitting || !canRequestRefund}
                  onClick={submitRefundRequest}
                  className="inline-flex items-center justify-center rounded-full bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {refundSubmitting ? "Submitting..." : "Submit Refund"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
