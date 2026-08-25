"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth-client";

type Props = {
  productId: number | string;
  variantId?: number | string | null;
  productHref?: string;
  compact?: boolean;
  className?: string;
};

function toNumericId(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export default function PriceDropAlertButton({
  productId,
  variantId = null,
  productHref,
  compact = false,
  className,
}: Props) {
  const router = useRouter();
  const { status } = useSession();
  const numericProductId = toNumericId(productId);
  const numericVariantId = toNumericId(variantId);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status !== "authenticated" || !numericProductId) return;
    let cancelled = false;

    const loadState = async () => {
      try {
        const params = new URLSearchParams({ productId: String(numericProductId) });
        if (numericVariantId) params.set("variantId", String(numericVariantId));
        const response = await fetch(`/api/price-drop-alerts?${params}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (!cancelled) setEnabled(Array.isArray(payload.items) && payload.items.length > 0);
      } catch {
        // The button can still create the alert when clicked.
      }
    };

    void loadState();
    return () => {
      cancelled = true;
    };
  }, [numericProductId, numericVariantId, status]);

  const toggleAlert = async () => {
    if (!numericProductId || loading) return;
    if (status !== "authenticated") {
      router.push(
        `/signin?callbackUrl=${encodeURIComponent(
          productHref ?? `/ecommerce/products/${numericProductId}`,
        )}`,
      );
      return;
    }

    try {
      setLoading(true);
      if (enabled) {
        const params = new URLSearchParams({ productId: String(numericProductId) });
        if (numericVariantId) params.set("variantId", String(numericVariantId));
        const response = await fetch(`/api/price-drop-alerts?${params}`, {
          method: "DELETE",
        });
        if (!response.ok) throw new Error("Failed to remove alert");
        setEnabled(false);
        toast.success("Price drop alert turned off.");
        return;
      }

      const response = await fetch("/api/price-drop-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: numericProductId,
          variantId: numericVariantId,
        }),
      });
      if (!response.ok) throw new Error("Failed to save alert");
      setEnabled(true);
      toast.success("You will be notified when the price drops.");
    } catch (error) {
      console.error(error);
      toast.error("Price drop alert could not be updated.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggleAlert}
      disabled={loading || !numericProductId}
      aria-pressed={enabled}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded border border-border bg-muted text-[11px] font-semibold text-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
        compact ? "h-9 px-3" : "h-10 px-3",
        enabled && "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
        className,
      )}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : enabled ? (
        <BellOff className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Bell className="h-4 w-4" aria-hidden="true" />
      )}
      <span className={compact ? "hidden sm:inline" : ""}>
        {enabled ? "Alert On" : "Notify Price Drop"}
      </span>
    </button>
  );
}
