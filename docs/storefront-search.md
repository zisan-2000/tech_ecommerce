# Storefront search

The storefront uses PostgreSQL as its safe default search provider. It supports
weighted full-text relevance, trigram typo tolerance, exact SKU/model matching,
tech/Bangla synonyms, natural-language price intent, autocomplete, URL-based
facets and search analytics.

## Operations

- Admin UI: `/admin/management/search`
- Suggestions: `GET /api/search/suggest?q=keyboard`
- Analytics ingestion: `POST /api/search/events`
- Search index worker: `GET /api/cron/search-index` with `Authorization: Bearer $CRON_SECRET`
- Run tests: `npm run test:search`

The admin UI can create synonyms and query merchandising rules, inspect top and
zero-result queries, pause rules, and queue a complete external-index rebuild.

## Optional Typesense accelerator

PostgreSQL needs no extra service. For larger catalogs, configure:

```env
SEARCH_PROVIDER=typesense
TYPESENSE_HOST=https://your-typesense-host
TYPESENSE_ADMIN_API_KEY=server-only-admin-key
TYPESENSE_COLLECTION=storefront_products
SEARCH_INDEX_BATCH_SIZE=100
```

Never expose the Typesense admin key through a `NEXT_PUBLIC_` variable. Schedule
the protected search-index route at least every five minutes. Product, variant,
attribute, brand and category writes feed a transactional outbox; the worker
uses bounded batches, retry backoff and dead-letter status after eight failures.
If Typesense is unavailable, customer search automatically falls back to the
PostgreSQL relevance engine.
