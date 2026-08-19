export type ProductAttributeInput = {
  attributeId: number;
  value: string;
};

export function parseProductAttributeInput(input: unknown):
  | { ok: true; value: ProductAttributeInput[] }
  | { ok: false; error: string } {
  if (!Array.isArray(input)) {
    return { ok: false, error: "Product attributes must be an array" };
  }
  if (input.length > 64) {
    return { ok: false, error: "A product can have at most 64 attributes" };
  }

  const unique = new Map<number, ProductAttributeInput>();
  for (const item of input) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: "Invalid product attribute" };
    }
    const source = item as Record<string, unknown>;
    const attributeId = Number(source.attributeId);
    const value = String(source.value ?? "").trim();
    if (!Number.isInteger(attributeId) || attributeId < 1) {
      return { ok: false, error: "Invalid product attribute id" };
    }
    if (!value || value.length > 500) {
      return {
        ok: false,
        error: "Attribute values must be between 1 and 500 characters",
      };
    }
    unique.set(attributeId, { attributeId, value });
  }
  return { ok: true, value: [...unique.values()] };
}
