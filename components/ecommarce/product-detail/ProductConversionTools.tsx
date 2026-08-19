"use client";

import { useState } from "react";
import { Calculator, ChevronDown, Loader2, MapPin, Truck } from "lucide-react";
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
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <details className="group overflow-hidden rounded-md border border-slate-200 bg-white" aria-labelledby="emi-heading">
        <summary className="flex h-12 cursor-pointer list-none items-center gap-2 px-3 text-slate-800 transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
          <Calculator className="h-4 w-4 shrink-0 text-[#174a92]" />
          <span id="emi-heading" className="min-w-0 flex-1 text-[12px] font-bold">EMI plans</span>
          <span className="text-[10px] font-medium text-slate-500">from {money(price / 12, currency)}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-slate-200 bg-slate-50/70 p-3">
          <p className="text-[11px] font-medium text-slate-600">Choose installment period</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[3, 6, 9, 12].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMonths(option)}
                className={`rounded border px-2.5 py-1 text-[11px] font-bold ${months === option ? "border-[#174a92] bg-blue-50 text-[#174a92]" : "border-slate-200 bg-white hover:border-slate-400"}`}
              >
                {option} months
              </button>
            ))}
          </div>
          <p className="mt-2 text-[16px] font-bold text-[#174a92]">
            {money(price / months, currency)} <span className="text-xs font-medium text-muted-foreground">/ month</span>
          </p>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">
            Indicative split. Bank fees and eligibility may vary.
          </p>
        </div>
      </details>

      <details className="group overflow-hidden rounded-md border border-slate-200 bg-white" aria-labelledby="delivery-heading">
        <summary className="flex h-12 cursor-pointer list-none items-center gap-2 px-3 text-slate-800 transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
          <MapPin className="h-4 w-4 shrink-0 text-[#174a92]" />
          <span id="delivery-heading" className="min-w-0 flex-1 text-[12px] font-bold">Delivery estimate</span>
          <span className="text-[10px] font-medium text-slate-500">Check area</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-slate-200 bg-slate-50/70 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="sr-only" htmlFor="delivery-district">District</label>
            <input
              id="delivery-district"
              value={district}
              onChange={(event) => setDistrict(event.target.value)}
              placeholder="District"
              className="h-9 rounded border border-slate-200 bg-white px-3 text-[12px] outline-none focus:ring-2 focus:ring-[#174a92]/30"
            />
            <label className="sr-only" htmlFor="delivery-area">Delivery area</label>
            <select
              id="delivery-area"
              value={area}
              onChange={(event) => setArea(event.target.value as AllowedShippingArea)}
              className="h-9 rounded border border-slate-200 bg-white px-3 text-[12px] outline-none focus:ring-2 focus:ring-[#174a92]/30"
            >
              {BANGLADESH_DELIVERY_AREAS.map((option) => <option key={option}>{option}</option>)}
            </select>
          </div>
          <button
            type="button"
            onClick={checkDelivery}
            disabled={loading}
            className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded border border-slate-200 bg-white text-[12px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
            {loading ? "Checking..." : "Check delivery"}
          </button>
          <div className="mt-2 text-[11px]" aria-live="polite">
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
        </div>
      </details>
    </div>
  );
}
