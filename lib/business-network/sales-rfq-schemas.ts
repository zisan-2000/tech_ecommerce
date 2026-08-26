import { z } from "zod";
import { SalesRfqStatus } from "@/generated/prisma";
import { resourceIdSchema } from "./schemas";

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional().transform((value) => {
    if (value === undefined) return undefined;
    return value || null;
  });
const positiveId = z.number().int().positive().nullable().optional();
const moneyValue = z.union([
  z.number().finite().positive().max(999_999_999_999.99),
  z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/),
]);

export const salesRfqItemSchema = z.object({
  productId: positiveId,
  variantId: positiveId,
  productName: z.string().trim().min(2).max(240).optional(),
  skuSnapshot: optionalText(120),
  description: optionalText(2_000),
  quantity: z.number().int().min(1).max(1_000_000),
  targetUnitPrice: moneyValue.nullable().optional(),
}).strict().superRefine((item, context) => {
  if (!item.productId && !item.variantId && !item.productName) {
    context.addIssue({
      code: "custom",
      path: ["productName"],
      message: "A custom product name is required when no catalog product or variant is selected.",
    });
  }
});

const editableFields = {
  subject: z.string().trim().min(3).max(240),
  requestedDelivery: z.coerce.date().nullable().optional(),
  quotationDueAt: z.coerce.date().nullable().optional(),
  notes: optionalText(4_000),
  items: z.array(salesRfqItemSchema).max(100),
} as const;

export const createSalesRfqSchema = z.object({
  subject: editableFields.subject,
  requestedDelivery: editableFields.requestedDelivery,
  quotationDueAt: editableFields.quotationDueAt,
  notes: editableFields.notes,
  items: editableFields.items.default([]),
}).strict();

export const updateSalesRfqSchema = z.object({
  subject: editableFields.subject.optional(),
  requestedDelivery: editableFields.requestedDelivery,
  quotationDueAt: editableFields.quotationDueAt,
  notes: editableFields.notes,
  items: editableFields.items.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const portalSalesRfqListSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).default(""),
  status: z.enum(SalesRfqStatus).optional(),
}).strict();

export const adminSalesRfqListSchema = portalSalesRfqListSchema.extend({
  organizationId: resourceIdSchema.optional(),
  assignedToUserId: resourceIdSchema.optional(),
}).strict();

export const salesRfqAttachmentSchema = z.object({
  title: optionalText(240),
  fileUrl: z.string().trim().min(1).max(2_048).refine(
    (value) => value.startsWith("/upload/") || value.startsWith("https://"),
    "Attachment URL must be an HTTPS URL or an internal /upload/ path.",
  ),
  fileName: optionalText(255),
  mimeType: z.string().trim().max(120).regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i).nullable().optional(),
}).strict();

export const assignSalesRfqSchema = z.object({
  userId: resourceIdSchema,
}).strict();

export const salesRfqReasonSchema = z.object({
  reason: z.string().trim().min(3).max(1_000),
}).strict();
