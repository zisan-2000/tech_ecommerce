import { z } from "zod";

export const portalListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).default(""),
}).strict();

export function portalListQuery(request: Request) {
  const url = new URL(request.url);
  return portalListQuerySchema.parse({
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
  });
}

