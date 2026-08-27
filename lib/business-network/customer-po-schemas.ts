import { z } from "zod";
import { CustomerPurchaseOrderStatus } from "@/generated/prisma";
import { resourceIdSchema } from "./schemas";

const positiveMoney = z.union([
  z.number().finite().positive().max(999_999_999_999.99),
  z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/),
]);

export const createCustomerPurchaseOrderSchema = z.object({
  quotationId: resourceIdSchema.nullable().optional(),
  customerPoNumber: z.string().trim().min(1).max(120),
  fileUrl: z.string().trim().max(2_048).refine(
    (value) => value.startsWith("/upload/") || value.startsWith("https://"),
    "PO file URL must be an HTTPS URL or an internal /upload/ path.",
  ),
  poDate: z.coerce.date().nullable().optional(),
  expectedDeliveryAt: z.coerce.date().nullable().optional(),
  totalAmount: positiveMoney.nullable().optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("BDT"),
}).strict().superRefine((value, context) => {
  if (value.poDate && value.expectedDeliveryAt && value.expectedDeliveryAt < value.poDate) {
    context.addIssue({
      code: "custom",
      path: ["expectedDeliveryAt"],
      message: "Expected delivery cannot be earlier than the PO date.",
    });
  }
});

export const customerPurchaseOrderListSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).default(""),
  status: z.enum(CustomerPurchaseOrderStatus).optional(),
}).strict();

export const adminCustomerPurchaseOrderListSchema = customerPurchaseOrderListSchema.extend({
  organizationId: resourceIdSchema.optional(),
  quotationId: resourceIdSchema.optional(),
}).strict();

export const rejectCustomerPurchaseOrderSchema = z.object({
  reason: z.string().trim().min(3).max(1_000),
}).strict();
