import { z } from "zod";
import {
  BusinessAccountStatus,
  BusinessPriceAdjustmentType,
  BusinessPriceScopeType,
} from "@/generated/prisma";
import { resourceIdSchema } from "./schemas";

const cleanOptionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional().transform((value) => value || null);

const positiveId = z.number().int().positive().nullable().optional();
const decimalValue = z.union([
  z.number().finite().positive(),
  z.string().trim().regex(/^\d{1,12}(?:\.\d{1,4})?$/),
]);
const moneyValue = z.union([
  z.number().finite().positive(),
  z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/),
]);

export const adminListSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).default(""),
}).strict();

export const createBusinessAccountSchema = z.object({
  organizationId: resourceIdSchema,
  accountNumber: z.string().trim().toUpperCase().min(3).max(32).regex(/^[A-Z0-9][A-Z0-9_-]*$/),
  status: z.enum(BusinessAccountStatus).default(BusinessAccountStatus.PENDING),
  pricingTierId: resourceIdSchema.nullable().optional(),
  accountManagerId: resourceIdSchema.nullable().optional(),
  paymentTermDays: z.number().int().min(0).max(365).default(0),
  allowCredit: z.boolean().default(false),
  allowCoupons: z.boolean().default(false),
  requirePo: z.boolean().default(false),
  notes: cleanOptionalText(2_000),
}).strict();

export const updateBusinessAccountSchema = z.object({
  status: z.enum(BusinessAccountStatus).optional(),
  pricingTierId: resourceIdSchema.nullable().optional(),
  accountManagerId: resourceIdSchema.nullable().optional(),
  paymentTermDays: z.number().int().min(0).max(365).optional(),
  allowCredit: z.boolean().optional(),
  allowCoupons: z.boolean().optional(),
  requirePo: z.boolean().optional(),
  notes: cleanOptionalText(2_000),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const createPricingTierSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(48).regex(/^[A-Z0-9][A-Z0-9_-]*$/),
  name: z.string().trim().min(2).max(120),
  description: cleanOptionalText(1_000),
  priority: z.number().int().min(-10_000).max(10_000).default(100),
  isActive: z.boolean().default(true),
}).strict();

export const updatePricingTierSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: cleanOptionalText(1_000),
  priority: z.number().int().min(-10_000).max(10_000).optional(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const pricingTargetFields = {
  scopeType: z.enum(BusinessPriceScopeType),
  productId: positiveId,
  variantId: positiveId,
  categoryId: positiveId,
  brandId: positiveId,
} as const;

export const createPricingRuleSchema = z.object({
  ...pricingTargetFields,
  minQuantity: z.number().int().min(1).max(1_000_000).default(1),
  adjustmentType: z.enum(BusinessPriceAdjustmentType),
  value: decimalValue,
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(-10_000).max(10_000).default(100),
}).strict();

export const updatePricingRuleSchema = z.object({
  scopeType: z.enum(BusinessPriceScopeType).optional(),
  productId: positiveId,
  variantId: positiveId,
  categoryId: positiveId,
  brandId: positiveId,
  minQuantity: z.number().int().min(1).max(1_000_000).optional(),
  adjustmentType: z.enum(BusinessPriceAdjustmentType).optional(),
  value: decimalValue.optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().min(-10_000).max(10_000).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const createContractPriceSchema = z.object({
  businessAccountId: resourceIdSchema,
  ...pricingTargetFields,
  minQuantity: z.number().int().min(1).max(1_000_000).default(1),
  unitPrice: moneyValue,
  currency: z.string().trim().toUpperCase().length(3).regex(/^[A-Z]{3}$/).default("BDT"),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().default(true),
}).strict();

export const updateContractPriceSchema = z.object({
  scopeType: z.enum(BusinessPriceScopeType).optional(),
  productId: positiveId,
  variantId: positiveId,
  categoryId: positiveId,
  brandId: positiveId,
  minQuantity: z.number().int().min(1).max(1_000_000).optional(),
  unitPrice: moneyValue.optional(),
  currency: z.string().trim().toUpperCase().length(3).regex(/^[A-Z]{3}$/).optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const pricingPreviewSchema = z.object({
  productId: z.number().int().positive(),
  variantId: z.number().int().positive().nullable().optional(),
  quantity: z.number().int().min(1).max(1_000_000).default(1),
}).strict();
