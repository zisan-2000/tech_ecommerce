export type FlashSaleSource = {
  basePrice: unknown;
  flashSaleEnabled?: boolean | null;
  flashSalePrice?: unknown;
  flashSaleStartsAt?: Date | string | null;
  flashSaleEndsAt?: Date | string | null;
};

export type FlashSalePricing = {
  active: boolean;
  regularPrice: number;
  salePrice: number;
  savings: number;
  discountPercent: number;
  startsAt: string | null;
  endsAt: string | null;
};

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dateValue(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveFlashSalePricing(
  product: FlashSaleSource,
  regularPrice: unknown = product.basePrice,
  now: Date = new Date(),
): FlashSalePricing {
  const basePrice = Number(product.basePrice);
  const variantRegularPrice = Number(regularPrice);
  const configuredPrice = Number(product.flashSalePrice);
  const startsAt = dateValue(product.flashSaleStartsAt);
  const endsAt = dateValue(product.flashSaleEndsAt);
  const validPrice =
    Number.isFinite(basePrice) &&
    basePrice > 0 &&
    Number.isFinite(variantRegularPrice) &&
    variantRegularPrice > 0 &&
    Number.isFinite(configuredPrice) &&
    configuredPrice > 0 &&
    configuredPrice < basePrice;
  const active = Boolean(
    product.flashSaleEnabled &&
      validPrice &&
      startsAt &&
      endsAt &&
      startsAt.getTime() <= now.getTime() &&
      endsAt.getTime() > now.getTime(),
  );

  const salePrice = active
    ? money(variantRegularPrice * (configuredPrice / basePrice))
    : money(variantRegularPrice || 0);
  const savings = active ? money(variantRegularPrice - salePrice) : 0;

  return {
    active,
    regularPrice: money(variantRegularPrice || 0),
    salePrice,
    savings,
    discountPercent:
      active && variantRegularPrice > 0
        ? Math.round((savings / variantRegularPrice) * 100)
        : 0,
    startsAt: startsAt?.toISOString() ?? null,
    endsAt: endsAt?.toISOString() ?? null,
  };
}

export function applyFlashSalePricingToProduct<
  T extends FlashSaleSource & {
    originalPrice?: unknown;
    variants?: ReadonlyArray<{ price: unknown }>;
  },
>(product: T, now = new Date()) {
  const pricing = resolveFlashSalePricing(product, product.basePrice, now);
  return {
    ...product,
    basePrice: pricing.salePrice,
    originalPrice: pricing.active
      ? pricing.regularPrice
      : product.originalPrice === null || product.originalPrice === undefined
        ? null
        : Number(product.originalPrice),
    flashSale: pricing,
    flashSalePrice:
      product.flashSalePrice === null || product.flashSalePrice === undefined
        ? null
        : Number(product.flashSalePrice),
    flashSaleStartsAt: dateValue(product.flashSaleStartsAt)?.toISOString() ?? null,
    flashSaleEndsAt: dateValue(product.flashSaleEndsAt)?.toISOString() ?? null,
    variants: product.variants?.map((variant) => ({
      ...variant,
      price: resolveFlashSalePricing(product, variant.price, now).salePrice,
    })),
  };
}

export type FlashSaleConfigurationInput = {
  enabled: boolean;
  salePrice: number;
  startsAt: Date;
  endsAt: Date;
  sortOrder: number;
  expectedUpdatedAt: Date | null;
};

export function parseFlashSaleConfiguration(
  input: unknown,
  basePrice: unknown,
): { ok: true; value: FlashSaleConfigurationInput } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "A valid flash sale configuration is required" };
  }

  const body = input as Record<string, unknown>;
  const salePrice = Number(body.salePrice);
  const productPrice = Number(basePrice);
  const startsAt = dateValue(body.startsAt as string | null);
  const endsAt = dateValue(body.endsAt as string | null);
  const sortOrder = body.sortOrder === undefined ? 0 : Number(body.sortOrder);
  const expectedUpdatedAt = dateValue(body.expectedUpdatedAt as string | null);

  if (typeof body.enabled !== "boolean") {
    return { ok: false, error: "enabled must be true or false" };
  }
  if (!Number.isFinite(salePrice) || salePrice <= 0) {
    return { ok: false, error: "Sale price must be greater than zero" };
  }
  if (!Number.isFinite(productPrice) || salePrice >= productPrice) {
    return { ok: false, error: "Sale price must be lower than the regular price" };
  }
  if (!startsAt || !endsAt) {
    return { ok: false, error: "A valid start and end time are required" };
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    return { ok: false, error: "End time must be after start time" };
  }
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
    return { ok: false, error: "Sort order must be an integer from 0 to 9999" };
  }
  if (body.expectedUpdatedAt !== undefined && !expectedUpdatedAt) {
    return { ok: false, error: "The product version is invalid; refresh and try again" };
  }

  return {
    ok: true,
    value: {
      enabled: body.enabled,
      salePrice: money(salePrice),
      startsAt,
      endsAt,
      sortOrder,
      expectedUpdatedAt,
    },
  };
}
