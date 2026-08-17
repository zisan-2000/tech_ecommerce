"use client";

import { useState } from "react";
import { Calculator, Loader2, MapPin, Truck } from "lucide-react";
import { ALLOWED_SHIPPING_AREAS, type AllowedShippingArea } from "@/lib/shipping-areas";

const BANGLADESH_DELIVERY_AREAS = ALLOWED_SHIPPING_AREAS.filter(
  (area) => area !== "Outside Bangladesh",
);

type ShippingQuote = {
  shippingCost: number;
  total: number;
  reason: string;
  matchedRate: {
    area: string;
    freeMinOrder: number | null;
    estimatedDays: number | null;
  } | null;
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "BDT",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function ProductConversionTools({
  price,
  currency,
}: {
  price: number;
  currency: string;
}) {
  const [months, setMonths] = useState(6);
  const [district, setDistrict] = useState("Dhaka");
  const [area, setArea] = useState<AllowedShippingArea>("Dhaka");
  const [quote, setQuote] = useState<ShippingQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const checkDelivery = async () => {
    if (!district.trim()) {
      setError("Enter your district to check delivery.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const response = await fetch("/api/shipping/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: "Bangladesh",
          district: district.trim(),
          area,
          subtotal: price,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Delivery quote failed.");
      setQuote(data as ShippingQuote);
    } catch (caught) {
      setQuote(null);
      setError(caught instanceof Error ? caught.message : "Delivery quote failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 grid gap-4 xl:grid-cols-2">
      <section className="rounded-2xl border bg-background p-4" aria-labelledby="emi-heading">
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          <h2 id="emi-heading" className="text-sm font-bold">EMI estimate</h2>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[3, 6, 9, 12].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMonths(option)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${months === option ? "border-primary bg-primary/10 text-primary" : "hover:border-primary/50"}`}
            >
              {option} months
            </button>
          ))}
        </div>
        <p className="mt-3 text-lg font-black text-primary">
          {money(price / months, currency)} <span className="text-xs font-medium text-muted-foreground">/ month</span>
        </p>
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
          Indicative 0% split. Bank fees, eligibility and final installment terms may vary.
        </p>
      </section>

      <section className="rounded-2xl border bg-background p-4" aria-labelledby="delivery-heading">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h2 id="delivery-heading" className="text-sm font-bold">Delivery estimate</h2>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="sr-only" htmlFor="delivery-district">District</label>
          <input
            id="delivery-district"
            value={district}
            onChange={(event) => setDistrict(event.target.value)}
            placeholder="District"
            className="h-10 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          <label className="sr-only" htmlFor="delivery-area">Delivery area</label>
          <select
            id="delivery-area"
            value={area}
            onChange={(event) => setArea(event.target.value as AllowedShippingArea)}
            className="h-10 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          >
            {BANGLADESH_DELIVERY_AREAS.map((option) => <option key={option}>{option}</option>)}
          </select>
        </div>
        <button
          type="button"
          onClick={checkDelivery}
          disabled={loading}
          className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border text-sm font-bold hover:bg-muted disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
          {loading ? "Checking..." : "Check delivery"}
        </button>
        <div className="mt-2 min-h-9 text-xs" aria-live="polite">
          {error ? <p className="text-destructive">{error}</p> : null}
          {quote ? (
            <p className="text-muted-foreground">
              <strong className="text-foreground">
                {quote.shippingCost === 0 ? "Free delivery" : `${money(quote.shippingCost, currency)} delivery`}
              </strong>
              {quote.matchedRate?.estimatedDays ? ` · ${quote.matchedRate.estimatedDays} business days` : " · Delivery time confirmed at checkout"}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
