-- Checkout idempotency lookups use a JSON expression so the existing
-- commercialContext payload can carry the key without widening the Order model.
-- The partial expression index keeps replay checks fast as order volume grows.
CREATE INDEX IF NOT EXISTS "Order_checkoutIdempotency_key_idx"
ON "Order" (("commercialContext" #>> '{checkoutIdempotency,key}'))
WHERE "commercialContext" #>> '{checkoutIdempotency,key}' IS NOT NULL;
