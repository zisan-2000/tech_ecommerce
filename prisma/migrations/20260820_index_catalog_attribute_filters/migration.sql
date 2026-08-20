-- Storefront catalog attribute (spec) filtering.
-- Dynamic filters resolve to `attributes: { some: { attributeId, value IN (...) } }`
-- per selected group, and the facet reader scans ProductAttribute by product.
-- Without these, both paths fall back to sequential scans as the catalog grows.

CREATE INDEX IF NOT EXISTS "Catalog_ProductAttribute_attribute_value_idx"
  ON "ProductAttribute" ("attributeId", "value");

CREATE INDEX IF NOT EXISTS "Catalog_ProductAttribute_product_attribute_idx"
  ON "ProductAttribute" ("productId", "attributeId");
