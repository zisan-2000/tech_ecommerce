import { z } from "zod";
import { SalesQuotationStatus } from "@/generated/prisma";
import { resourceIdSchema } from "./schemas";

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional().transform((value) => {
    if (value === undefined) return undefined;
    return value || null;
  });
const positiveCatalogId = z.number().int().positive().nullable().optional();
const positiveMoney = z.union([
  z.number().finite().positive().max(999_999_999_999.99),
  z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/),
]);
const nonNegativeMoney = z.union([
  z.number().finite().min(0).max(999_999_999_999.99),
  z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/),
]);

export const salesQuotationItemSchema = z.object({
  productId: positiveCatalogId,
  variantId: positiveCatalogId,
  productName: z.string().trim().min(2).max(240).optional(),
  skuSnapshot: optionalText(120),
  quantity: z.number().int().min(1).max(1_000_000),
  publicUnitPrice: positiveMoney.nullable().optional(),
  unitPrice: positiveMoney,
  discountAmount: nonNegativeMoney.default(0),
  vatAmount: nonNegativeMoney.default(0),
}).strict().superRefine((item, context) => {
  if (!item.productId && !item.variantId && !item.productName) {
    context.addIssue({
      code: "custom",
      path: ["productName"],
      message: "A custom product name is required when no catalog item is selected.",
    });
  }
});

export const salesQuotationVersionSchema = z.object({
  items: z.array(salesQuotationItemSchema).min(1).max(100),
  shippingTotal: nonNegativeMoney.default(0),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("BDT"),
  paymentTerms: optionalText(2_000),
  deliveryTerms: optionalText(2_000),
  warrantyTerms: optionalText(2_000),
  notes: optionalText(4_000),
  pdfUrl: z.string().trim().max(2_048).refine(
    (value) => value.startsWith("/upload/") || value.startsWith("https://"),
    "PDF URL must be an HTTPS URL or an internal /upload/ path.",
  ).nullable().optional(),
}).strict();

export const createSalesQuotationSchema = z.object({
  organizationId: resourceIdSchema,
  salesRfqId: resourceIdSchema.nullable().optional(),
  validUntil: z.coerce.date().nullable().optional(),
  version: salesQuotationVersionSchema,
}).strict();

export const createSalesQuotationVersionSchema = salesQuotationVersionSchema.extend({
  validUntil: z.coerce.date().nullable().optional(),
}).strict();

export const portalSalesQuotationListSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).default(""),
  status: z.enum(SalesQuotationStatus).optional(),
}).strict();

export const adminSalesQuotationListSchema = portalSalesQuotationListSchema.extend({
  organizationId: resourceIdSchema.optional(),
  salesRfqId: resourceIdSchema.optional(),
}).strict();

export const salesQuotationReasonSchema = z.object({
  reason: z.string().trim().min(3).max(1_000),
}).strict();
