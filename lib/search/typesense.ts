type TypesenseDocument = {
  id: string;
  productId: number;
  matchedVariantSku?: string;
};

type TypesenseSearchResponse = {
  hits?: Array<{ document: TypesenseDocument; text_match?: number }>;
};

function configuration() {
  const host = process.env.TYPESENSE_HOST?.replace(/\/$/, "");
  const apiKey = process.env.TYPESENSE_ADMIN_API_KEY;
  const collection = process.env.TYPESENSE_COLLECTION || "storefront_products";
  return host && apiKey ? { host, apiKey, collection } : null;
}

export function typesenseSearchEnabled() {
  return (process.env.SEARCH_PROVIDER || "postgresql").toLowerCase() === "typesense" && Boolean(configuration());
}

async function typesenseFetch(path: string, init?: RequestInit) {
  const config = configuration();
  if (!config) throw new Error("Typesense is not configured");
  const headers = new Headers(init?.headers);
  headers.set("X-TYPESENSE-API-KEY", config.apiKey);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${config.host}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Typesense ${response.status}: ${details.slice(0, 300)}`);
  }
  return response;
}

export async function searchTypesenseProducts(query: string, limit: number) {
  const config = configuration();
  if (!config) return null;
  const params = new URLSearchParams({
    q: query,
    query_by: "name,sku,variantSkus,brand,category,attributes",
    query_by_weights: "10,9,9,5,4,2",
    prefix: "true,true,true,true,true,true",
    typo_tokens_threshold: "1",
    num_typos: "2,1,1,1,1,1",
    filter_by: "available:=true && deleted:=false",
    sort_by: "_text_match:desc,soldCount:desc,ratingAvg:desc",
    per_page: String(Math.max(1, Math.min(250, limit))),
  });
  const response = await typesenseFetch(
    `/collections/${encodeURIComponent(config.collection)}/documents/search?${params}`,
  );
  const body = (await response.json()) as TypesenseSearchResponse;
  return (body.hits ?? []).map((hit, index) => ({
    id: Number(hit.document.productId || hit.document.id),
    score: Number(hit.text_match ?? body.hits!.length - index),
    matchedVariantSku: hit.document.matchedVariantSku ?? null,
  })).filter((row) => Number.isInteger(row.id) && row.id > 0);
}

export async function ensureTypesenseCollection() {
  const config = configuration();
  if (!config) throw new Error("Typesense is not configured");
  const existing = await fetch(
    `${config.host}/collections/${encodeURIComponent(config.collection)}`,
    { headers: { "X-TYPESENSE-API-KEY": config.apiKey }, cache: "no-store" },
  );
  if (existing.ok) return;
  if (existing.status !== 404) throw new Error(`Typesense collection check failed (${existing.status})`);
  await typesenseFetch("/collections", {
    method: "POST",
    body: JSON.stringify({
      name: config.collection,
      fields: [
        { name: "productId", type: "int32" },
        { name: "name", type: "string" },
        { name: "slug", type: "string" },
        { name: "sku", type: "string", optional: true },
        { name: "variantSkus", type: "string[]", optional: true },
        { name: "brand", type: "string", optional: true, facet: true },
        { name: "category", type: "string", facet: true },
        { name: "categorySlug", type: "string", facet: true },
        { name: "attributes", type: "string[]", optional: true, facet: true },
        { name: "price", type: "float", facet: true },
        { name: "stock", type: "int32", facet: true },
        { name: "soldCount", type: "int32" },
        { name: "ratingAvg", type: "float" },
        { name: "available", type: "bool" },
        { name: "deleted", type: "bool" },
        { name: "updatedAt", type: "int64" },
      ],
      default_sorting_field: "soldCount",
    }),
  });
}

export async function upsertTypesenseDocuments(documents: Record<string, unknown>[]) {
  if (!documents.length) return;
  const config = configuration();
  if (!config) throw new Error("Typesense is not configured");
  await ensureTypesenseCollection();
  const response = await typesenseFetch(
    `/collections/${encodeURIComponent(config.collection)}/documents/import?action=upsert`,
    {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: documents.map((document) => JSON.stringify(document)).join("\n"),
    },
  );
  const results = (await response.text()).split("\n").filter(Boolean);
  const failure = results.find((line) => {
    try {
      return JSON.parse(line)?.success === false;
    } catch {
      return true;
    }
  });
  if (failure) throw new Error(`Typesense import failed: ${failure.slice(0, 300)}`);
}

export async function deleteTypesenseDocument(productId: number) {
  const config = configuration();
  if (!config) throw new Error("Typesense is not configured");
  const response = await fetch(
    `${config.host}/collections/${encodeURIComponent(config.collection)}/documents/${productId}`,
    { method: "DELETE", headers: { "X-TYPESENSE-API-KEY": config.apiKey }, cache: "no-store" },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`Typesense delete failed (${response.status})`);
  }
}
