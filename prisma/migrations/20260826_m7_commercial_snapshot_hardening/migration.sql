-- M7 forward-only hardening: corporate line snapshots and completed review metadata are append-only.
CREATE OR REPLACE FUNCTION "protect_business_order_item_snapshot"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."priceSource" IS NOT NULL THEN
      RAISE EXCEPTION 'Business order item commercial snapshots cannot be deleted' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."priceSource" IS NOT NULL AND (
    NEW."productId" IS DISTINCT FROM OLD."productId" OR
    NEW."variantId" IS DISTINCT FROM OLD."variantId" OR
    NEW."quantity" IS DISTINCT FROM OLD."quantity" OR
    NEW."price" IS DISTINCT FROM OLD."price" OR
    NEW."currency" IS DISTINCT FROM OLD."currency" OR
    NEW."VatAmount" IS DISTINCT FROM OLD."VatAmount" OR
    NEW."discountAmount" IS DISTINCT FROM OLD."discountAmount" OR
    NEW."costPriceSnapshot" IS DISTINCT FROM OLD."costPriceSnapshot" OR
    NEW."priceSource" IS DISTINCT FROM OLD."priceSource" OR
    NEW."publicUnitPriceSnapshot" IS DISTINCT FROM OLD."publicUnitPriceSnapshot" OR
    NEW."businessDiscountSnapshot" IS DISTINCT FROM OLD."businessDiscountSnapshot"
  ) THEN
    RAISE EXCEPTION 'Business order item commercial snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER "OrderItem_business_snapshot_immutable" ON "OrderItem";
CREATE TRIGGER "OrderItem_business_snapshot_immutable"
BEFORE UPDATE OR DELETE ON "OrderItem"
FOR EACH ROW EXECUTE FUNCTION "protect_business_order_item_snapshot"();

CREATE FUNCTION "protect_customer_purchase_order_review_metadata"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'SUBMITTED' AND (
    NEW."reviewedById" IS DISTINCT FROM OLD."reviewedById" OR
    NEW."reviewedAt" IS DISTINCT FROM OLD."reviewedAt"
  ) THEN
    RAISE EXCEPTION 'Customer purchase order review metadata is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CustomerPurchaseOrder_review_metadata_immutable"
BEFORE UPDATE ON "CustomerPurchaseOrder"
FOR EACH ROW EXECUTE FUNCTION "protect_customer_purchase_order_review_metadata"();
