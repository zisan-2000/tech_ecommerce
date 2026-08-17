import { prisma } from "@/lib/prisma";

type ShippingRateRow = {
  id: number;
  country: string;
  area: string;
  baseCost: any;
  freeMinOrder: any;
  isActive: boolean;
  priority: number;
  estimatedDays: number | null;
};

export type ShippingQuoteInput = {
  country: string;
  district: string;
  area: string;
  subtotal: number;
};

export type ShippingQuoteResult = {
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
    estimatedDays: number | null;
  } | null;
  reason: string;
};

const DEFAULT_SHIPPING_COST = 60;

function normalizeText(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.,/\\-]+/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeCountryCode(value: string) {
  const v = String(value || "").trim();
  if (!v) return "BD";
  if (v.length === 2) return v.toUpperCase();

  const byName: Record<string, string> = {
    bangladesh: "BD",
    india: "IN",
    pakistan: "PK",
    nepal: "NP",
    bhutan: "BT",
    sri_lanka: "LK",
    "sri lanka": "LK",
  };
  const key = normalizeText(v).replace(/\s+/g, "_");
  return byName[key] || v.slice(0, 2).toUpperCase();
}

function isDefaultLikeArea(value: string) {
  const v = normalizeText(value);
  return v === "all" || v === "default" || v === "*" || v === "countrywide" || v === "nationwide";
}

function rateMatchScore(rateArea: string, district: string, area: string) {
  const r = normalizeText(rateArea);
  const d = normalizeText(district);
  const a = normalizeText(area);
  if (!r) return 0;

  if (a && r === a) return 100;
  if (d && r === d) return 90;
  if (a && (a.includes(r) || r.includes(a))) return 80;
  if (d && (d.includes(r) || r.includes(d))) return 70;
  if (isDefaultLikeArea(r)) return 10;
  return 0;
}

export async function calculateShippingQuote(input: ShippingQuoteInput): Promise<ShippingQuoteResult> {
  const subtotal = Number(input.subtotal || 0);
  const countryCode = normalizeCountryCode(input.country);
  const district = String(input.district || "");
  const area = String(input.area || "");

  const rates: ShippingRateRow[] = await prisma.shippingRate.findMany({
    where: {
      country: countryCode,
      isActive: true,
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  if (!rates.length) {
    const shippingCost = DEFAULT_SHIPPING_COST;
    return {
      shippingCost,
      subtotal,
      total: subtotal + shippingCost,
      matchedRate: null,
      reason: "No active shipping rate found. Applied default shipping.",
    };
  }

  const scored = rates
    .map((rate) => ({ rate, score: rateMatchScore(rate.area, district, area) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.rate.priority - b.rate.priority));

  const matched = (scored[0]?.rate || rates[0]) as ShippingRateRow;
  const baseCost = Number(matched.baseCost || 0);
  const freeMinOrder =
    matched.freeMinOrder === null || matched.freeMinOrder === undefined
      ? null
      : Number(matched.freeMinOrder);
  
  // Apply free shipping if minimum order is met
  let shippingCost = baseCost;
  if (freeMinOrder !== null && subtotal >= freeMinOrder) {
    shippingCost = 0;
  }

  return {
    shippingCost,
    subtotal,
    total: subtotal + shippingCost,
    matchedRate: {
      id: matched.id,
      country: matched.country,
      area: matched.area,
      baseCost,
      freeMinOrder,
      priority: matched.priority,
      estimatedDays: matched.estimatedDays,
    },
    reason:
      scored.length > 0
        ? freeMinOrder !== null && subtotal >= freeMinOrder
          ? `Free shipping applied (minimum order ৳${freeMinOrder.toFixed(2)} met).`
          : "Matched shipping rate by area/district."
        : "No direct area/district match. Applied highest priority country rate.",
  };
}
