import { z } from "zod";
import {
  PartnerAgreementStatus,
  PartnerAttributionModel,
  PartnerStatus,
} from "@/generated/prisma";
import { resourceIdSchema } from "./schemas";

const jsonRules = z.record(z.string().trim().min(1).max(120), z.unknown())
  .refine((value) => JSON.stringify(value).length <= 65_536, "JSON rules cannot exceed 64 KiB.");
const nonNegativeMoney = z.union([
  z.number().finite().min(0).max(999_999_999_999.99),
  z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/),
]);

export const partnerListSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).default(""),
  status: z.enum(PartnerStatus).optional(),
  capability: z.enum(["AFFILIATE", "RESELLER", "DEALER", "MARKETING_PARTNER", "SERVICE_PARTNER"]).optional(),
}).strict();

export const partnerAgreementVersionInputSchema = z.object({
  commissionPlanId: resourceIdSchema.nullable().optional(),
  attributionModel: z.enum(PartnerAttributionModel).default(PartnerAttributionModel.LAST_CLICK),
  attributionWindowDays: z.number().int().min(1).max(3650).default(30),
  allowSelfReferral: z.boolean().default(false),
  minimumSettlement: nonNegativeMoney.default(0),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("BDT"),
  territoryRules: jsonRules.nullable().optional(),
  categoryRules: jsonRules.nullable().optional(),
  commercialTerms: jsonRules.nullable().optional(),
}).strict();

export const createPartnerAgreementSchema = z.object({
  partnerProfileId: resourceIdSchema,
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullable().optional(),
  version: partnerAgreementVersionInputSchema,
}).strict().superRefine((value, context) => {
  if (value.endsAt && value.endsAt <= value.startsAt) {
    context.addIssue({
      code: "custom",
      path: ["endsAt"],
      message: "Agreement end date must be later than its start date.",
    });
  }
});

export const createPartnerAgreementVersionSchema = partnerAgreementVersionInputSchema;

export const partnerAgreementListSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).default(""),
  status: z.enum(PartnerAgreementStatus).optional(),
  partnerProfileId: resourceIdSchema.optional(),
}).strict();

export const partnerReasonSchema = z.object({
  reason: z.string().trim().min(3).max(1_000),
}).strict();
