import { z } from "zod";
import {
  PartnerPayoutAccountStatus,
  PartnerPayoutAccountType,
  PartnerSettlementStatus,
} from "@/generated/prisma";
import { resourceIdSchema } from "./schemas";
import { normalizePayoutAccountNumber } from "./settlement-core";

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("BDT");
const optionalText = (maximum: number) => z.string().trim().min(1).max(maximum).nullable().optional();
const accountNumber = z.string().trim().min(6).max(64).transform(normalizePayoutAccountNumber);

export const settlementListSchema = z.object({
  page,
  limit,
  partnerProfileId: resourceIdSchema.optional(),
  status: z.enum(PartnerSettlementStatus).optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  periodFrom: z.coerce.date().optional(),
  periodTo: z.coerce.date().optional(),
  search: z.string().trim().max(100).optional(),
}).strict();

export const createSettlementSchema = z.object({
  partnerProfileId: resourceIdSchema,
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  currency,
  payoutAccountId: resourceIdSchema.nullable().optional(),
  commissionEntryIds: z.array(resourceIdSchema).min(1).max(500).optional(),
}).strict().superRefine((data, context) => {
  if (data.periodEnd <= data.periodStart) {
    context.addIssue({ code: "custom", path: ["periodEnd"], message: "Period end must be later than period start." });
  }
  if (data.commissionEntryIds && new Set(data.commissionEntryIds).size !== data.commissionEntryIds.length) {
    context.addIssue({ code: "custom", path: ["commissionEntryIds"], message: "Duplicate commission entries are not allowed." });
  }
});

export const settlementReasonSchema = z.object({
  reason: z.string().trim().min(3).max(500),
}).strict();

export const processSettlementSchema = z.object({
  outcome: z.enum(["START", "FAILED"]).default("START"),
  failureReason: z.string().trim().min(3).max(500).optional(),
}).strict().superRefine((data, context) => {
  if (data.outcome === "FAILED" && !data.failureReason) {
    context.addIssue({ code: "custom", path: ["failureReason"], message: "Failure reason is required." });
  }
  if (data.outcome === "START" && data.failureReason) {
    context.addIssue({ code: "custom", path: ["failureReason"], message: "Failure reason is only valid for a failed outcome." });
  }
});

export const markSettlementPaidSchema = z.object({
  paymentReference: z.string().trim().min(3).max(160),
}).strict();

const payoutAccountShape = {
  type: z.enum(PartnerPayoutAccountType),
  accountName: z.string().trim().min(2).max(160),
  bankName: optionalText(160),
  branchName: optionalText(160),
  routingNumber: optionalText(64),
  providerName: optionalText(100),
  accountNumber,
  isDefault: z.boolean().default(false),
};

function validatePayoutAccountShape(
  data: {
    type?: PartnerPayoutAccountType;
    bankName?: string | null;
    providerName?: string | null;
    accountNumber?: string;
  },
  context: z.RefinementCtx,
) {
  if (data.type === PartnerPayoutAccountType.BANK && !data.bankName) {
    context.addIssue({ code: "custom", path: ["bankName"], message: "Bank name is required for a bank account." });
  }
  if (data.type === PartnerPayoutAccountType.MOBILE_WALLET && !data.providerName) {
    context.addIssue({ code: "custom", path: ["providerName"], message: "Provider name is required for a mobile wallet." });
  }
  if (data.type === PartnerPayoutAccountType.MOBILE_WALLET && data.accountNumber && !/^\+?\d{10,15}$/.test(data.accountNumber)) {
    context.addIssue({ code: "custom", path: ["accountNumber"], message: "Mobile wallet number must contain 10 to 15 digits." });
  }
  if (data.type === PartnerPayoutAccountType.BANK && data.accountNumber && !/^[A-Z0-9]{6,34}$/.test(data.accountNumber)) {
    context.addIssue({ code: "custom", path: ["accountNumber"], message: "Bank account number must contain 6 to 34 letters or digits." });
  }
}

export const createPayoutAccountSchema = z.object(payoutAccountShape).strict().superRefine(validatePayoutAccountShape);

export const updatePayoutAccountSchema = z.object({
  accountName: payoutAccountShape.accountName.optional(),
  bankName: payoutAccountShape.bankName,
  branchName: payoutAccountShape.branchName,
  routingNumber: payoutAccountShape.routingNumber,
  providerName: payoutAccountShape.providerName,
  accountNumber: accountNumber.optional(),
  isDefault: z.boolean().optional(),
}).strict().refine((data) => Object.values(data).some((value) => value !== undefined), {
  message: "At least one payout account field is required.",
});

export const payoutAccountListSchema = z.object({
  page,
  limit,
  partnerProfileId: resourceIdSchema.optional(),
  status: z.enum(PartnerPayoutAccountStatus).optional(),
  type: z.enum(PartnerPayoutAccountType).optional(),
}).strict();

export const payoutAccountRejectSchema = settlementReasonSchema;

export type SettlementListInput = z.infer<typeof settlementListSchema>;
export type CreateSettlementInput = z.infer<typeof createSettlementSchema>;
export type ProcessSettlementInput = z.infer<typeof processSettlementSchema>;
export type CreatePayoutAccountInput = z.infer<typeof createPayoutAccountSchema>;
export type UpdatePayoutAccountInput = z.infer<typeof updatePayoutAccountSchema>;
export type PayoutAccountListInput = z.infer<typeof payoutAccountListSchema>;
