import { z } from "zod";
import {
  CommissionBasis,
  CommissionCalculationType,
  CommissionPlanStatus,
  CommissionScopeType,
  CommissionStatus,
  ProductType,
} from "@/generated/prisma";
import { normalizeCommissionPlanCode } from "./commission-core";
import { resourceIdSchema } from "./schemas";

const currencySchema = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
const moneySchema = z.union([
  z.number().finite().min(0).max(999_999_999_999.99),
  z.string().trim().regex(/^\d{1,12}(?:\.\d{1,4})?$/),
]);
const signedMoneySchema = z.union([
  z.number().finite().min(-999_999_999_999.99).max(999_999_999_999.99),
  z.string().trim().regex(/^-?\d{1,12}(?:\.\d{1,2})?$/),
]);
const nullableDateSchema = z.coerce.date().nullable().optional();

export const commissionPlanListSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(160).default(""),
  status: z.enum(CommissionPlanStatus).optional(),
}).strict();

export const createCommissionPlanSchema = z.object({
  code: z.string().trim().min(3).max(32).transform(normalizeCommissionPlanCode)
    .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/)),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(5_000).nullable().optional(),
  currency: currencySchema.default("BDT"),
  startsAt: nullableDateSchema,
  endsAt: nullableDateSchema,
}).strict().superRefine((value, context) => {
  if (value.startsAt && value.endsAt && value.endsAt <= value.startsAt) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "End date must be later than start date." });
  }
});

export const updateCommissionPlanSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  description: z.string().trim().max(5_000).nullable().optional(),
  status: z.enum(CommissionPlanStatus).optional(),
  startsAt: nullableDateSchema,
  endsAt: nullableDateSchema,
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required.");

const commissionRuleShape = z.object({
  name: z.string().trim().min(2).max(160),
  scopeType: z.enum(CommissionScopeType),
  productId: z.number().int().positive().nullable().optional(),
  variantId: z.number().int().positive().nullable().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  brandId: z.number().int().positive().nullable().optional(),
  productType: z.enum(ProductType).nullable().optional(),
  calculationType: z.enum(CommissionCalculationType),
  basis: z.enum(CommissionBasis).default(CommissionBasis.NET_ITEM),
  rate: moneySchema.nullable().optional(),
  fixedAmount: moneySchema.nullable().optional(),
  minOrderAmount: moneySchema.nullable().optional(),
  minQuantity: z.number().int().positive().max(1_000_000).nullable().optional(),
  maxCommission: moneySchema.nullable().optional(),
  priority: z.number().int().min(0).max(1_000_000).default(100),
  isActive: z.boolean().default(true),
});

function validateRule(value: z.infer<typeof commissionRuleShape>, context: z.RefinementCtx) {
  if (value.calculationType === CommissionCalculationType.PERCENTAGE) {
    if (value.rate == null || Number(value.rate) <= 0 || Number(value.rate) > 100) {
      context.addIssue({ code: "custom", path: ["rate"], message: "Percentage rules require a rate greater than 0 and at most 100." });
    }
    if (value.fixedAmount != null) context.addIssue({ code: "custom", path: ["fixedAmount"], message: "Percentage rules cannot define fixedAmount." });
  } else {
    if (value.fixedAmount == null || Number(value.fixedAmount) <= 0) {
      context.addIssue({ code: "custom", path: ["fixedAmount"], message: "Fixed rules require a fixedAmount greater than zero." });
    }
    if (value.rate != null) context.addIssue({ code: "custom", path: ["rate"], message: "Fixed rules cannot define rate." });
  }
  if (value.scopeType === CommissionScopeType.LEAD && value.basis !== CommissionBasis.LEAD_VALUE) {
    context.addIssue({ code: "custom", path: ["basis"], message: "Lead rules must use LEAD_VALUE." });
  }
  if (value.scopeType !== CommissionScopeType.LEAD && value.basis === CommissionBasis.LEAD_VALUE) {
    context.addIssue({ code: "custom", path: ["basis"], message: "LEAD_VALUE is only valid for lead rules." });
  }
  if (value.scopeType !== CommissionScopeType.GLOBAL && value.scopeType !== CommissionScopeType.LEAD
    && value.basis === CommissionBasis.ORDER_NET) {
    context.addIssue({ code: "custom", path: ["basis"], message: "ORDER_NET is only valid for a global rule." });
  }
}

export const createCommissionRuleSchema = commissionRuleShape.strict().superRefine(validateRule);
export const updateCommissionRuleSchema = commissionRuleShape.partial().strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const commissionEntryListSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(CommissionStatus).optional(),
  partnerProfileId: resourceIdSchema.optional(),
  orderId: z.coerce.number().int().positive().optional(),
  partnerLeadId: resourceIdSchema.optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
}).strict().superRefine((value, context) => {
  if (value.createdFrom && value.createdTo && value.createdTo < value.createdFrom) {
    context.addIssue({ code: "custom", path: ["createdTo"], message: "createdTo cannot be before createdFrom." });
  }
});

export const commissionReasonSchema = z.object({
  reason: z.string().trim().min(3).max(1_000),
}).strict();

export const createCommissionAdjustmentSchema = z.object({
  partnerProfileId: resourceIdSchema,
  sourceEntryId: resourceIdSchema.nullable().optional(),
  amount: signedMoneySchema.refine((value) => Number(value) !== 0, "Adjustment amount cannot be zero."),
  currency: currencySchema,
  reason: z.string().trim().min(3).max(1_000),
}).strict();

export type CommissionPlanListInput = z.infer<typeof commissionPlanListSchema>;
export type CreateCommissionPlanInput = z.infer<typeof createCommissionPlanSchema>;
export type UpdateCommissionPlanInput = z.infer<typeof updateCommissionPlanSchema>;
export type CreateCommissionRuleInput = z.infer<typeof createCommissionRuleSchema>;
export type UpdateCommissionRuleInput = z.infer<typeof updateCommissionRuleSchema>;
export type CommissionEntryListInput = z.infer<typeof commissionEntryListSchema>;
export type CreateCommissionAdjustmentInput = z.infer<typeof createCommissionAdjustmentSchema>;
