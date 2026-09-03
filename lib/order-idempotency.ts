import { createHash } from "node:crypto";

const CLIENT_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const AUTOMATIC_REPLAY_WINDOW_MINUTES = 10;

type NormalizedCheckoutItem = {
  productId: number;
  variantId: number | null;
  quantity: number;
};

type BuildOrderIdempotencyInput = {
  clientKey?: string | null;
  userId?: string | null;
  name: unknown;
  email?: unknown;
  phoneNumber: unknown;
  altPhoneNumber?: unknown;
  country: unknown;
  district: unknown;
  area: unknown;
  addressDetails: unknown;
  paymentMethod: unknown;
  items: NormalizedCheckoutItem[];
  transactionId?: unknown;
  image?: unknown;
  couponId?: unknown;
  couponCode?: unknown;
};

export type OrderIdempotencyContext = {
  storageKey: string;
  requestHash: string;
  mode: "client" | "automatic";
};

export class OrderIdempotencyError extends Error {
  constructor(
    message: string,
    readonly code: "INVALID_IDEMPOTENCY_KEY" | "IDEMPOTENCY_KEY_REUSED",
    readonly status: 400 | 409,
  ) {
    super(message);
    this.name = "OrderIdempotencyError";
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeNullableText(value: unknown) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function normalizeItems(items: NormalizedCheckoutItem[]) {
  return items
    .map((item) => ({
      productId: Number(item.productId),
      variantId: item.variantId === null ? null : Number(item.variantId),
      quantity: Number(item.quantity),
    }))
    .sort(
      (a, b) =>
        a.productId - b.productId ||
        (a.variantId ?? -1) - (b.variantId ?? -1) ||
        a.quantity - b.quantity,
    );
}

export function buildOrderIdempotencyContext(
  input: BuildOrderIdempotencyInput,
): OrderIdempotencyContext {
  const clientKey = normalizeNullableText(input.clientKey);
  if (clientKey && !CLIENT_IDEMPOTENCY_KEY_PATTERN.test(clientKey)) {
    throw new OrderIdempotencyError(
      "Idempotency-Key must be 16-128 characters and contain only letters, numbers, '.', '_', ':', or '-'.",
      "INVALID_IDEMPOTENCY_KEY",
      400,
    );
  }

  const email = normalizeNullableText(input.email)?.toLowerCase() ?? null;
  const phoneNumber = normalizeText(input.phoneNumber);
  const canonicalRequest = {
    customer: {
      name: normalizeText(input.name),
      email,
      phoneNumber,
      altPhoneNumber: normalizeNullableText(input.altPhoneNumber),
    },
    shipping: {
      country: normalizeText(input.country),
      district: normalizeText(input.district),
      area: normalizeText(input.area),
      addressDetails: normalizeText(input.addressDetails),
    },
    payment: {
      method: normalizeText(input.paymentMethod),
      transactionId: normalizeNullableText(input.transactionId),
      image: normalizeNullableText(input.image),
    },
    coupon: {
      id:
        input.couponId === undefined || input.couponId === null
          ? null
          : String(input.couponId),
      code: normalizeNullableText(input.couponCode)?.toUpperCase() ?? null,
    },
    items: normalizeItems(input.items),
  };

  const requestHash = sha256(JSON.stringify(canonicalRequest));
  const scopeSeed = input.userId
    ? `user:${input.userId}`
    : `guest:${email ?? ""}|${phoneNumber}`;
  const scopeHash = sha256(scopeSeed).slice(0, 32);

  if (clientKey) {
    return {
      storageKey: `client:${scopeHash}:${sha256(clientKey).slice(0, 40)}`,
      requestHash,
      mode: "client",
    };
  }

  return {
    storageKey: `auto:${scopeHash}:${requestHash}`,
    requestHash,
    mode: "automatic",
  };
}

export function orderIdempotencyCommercialContext(
  context: OrderIdempotencyContext,
) {
  return {
    checkoutIdempotency: {
      version: 1,
      key: context.storageKey,
      requestHash: context.requestHash,
      mode: context.mode,
    },
  };
}

export async function acquireOrderIdempotencyLock(
  db: any,
  context: OrderIdempotencyContext,
) {
  // PostgreSQL advisory locks are database-wide and transaction-scoped. This
  // serializes the same logical checkout across every application instance.
  await db.$queryRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0)) AS "locked"',
    context.storageKey,
  );
}

export async function findExistingOrderIdempotencyOrderId(
  db: any,
  context: OrderIdempotencyContext,
): Promise<number | null> {
  const automaticWindow =
    context.mode === "automatic"
      ? `AND "createdAt" >= NOW() - INTERVAL '${AUTOMATIC_REPLAY_WINDOW_MINUTES} minutes'`
      : "";
  const rows = (await db.$queryRawUnsafe(
    `SELECT
       "id",
       "commercialContext" #>> '{checkoutIdempotency,requestHash}' AS "requestHash"
     FROM "Order"
     WHERE "commercialContext" #>> '{checkoutIdempotency,key}' = $1
       ${automaticWindow}
     ORDER BY "createdAt" DESC, "id" DESC
     LIMIT 1`,
    context.storageKey,
  )) as Array<{ id: number | bigint; requestHash: string | null }>;

  const match = rows[0];
  if (!match) return null;

  if (match.requestHash !== context.requestHash) {
    throw new OrderIdempotencyError(
      "This Idempotency-Key was already used for a different checkout request.",
      "IDEMPOTENCY_KEY_REUSED",
      409,
    );
  }

  return Number(match.id);
}
