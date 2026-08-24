"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useCart } from "@/components/ecommarce/CartContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LabeledInput } from "@/components/ui/labeled-input";
import { toast } from "sonner";
import {
  Check,
  ArrowLeft,
  Truck,
  Shield,
  BookOpen,
  Plus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import {
  ALLOWED_SHIPPING_AREAS,
  normalizeShippingArea,
  type AllowedShippingArea,
} from "@/lib/shipping-areas";
import PaymentMethodSelector from "@/components/checkout/PaymentMethodSelector";
import {
  PC_BUILDER_EXTRA_ITEMS_STORAGE_KEY,
  PC_BUILDER_STORAGE_KEY,
} from "@/lib/pc-builder";

function clearCompletedPcBuilderDraft() {
  try {
    localStorage.removeItem(PC_BUILDER_STORAGE_KEY);
    localStorage.removeItem(PC_BUILDER_EXTRA_ITEMS_STORAGE_KEY);
  } catch {
    // Checkout remains successful when browser storage is unavailable.
  }
}

type UserAddress = {
  id: number;
  label: string;
  country: string;
  district: string;
  area: string;
  details?: string | string[] | null;
  isDefault: boolean;
};

type ShippingQuote = {
  shippingCost: number;
  subtotal: number;
  total: number;
  matchedRate: {
    id: number;
    country: string;
    area: string;
    baseCost: number;
    freeMinOrder: number | null;
    priority: number;
  } | null;
  reason: string;
};

type ShippingRateOption = {
  id: number;
  country: string;
  district?: string | null;
  area: string;
  baseCost: number;
  freeMinOrder: number | null;
  isActive: boolean;
  priority: number;
};

type TaxQuote = {
  countryCode: string;
  totalVAT: number;
  totalTaxCharge: number;
  totalInclusiveVAT: number;
  totalExclusiveVAT: number;
  breakdown: Array<{
    vatClassId: number;
    className: string;
    classCode: string;
    rate: number;
    inclusive: boolean;
    countryCode: string;
    regionCode?: string | null;
    taxableAmount: number;
    vatAmount: number;
    taxCharge: number;
  }>;
};

export default function CheckoutPage() {
  const { cartItems, clearCart } = useCart();
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  const [isMounted, setIsMounted] = useState(false);
  const [step, setStep] = useState<"details" | "payment" | "confirm">("details");

  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("Bangladesh");
  const [location, setLocation] = useState(""); // district
  const [area, setArea] = useState<AllowedShippingArea>(ALLOWED_SHIPPING_AREAS[0]);
  const [deliveryAddress, setDeliveryAddress] = useState(""); // address details

  const [paymentMethod, setPaymentMethod] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");

  const [placedOrder, setPlacedOrder] = useState<any>(null);
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const [prefilled, setPrefilled] = useState(false);
  const [paymentGateways, setPaymentGateways] = useState<any[]>([]);
  const [userAddresses, setUserAddresses] = useState<UserAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | "">("");
  const [showAddAddressForm, setShowAddAddressForm] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [newAddressLabel, setNewAddressLabel] = useState("Home");
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [availableAreas, setAvailableAreas] = useState<string[]>([]);
  const [shippingRates, setShippingRates] = useState<ShippingRateOption[]>([]);
  const [loadingAreas, setLoadingAreas] = useState(false);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingQuote, setShippingQuote] = useState<ShippingQuote | null>(null);
  const [taxQuote, setTaxQuote] = useState<TaxQuote | null>(null);

  // Coupon states
  const [couponCode, setCouponCode] = useState("");
  const [discountAmount, setDiscountAmount] = useState(0);
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  const isAuthenticated = !!session;

  // Server cart
  const [serverCartItems, setServerCartItems] = useState<any[] | null>(null);
  const [loadingServerCart, setLoadingServerCart] = useState(false);
  const [cartSynced, setCartSynced] = useState(false);
  // `cartSynced` is state, so it does not commit before the async sync re-enters.
  // This ref blocks the duplicate run (StrictMode / cartItems change) that would
  // otherwise POST the same items twice.
  const syncInFlightRef = useRef(false);

  // Screenshot upload
  const [paymentScreenshotPreview, setPaymentScreenshotPreview] = useState<string | null>(null);
  const [paymentScreenshotUrl, setPaymentScreenshotUrl] = useState<string | null>(null);
  const [isUploadingScreenshot, setIsUploadingScreenshot] = useState(false);

  useEffect(() => setIsMounted(true), []);

  useEffect(() => {
    return () => {
      setCartSynced(false);
    };
  }, []);

  useEffect(() => {
    const fetchGateways = async () => {
      try {
        const res = await fetch("/api/payment-gateways", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setPaymentGateways(Array.isArray(data.gateways) ? data.gateways : []);
      } catch {}
    };
    fetchGateways();
  }, []);

  useEffect(() => {
    setCartSynced(false);
  }, [isAuthenticated]);

  // Guests must sign in first; keep the guest cart so it can be synced on return.
  useEffect(() => {
    if (!isMounted || sessionStatus !== "unauthenticated") return;

    try {
      sessionStorage.setItem("pendingCheckout", JSON.stringify(cartItems));
      sessionStorage.setItem("redirectAfterLogin", "/ecommerce/checkout");
    } catch {}

    router.replace(
      `/signin?callbackUrl=${encodeURIComponent("/ecommerce/checkout")}`,
    );
  }, [isMounted, sessionStatus, cartItems, router]);

  useEffect(() => {
    if (!isMounted || cartSynced || syncInFlightRef.current) return;

    if (!isAuthenticated) {
      setServerCartItems(null);
      return;
    }

    syncInFlightRef.current = true;

    const fetchServerCart = async () => {
      try {
        setLoadingServerCart(true);
        const res = await fetch("/api/cart", { cache: "no-store" });
        if (!res.ok) {
          console.error("Failed to load server cart:", res.status);
          setServerCartItems([]);
          return;
        }

        const data = await res.json();
        const items = Array.isArray(data.items) ? data.items : [];

        const mapped = items.map((item: any) => ({
          id: item.id,
          productId: item.productId,
          variantId: item.variantId ?? item.variant?.id ?? null,
          name: item.product?.name ?? "Unknown product",
          price: Number(item.variant?.price ?? item.product?.basePrice ?? item.product?.variants?.[0]?.price ?? 0),
          image: item.product?.image ?? "/placeholder.svg",
          quantity: Number(item.quantity ?? 1),
          variantLabel:
            item.variant?.options && typeof item.variant.options === "object"
              ? Object.entries(item.variant.options)
                  .map(([key, value]) => `${key}: ${String(value)}`)
                  .join(", ")
              : item.variant?.sku ?? null,
          product: item.product, // Include full product data for VAT calculation
        }));

        setServerCartItems(mapped);
      } catch (err) {
        console.error("Error loading server cart:", err);
      } finally {
        setLoadingServerCart(false);
      }
    };

    const syncGuestCartToServer = async () => {
      if (cartItems.length === 0) {
        await fetchServerCart();
        syncInFlightRef.current = false;
        setCartSynced(true);
        return;
      }

      try {
        setLoadingServerCart(true);

        const serverRes = await fetch("/api/cart", { cache: "no-store" });
        let allSynced = false;

        if (serverRes.ok) {
          const serverData = await serverRes.json();
          const existingItems = Array.isArray(serverData.items) ? serverData.items : [];

          const existingKeys = new Set(
            existingItems.map(
              (item: any) => `${item.productId}:${item.variantId ?? ""}`,
            ),
          );

          const itemsToSync = cartItems.filter(
            (item) => !existingKeys.has(`${item.productId}:${item.variantId ?? ""}`),
          );

          const failed: Array<string | number> = [];

          for (const item of itemsToSync) {
            const res = await fetch("/api/cart", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                productId: item.productId,
                variantId: item.variantId ?? null,
                quantity: item.quantity,
              }),
            });

            if (!res.ok) {
              const detail = await res.text().catch(() => "");
              console.error(
                "Failed to sync cart item:",
                item.productId,
                res.status,
                detail,
              );
              failed.push(item.productId);
            }
          }

          allSynced = failed.length === 0;

          if (!allSynced) {
            toast.error(
              "Some items could not be moved to your account cart. They are still in your cart — please try again.",
            );
          }
        } else {
          console.error("Failed to load server cart:", serverRes.status);
        }

        // Load the server cart BEFORE clearing the local one, so there is never a
        // frame where both are empty and the Order Summary renders with no items.
        // The local cart is only dropped once every item is safely on the server.
        await fetchServerCart();
        if (allSynced) clearCart();
      } catch (err) {
        console.error("Error syncing guest cart to server:", err);
        await fetchServerCart();
      } finally {
        syncInFlightRef.current = false;
        setLoadingServerCart(false);
        setCartSynced(true);
      }
    };

    syncGuestCartToServer();
  }, [isAuthenticated, isMounted, cartItems, clearCart, cartSynced]);

  const parseAddressDetails = (details: UserAddress["details"]) => {
    if (Array.isArray(details)) return details.filter(Boolean).join(", ");
    if (typeof details === "string") {
      try {
        const parsed = JSON.parse(details);
        if (Array.isArray(parsed)) return parsed.filter(Boolean).join(", ");
      } catch {
        return details;
      }
    }
    return "";
  };

  const normalizeCountryCode = (value: string) => {
    const v = String(value || "").trim();
    if (!v) return "BD";
    if (v.length === 2) return v.toUpperCase();
    const key = v.toLowerCase();
    if (key === "bangladesh") return "BD";
    if (key === "india") return "IN";
    if (key === "pakistan") return "PK";
    return v.slice(0, 2).toUpperCase();
  };

  const fetchUserAddresses = async () => {
    try {
      setLoadingAddresses(true);
      const addressRes = await fetch("/api/user/address", { cache: "no-store" });
      if (!addressRes.ok) return [];
      const addressData = await addressRes.json();
      const addresses: UserAddress[] = Array.isArray(addressData?.addresses) ? addressData.addresses : [];
      setUserAddresses(addresses);
      return addresses;
    } catch {
      return [];
    } finally {
      setLoadingAddresses(false);
    }
  };

  const getShippingRateInfo = (areaOption: string) => {
    const rate = shippingRates.find(
      (r) => normalizeShippingArea(String(r.area || "")) === areaOption
    );
    return rate;
  };

  const fetchAreaOptions = async (countryInput: string) => {
    if (!countryInput.trim()) {
      setAvailableAreas([]);
      setShippingRates([]);
      return;
    }
    try {
      setLoadingAreas(true);
      const countryCode = normalizeCountryCode(countryInput);
      const res = await fetch(
        `/api/shipping/rates?country=${encodeURIComponent(countryCode)}&isActive=true`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        setAvailableAreas([]);
        setShippingRates([]);
        return;
      }
      const rates: ShippingRateOption[] = await res.json();
      setShippingRates(rates);

      const normalizedAreas = (Array.isArray(rates) ? rates : [])
        .map((r) => normalizeShippingArea(String(r.area || "")))
        .filter((x): x is (typeof ALLOWED_SHIPPING_AREAS)[number] => Boolean(x));

      const uniqueAreas = ALLOWED_SHIPPING_AREAS.filter((allowed) => normalizedAreas.includes(allowed));
      setAvailableAreas(uniqueAreas);
    } catch {
      setAvailableAreas([]);
      setShippingRates([]);
    } finally {
      setLoadingAreas(false);
    }
  };

  useEffect(() => {
    if (!session || prefilled || !(session.user as any)?.id) return;

    const loadUserData = async () => {
      try {
        const userRes = await fetch("/api/user/profile", { cache: "no-store" });

        if (userRes.ok) {
          const current = await userRes.json();
          setName(current?.name || "");
          setMobile(current?.phone || "");
          setEmail(current?.email || "");
        }

        const addresses = await fetchUserAddresses();
        const selected = addresses.find((a) => a.isDefault) || addresses[0] || null;

        if (selected) {
          setSelectedAddressId(selected.id);
          setCountry(selected.country || "Bangladesh");
          setLocation(selected.district || "");
          setArea(normalizeShippingArea(selected.area || "") || ALLOWED_SHIPPING_AREAS[0]);
          setDeliveryAddress(parseAddressDetails(selected.details));
        }
      } catch {
      } finally {
        setPrefilled(true);
      }
    };

    loadUserData();
  }, [session, prefilled]);

  useEffect(() => {
    fetchAreaOptions(country);
  }, [country]);

  useEffect(() => {
    if (availableAreas.length > 0 && !availableAreas.includes(area)) {
      setArea(availableAreas[0] as AllowedShippingArea);
    }
  }, [availableAreas, area]);

  // For a signed-in user the server cart is the source of truth. Falling back to the
  // local cart once it has been cleared is what made the summary render empty.
  const itemsToRender = isAuthenticated
    ? serverCartItems ?? cartItems
    : cartItems;

  const subtotal = itemsToRender.reduce(
    (total, item) => total + Number(item.price) * Number(item.quantity),
    0
  );
  const hasShippingQuote = shippingQuote !== null;
  const shipping = hasShippingQuote ? Number(shippingQuote.shippingCost) : 0;
  const vat = taxQuote ? Number(taxQuote.totalVAT || 0) : 0;
  const taxCharge = taxQuote ? Number(taxQuote.totalTaxCharge || 0) : 0;
  const total = subtotal + shipping + taxCharge - discountAmount;

  useEffect(() => {
    if (!selectedAddressId) return;
    const selected = userAddresses.find((a) => a.id === Number(selectedAddressId));
    if (!selected) return;

    setCountry(selected.country || "Bangladesh");
    setLocation(selected.district || "");
    setArea(normalizeShippingArea(selected.area || "") || ALLOWED_SHIPPING_AREAS[0]);
    setDeliveryAddress(parseAddressDetails(selected.details));
  }, [selectedAddressId, userAddresses]);

  useEffect(() => {
    const fetchShippingQuote = async () => {
      if (!country.trim() || !location.trim() || !area.trim()) {
        setShippingQuote(null);
        return;
      }

      try {
        setShippingLoading(true);
        const res = await fetch("/api/shipping/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            country,
            district: location,
            area,
            subtotal,
          }),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setShippingQuote(null);
          return;
        }

        setShippingQuote(data);
      } catch {
        setShippingQuote(null);
      } finally {
        setShippingLoading(false);
      }
    };

    fetchShippingQuote();
  }, [country, location, area, subtotal]);

  useEffect(() => {
    const fetchTaxQuote = async () => {
      if (!country.trim() || itemsToRender.length === 0) {
        setTaxQuote(null);
        return;
      }

      try {
        const res = await fetch("/api/tax/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            country,
            district: location,
            items: itemsToRender.map((item) => ({
              productId: item.productId ?? item.id,
              variantId: item.variantId ?? null,
              quantity: item.quantity,
            })),
          }),
        });

        if (!res.ok) {
          setTaxQuote(null);
          return;
        }

        const data = await res.json();
        setTaxQuote(data);
      } catch {
        setTaxQuote(null);
      }
    };

    void fetchTaxQuote();
  }, [country, location, itemsToRender]);

  const handleScreenshotChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPaymentScreenshotPreview(URL.createObjectURL(file));

    try {
      setIsUploadingScreenshot(true);

      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) throw new Error("File size should be less than 5MB");
      if (!file.type.startsWith("image/")) throw new Error("Please upload a valid image file");

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/upload/paymentScreenshot`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Failed to upload screenshot");
      }

      const data = await res.json();
      const uploadedUrl =
        (typeof data === "string" && data) ||
        data?.url ||
        data?.fileUrl ||
        data?.path ||
        data?.location ||
        null;

      if (!uploadedUrl) throw new Error("Upload response missing URL");
      setPaymentScreenshotUrl(uploadedUrl);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to upload screenshot");
      setPaymentScreenshotUrl(null);
    } finally {
      setIsUploadingScreenshot(false);
    }
  };

  const applyCoupon = async () => {
    if (!couponCode.trim()) {
      toast.error("Enter a coupon code.");
      return;
    }

    try {
      setValidatingCoupon(true);
      const response = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: couponCode.trim(),
          subtotal,
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Failed to apply coupon.");

      if (data.success) {
        setDiscountAmount(data.coupon.discountAmount);
        setAppliedCoupon(data.coupon);
        toast.success("Coupon applied!");
        setCouponCode("");
      }
    } catch (error) {
      console.error("Coupon application error:", error);
      toast.error(
        error instanceof Error ? error.message : "Invalid coupon code."
      );
      setDiscountAmount(0);
      setAppliedCoupon(null);
    } finally {
      setValidatingCoupon(false);
    }
  };

  const removeCoupon = () => {
    setDiscountAmount(0);
    setAppliedCoupon(null);
    setCouponCode("");
    toast.info("Coupon removed.");
  };

  const getPaymentStatusFromMethod = (method: string) => {
    if (!method) return "Unknown";
    return method === "CashOnDelivery" ? "Unpaid" : "Paid";
  };

  const handleGoToPaymentStep = () => {
    if (!country.trim() || !location.trim() || !area.trim() || !deliveryAddress.trim()) {
      toast.error("Please fill in country, district, area and full address");
      return;
    }
    const safeArea = normalizeShippingArea(area);
    if (!safeArea) {
      toast.error("Please select a valid area");
      return;
    }
    setStep("payment");
  };

  const handleSaveAddress = async () => {
    if (!isAuthenticated) {
      toast.error("Please login to save address");
      return;
    }
    if (!newAddressLabel.trim() || !country.trim() || !location.trim() || !area.trim() || !deliveryAddress.trim()) {
      toast.error("Please fill label, country, district, area and address details");
      return;
    }
    const safeArea = normalizeShippingArea(area);
    if (!safeArea) {
      toast.error("Please select a valid area");
      return;
    }

    try {
      setSavingAddress(true);
      const res = await fetch("/api/user/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newAddressLabel.trim(),
          country: country.trim(),
          district: location.trim(),
          area: safeArea,
          details: [deliveryAddress.trim()],
          isDefault: userAddresses.length === 0,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || "Failed to save address");
        return;
      }

      const addresses = await fetchUserAddresses();
      const createdId = data?.address?.id;
      if (createdId) {
        setSelectedAddressId(createdId);
      } else if (addresses.length > 0) {
        setSelectedAddressId(addresses[0].id);
      }

      setShowAddAddressForm(false);
      toast.success("Address saved");
    } catch {
      toast.error("Failed to save address");
    } finally {
      setSavingAddress(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (itemsToRender.length === 0) {
      toast.error("Your cart is empty");
      return;
    }

    const isCOD = paymentMethod === "CashOnDelivery";
    const isSSLCOMMERZ = paymentMethod.startsWith("SSLCOMMERZ:");
    const isManualPayment = !isCOD && !isSSLCOMMERZ;

    if (
      !name ||
      !mobile ||
      !country ||
      !location ||
      !area ||
      !deliveryAddress ||
      (isManualPayment && !transactionId)
    ) {
      toast.error("Please fill in all required information");
      return;
    }

    if (isManualPayment && (!paymentScreenshotUrl || isUploadingScreenshot)) {
      if (isUploadingScreenshot) toast.error("Please wait until screenshot upload is complete");
      else toast.error("Payment screenshot is required");
      return;
    }

    const computedPaymentStatus = "UNPAID";
    const localInvoiceId =
      globalThis.crypto?.randomUUID?.() ??
      `inv-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const uiOrderData = {
      invoiceId: localInvoiceId,
      customer: {
        name,
        mobile,
        email,
        address: `${area}, ${location}, ${country}`,
        deliveryAddress: deliveryAddress,
      },
      itemsToRender,
      paymentMethod,
      transactionId: isManualPayment ? transactionId : null,
      total,
      createdAt: new Date().toISOString(),
      paymentStatus: computedPaymentStatus,
    };

    const items = itemsToRender.map((item) => ({
      productId: item.productId ?? item.id,
      variantId: item.variantId ?? null,
      quantity: item.quantity,
    }));

    const payload = {
      name,
      email: email || null,
      phone_number: mobile,
      alt_phone_number: null,
      country: country || "Bangladesh",
      district: location || "N/A",
      area: area || "N/A",
      address_details: deliveryAddress || "N/A",
      payment_method: paymentMethod,
      items,
      transactionId: isManualPayment ? transactionId : null,
      paymentStatus: computedPaymentStatus,
      image: isManualPayment ? (paymentScreenshotUrl || null) : null,
      couponId: appliedCoupon?.id || null,
      couponCode: appliedCoupon?.code || null,
    };

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || "Problem placing order, please try again later");
        return;
      }

      const createdOrder = await res.json();
      setPlacedOrder({ ...uiOrderData, orderId: createdOrder.id });

      if (isSSLCOMMERZ) {
        const gatewayId = Number(paymentMethod.split(":")[1]);
        const initRes = await fetch("/api/sslcommerz/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: createdOrder.id,
            gatewayId,
            paymentInitToken: createdOrder.paymentInitToken || null,
          }),
        });

        const initData = await initRes.json().catch(() => null);
        if (!initRes.ok || !initData?.redirectUrl) {
          toast.error(initData?.error || "Failed to start SSLCommerz payment");
          return;
        }

        window.location.href = String(initData.redirectUrl);
        return;
      }

      setInvoiceId(localInvoiceId);
      setStep("confirm");
      toast.success("Order created, please confirm now");
    } catch (err) {
      console.error(err);
      toast.error("Problem placing order");
    }
  };

  const handleConfirmOrder = async () => {
    if (email) {
      try {
        await fetch("/api/newsletter/subscribers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
      } catch {}
    }

    // Clear both client and server cart after order confirmation
    clearCompletedPcBuilderDraft();
    clearCart();
    
    try {
      if ((session as any)?.user) {
        await fetch("/api/cart", { method: "DELETE" });
        window.dispatchEvent(new Event("serverCartCleared"));
      }
    } catch {}

    setOrderConfirmed(true);
    setShowModal(true);
    toast.success("Order completed successfully!");
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 sm:gap-4 mb-6 sm:mb-8 overflow-x-auto pb-2">
      {["details", "payment", "confirm"].map((s, i) => {
        const currentIndex = ["details", "payment", "confirm"].indexOf(step);
        const completed = i < currentIndex || (s === "confirm" && orderConfirmed);
        const active = step === s;

        return (
          <div key={s} className="flex items-center gap-1 sm:gap-2 min-w-fit">
            <div
              className={[
                "flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 rounded-full border-2 transition-all duration-300",
                active
                  ? "bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : completed
                    ? "bg-primary/80 border-primary/80 text-primary-foreground"
                    : "border-border text-foreground/70",
              ].join(" ")}
            >
              {active ? (
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-primary-foreground rounded-full" />
              ) : completed ? (
                <Check className="w-3 h-3 sm:w-4 sm:h-5" />
              ) : (
                <span className="text-xs sm:text-sm font-medium">{i + 1}</span>
              )}
            </div>

            <span
              className={[
                "text-xs sm:text-sm font-medium capitalize transition-colors duration-300 hidden lg:block",
                active ? "text-foreground" : "text-foreground/70",
              ].join(" ")}
            >
              {s === "details" ? "Personal Details" : s === "payment" ? "Payment" : "Confirmation"}
            </span>

            {i < 2 && (
              <div
                className={[
                  "w-4 sm:w-6 lg:w-12 h-0.5 ml-0.5 sm:ml-1 lg:ml-3",
                  i < currentIndex ? "bg-primary/80" : "bg-border",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  if (
    !isMounted ||
    sessionStatus === "loading" ||
    sessionStatus === "unauthenticated" ||
    (isAuthenticated && (loadingServerCart || !cartSynced))
  ) {
    return (
      <div className="min-h-screen bg-background py-6 sm:py-8 lg:py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto grid lg:grid-cols-3 gap-6 lg:gap-8 animate-pulse">
            <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 space-y-4">
              <div className="h-8 w-48 bg-muted rounded" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="h-11 bg-muted rounded" />
                <div className="h-11 bg-muted rounded" />
                <div className="h-11 bg-muted rounded sm:col-span-2" />
                <div className="h-11 bg-muted rounded" />
                <div className="h-11 bg-muted rounded" />
                <div className="h-11 bg-muted rounded sm:col-span-2" />
                <div className="h-24 bg-muted rounded sm:col-span-2" />
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
              <div className="h-6 w-36 bg-muted rounded" />
              <div className="h-16 bg-muted rounded" />
              <div className="h-16 bg-muted rounded" />
              <div className="h-16 bg-muted rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-6 sm:py-8 lg:py-12">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="flex items-center justify-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary rounded-full flex items-center justify-center">
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground">
              Checkout
            </h1>
          </div>
          <p className="text-sm sm:text-base lg:text-lg text-muted-foreground max-w-2xl mx-auto px-4">
            Follow the steps below to complete your order.
          </p>
        </div>

        <div className="max-w-6xl mx-auto grid lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Left Column */}
          <div className="lg:col-span-2">
            <div className="bg-card text-card-foreground rounded-xl sm:rounded-2xl shadow-lg border border-border p-4 sm:p-6 lg:p-8">
              {renderStepIndicator()}

              {/* Step 1 */}
              {step === "details" && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-2 h-8 bg-primary rounded-full"></div>
                    <h2 className="text-2xl font-bold text-foreground">Personal Details</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <LabeledInput
                      id="name"
                      label="Full Name *"
                      placeholder="Enter your name"
                      value={name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                      className="bg-background border-border text-foreground placeholder:text-muted-foreground"
                    />

                    <LabeledInput
                      id="mobile"
                      label="Mobile *"
                      placeholder="01XXXXXXXXX"
                      value={mobile}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMobile(e.target.value)}
                      className="bg-background border-border text-foreground placeholder:text-muted-foreground"
                    />

                    <LabeledInput
                      id="email"
                      label="Email (Optional)"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                      className="bg-background border-border text-foreground placeholder:text-muted-foreground sm:col-span-2"
                    />

                    {isAuthenticated && (
                      <div className="space-y-2 sm:col-span-2">
                        <div className="flex items-center justify-between">
                          <label htmlFor="savedAddress" className="text-sm font-medium text-foreground">
                            Saved Address
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowAddAddressForm((p) => !p)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            {showAddAddressForm ? (
                              <X className="h-3.5 w-3.5" />
                            ) : (
                              <Plus className="h-3.5 w-3.5" />
                            )}
                            {showAddAddressForm ? "Close" : "Add New Address"}
                          </button>
                        </div>

                        <select
                          id="savedAddress"
                          value={selectedAddressId}
                          onChange={(e) => setSelectedAddressId(e.target.value ? Number(e.target.value) : "")}
                          className="w-full h-11 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          <option value="">
                            {loadingAddresses ? "Loading addresses..." : "Select a saved address (optional)"}
                          </option>
                          {userAddresses.map((addr) => (
                            <option key={addr.id} value={addr.id}>
                              {addr.label} - {addr.area}, {addr.district}, {addr.country}
                            </option>
                          ))}
                        </select>

                        {showAddAddressForm && (
                          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-3">
                            <LabeledInput
                              id="addressLabel"
                              label="Address Label *"
                              placeholder="Home / Office"
                              value={newAddressLabel}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAddressLabel(e.target.value)}
                              className="bg-background border-border text-foreground placeholder:text-muted-foreground"
                            />
                            <Button
                              type="button"
                              onClick={handleSaveAddress}
                              disabled={savingAddress}
                              className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground"
                            >
                              {savingAddress ? "Saving..." : "Save Current Address"}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    <LabeledInput
                      id="country"
                      label="Country *"
                      placeholder="Bangladesh"
                      value={country}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCountry(e.target.value)}
                      className="bg-background border-border text-foreground placeholder:text-muted-foreground"
                    />

                    <LabeledInput
                      id="location"
                      label="District *"
                      placeholder="Dhaka"
                      value={location}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocation(e.target.value)}
                      className="bg-background border-border text-foreground placeholder:text-muted-foreground"
                    />

                    <div className="space-y-2 sm:col-span-2">
                      <label htmlFor="area" className="text-sm font-medium text-foreground">
                        Area *
                      </label>
                      <select
                        id="area"
                        value={area}
                        onChange={(e) => setArea(e.target.value as AllowedShippingArea)}
                        className="w-full h-11 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="">{loadingAreas ? "Loading areas..." : "Select area"}</option>
                        {availableAreas.map((areaOption) => {
                          const rate = getShippingRateInfo(areaOption);
                          const shippingCost = rate?.baseCost ? `৳${rate.baseCost}` : "Standard rate";
                          const freeShippingInfo = rate?.freeMinOrder ? ` (Free over ৳${rate.freeMinOrder})` : "";
                          return (
                            <option key={areaOption} value={areaOption}>
                              {areaOption} - {shippingCost}
                              {freeShippingInfo}
                            </option>
                          );
                        })}
                      </select>

                      {availableAreas.length === 0 && !loadingAreas && (
                        <p className="text-xs text-muted-foreground">
                          No shipping area available for this country.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <label htmlFor="deliveryAddress" className="text-sm font-medium text-foreground">
                        Address Details *
                      </label>
                      <textarea
                        id="deliveryAddress"
                        className="w-full h-24 sm:h-32 p-3 sm:p-4 border border-border rounded-lg sm:rounded-xl bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="House, road, landmark"
                        value={deliveryAddress}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDeliveryAddress(e.target.value)}
                      />
                    </div>
                  </div>

                  <Button
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-2 sm:py-3 text-base sm:text-lg font-semibold rounded-lg sm:rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
                    onClick={handleGoToPaymentStep}
                  >
                    Next Step
                  </Button>
                </div>
              )}

              {/* Step 2 */}
              {step === "payment" && (
                <PaymentMethodSelector
                  paymentGateways={paymentGateways}
                  selectedMethod={paymentMethod}
                  onMethodChange={setPaymentMethod}
                  transactionId={transactionId}
                  onTransactionIdChange={setTransactionId}
                  paymentScreenshotUrl={paymentScreenshotUrl}
                  paymentScreenshotPreview={paymentScreenshotPreview}
                  onScreenshotChange={handleScreenshotChange}
                  isUploadingScreenshot={isUploadingScreenshot}
                  onBack={() => setStep("details")}
                  onNext={handlePlaceOrder}
                  total={total}
                />
              )}

              {/* Step 3 */}
              {step === "confirm" && placedOrder && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="w-2 h-6 sm:h-8 bg-primary rounded-full"></div>
                      <h2 className="text-xl sm:text-2xl font-bold text-foreground">Confirm Order</h2>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => setStep("payment")}
                      className="text-foreground/70 hover:text-foreground hover:bg-muted"
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back
                    </Button>
                  </div>

                  <div className="bg-muted border border-border rounded-lg sm:rounded-xl p-4 sm:p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-primary/80 rounded-full flex items-center justify-center">
                        <Check className="w-5 h-5 text-primary-foreground" />
                      </div>
                      <h3 className="font-semibold text-foreground">Order created successfully!</h3>
                    </div>
                    <p className="text-foreground">
                      Invoice ID: <strong>{invoiceId}</strong>
                    </p>
                    {placedOrder?.orderId && (
                      <p className="text-muted-foreground mt-1 text-sm">
                        Order ID (DB): <strong className="text-foreground">{placedOrder.orderId}</strong>
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div className="space-y-3">
                      <h4 className="font-semibold text-foreground">Customer</h4>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>
                          <span className="text-foreground/80">Name:</span>{" "}
                          <span className="text-foreground">{placedOrder.customer.name}</span>
                        </p>
                        <p>
                          <span className="text-foreground/80">Mobile:</span>{" "}
                          <span className="text-foreground">{placedOrder.customer.mobile}</span>
                        </p>
                        <p>
                          <span className="text-foreground/80">Email:</span>{" "}
                          <span className="text-foreground">{placedOrder.customer.email || "N/A"}</span>
                        </p>
                        <p>
                          <span className="text-foreground/80">Address:</span>{" "}
                          <span className="text-foreground">{placedOrder.customer.address}</span>
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-semibold text-foreground">Order</h4>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>
                          <span className="text-foreground/80">Payment:</span>{" "}
                          <span className="text-foreground">{placedOrder.paymentMethod}</span>
                        </p>
                        <p>
                          <span className="text-foreground/80">Status:</span>{" "}
                          <span className="text-foreground font-semibold">
                            {getPaymentStatusFromMethod(placedOrder.paymentMethod)}
                          </span>
                        </p>
                        {placedOrder.transactionId && (
                          <p>
                            <span className="text-foreground/80">Txn:</span>{" "}
                            <span className="text-foreground">{placedOrder.transactionId}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {(paymentScreenshotUrl || paymentScreenshotPreview) && (
                    <div>
                      <h4 className="font-semibold text-foreground mb-2">Payment Screenshot</h4>
                      <div className="relative w-40 h-40 border border-border rounded-xl overflow-hidden bg-background">
                        <Image
                          src={paymentScreenshotUrl || paymentScreenshotPreview!}
                          alt="Payment screenshot preview"
                          fill
                          className="object-cover"
                        />
                      </div>
                    </div>
                  )}

                  <Button
                    className="w-full bg-primary/80 hover:bg-primary text-primary-foreground py-2 sm:py-3 text-base sm:text-lg font-semibold rounded-lg sm:rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
                    onClick={handleConfirmOrder}
                    disabled={orderConfirmed}
                  >
                    {orderConfirmed ? "Order Completed" : "Complete Order"}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-1">
            <div className="bg-card text-card-foreground rounded-xl sm:rounded-2xl shadow-lg border border-border p-4 sm:p-6 lg:sticky lg:top-6">
              <h2 className="text-lg sm:text-xl font-bold text-foreground mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-border">
                Order Summary
              </h2>

              <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6 max-h-64 sm:max-h-96 overflow-y-auto">
                {itemsToRender.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted border border-border"
                  >
                    <div className="relative w-16 h-20 flex-shrink-0">
                      <Image
                        src={item.image || "/placeholder.svg"}
                        alt={item.name}
                        fill
                        className="rounded-lg object-cover"
                      />
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-primary text-primary-foreground rounded-full text-xs flex items-center justify-center">
                        {item.quantity}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground line-clamp-2 text-sm">
                        {item.name}
                      </p>
                      <p className="text-foreground font-semibold text-sm mt-1">
                        ৳{(Number(item.price) * Number(item.quantity)).toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2 border-t border-border pt-4">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="text-foreground">৳{subtotal.toFixed(2)}</span>
                </div>

                {/* Coupon Section */}
                <div className="space-y-2">
                  {appliedCoupon ? (
                    <div className="rounded-xl border border-border bg-muted/40 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm min-w-0">
                          <span className="font-semibold">
                            {appliedCoupon.code}
                          </span>
                          {appliedCoupon.discountType === "percentage" && (
                            <span className="ml-2 text-muted-foreground">
                              ({appliedCoupon.discountValue}%)
                            </span>
                          )}
                        </div>
                        <button
                          onClick={removeCoupon}
                          className="text-sm text-foreground hover:underline shrink-0"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Coupon applied successfully.
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <Input
                        placeholder="PROMO / COUPON Code"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                        className="rounded-xl"
                      />
                      <Button
                        onClick={applyCoupon}
                        disabled={validatingCoupon}
                        className="rounded-xl w-full"
                        variant="outline"
                      >
                        {validatingCoupon ? "Validating..." : "Apply Coupon"}
                      </Button>
                    </div>
                  )}
                </div>

                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Discount
                      {appliedCoupon?.discountType === "percentage"
                        ? ` (${appliedCoupon.discountValue}%)`
                        : ""}
                      :
                    </span>
                    <span className="font-semibold text-green-600">
                      -৳{discountAmount.toFixed(2)}
                    </span>
                  </div>
                )}

                {(shippingLoading || hasShippingQuote) && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Shipping</span>
                    <span className="text-foreground">
                      {shippingLoading ? "Calculating..." : shipping === 0 ? "FREE" : `৳${shipping.toFixed(2)}`}
                    </span>
                  </div>
                )}
                {taxQuote && taxQuote.breakdown.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-muted-foreground">
                      <span>VAT</span>
                      <span className="text-foreground">৳{vat.toFixed(2)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      {taxQuote.breakdown.map((breakdown) => (
                        <div key={breakdown.classCode} className="flex justify-between">
                          <span>
                            {breakdown.className} ({breakdown.rate}%)
                            {breakdown.inclusive ? " included" : " added"}:
                          </span>
                          <span>৳{breakdown.vatAmount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!shippingLoading && hasShippingQuote && shippingQuote?.matchedRate && (
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>
                      Applied Rate: {shippingQuote.matchedRate.country} / {shippingQuote.matchedRate.area}
                    </div>

                    {shippingQuote.matchedRate.freeMinOrder && shipping === 0 && (
                      <div className="text-green-600 dark:text-green-400 font-medium">
                        🎉 Free shipping applied (minimum order ৳{shippingQuote.matchedRate.freeMinOrder.toFixed(2)} met)
                      </div>
                    )}

                    {shippingQuote.matchedRate.freeMinOrder && shipping > 0 && (
                      <div className="text-muted-foreground">
                        Add ৳{(shippingQuote.matchedRate.freeMinOrder - subtotal).toFixed(2)} more for free shipping
                      </div>
                    )}
                  </div>
                )}

               

                <div className="flex justify-between font-bold text-base text-foreground border-t border-border pt-3">
                  <span>Total</span>
                  <span>৳{total.toFixed(2)}</span>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-border space-y-3">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Shield className="w-4 h-4 text-primary" />
                  <span>Secure payment</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Truck className="w-4 h-4 text-primary" />
                  <span>Delivery in 2-4 business days</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card text-card-foreground rounded-xl sm:rounded-2xl p-6 sm:p-8 max-w-md w-full text-center space-y-5 shadow-2xl border border-border">
            <div className="w-16 h-16 bg-primary/80 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-primary-foreground" />
            </div>

            <h2 className="text-2xl font-bold text-foreground">🎉 Order Successful!</h2>

            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed px-2">
              Your order has been placed successfully. Click below to track your order.
            </p>

            <div className="space-y-3">
              <Link href="/ecommerce/user/orders" className="block">
                <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3 rounded-xl">
                  Track Order
                </Button>
              </Link>

              <Link href="/ecommerce/products">
                <Button variant="outline" className="w-full border-border text-foreground hover:bg-muted rounded-xl">
                  Continue Shopping
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
