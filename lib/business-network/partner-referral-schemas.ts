import { z } from "zod";
import { PartnerAssetStatus, PartnerAssetType, PartnerLeadStatus } from "@/generated/prisma";
import { isSafePartnerDestinationPath, normalizePartnerAssetCode } from "./partner-referral-core";
import { resourceIdSchema } from "./schemas";

const nullableDate = z.coerce.date().nullable().optional();
const destinationPath = z.string().trim().refine(isSafePartnerDestinationPath, "Destination must be a safe relative path.");
const assetCode = z.string().trim().min(4).max(64)
  .transform(normalizePartnerAssetCode)
  .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9_-]{3,63}$/));
const identityToken = z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const optionalMoney = z.union([
  z.number().finite().min(0).max(999_999_999_999.99),
  z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/),
]).nullable().optional();

export const partnerAssetListSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(PartnerAssetStatus).optional(),
  type: z.enum(PartnerAssetType).optional(),
}).strict();

export const createPartnerAssetSchema = z.object({
  type: z.enum(PartnerAssetType),
  code: assetCode.optional(),
  destinationPath: destinationPath.default("/"),
  campaignName: z.string().trim().min(1).max(160).nullable().optional(),
  startsAt: nullableDate,
  endsAt: nullableDate,
}).strict().superRefine((value, context) => {
  if (value.startsAt && value.endsAt && value.endsAt <= value.startsAt) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "End date must be later than start date." });
  }
});

export const updatePartnerAssetSchema = z.object({
  status: z.enum([PartnerAssetStatus.ACTIVE, PartnerAssetStatus.DISABLED]).optional(),
  destinationPath: destinationPath.optional(),
  campaignName: z.string().trim().min(1).max(160).nullable().optional(),
  startsAt: nullableDate,
  endsAt: nullableDate,
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const capturePartnerAttributionSchema = z.object({
  code: assetCode,
  visitorId: identityToken,
  sessionId: identityToken.optional(),
  landingPath: destinationPath.optional(),
}).strict();

export const createPartnerLeadSchema = z.object({
  companyName: z.string().trim().min(2).max(200),
  contactName: z.string().trim().min(2).max(160),
  contactEmail: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
  contactPhone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/).nullable().optional(),
  requirement: z.string().trim().min(3).max(5_000).nullable().optional(),
  estimatedValue: optionalMoney,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("BDT"),
}).strict().refine((value) => Boolean(value.contactEmail || value.contactPhone), {
  path: ["contactEmail"],
  message: "A contact email or E.164 phone number is required.",
});

export const partnerLeadListSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(160).default(""),
  status: z.enum(PartnerLeadStatus).optional(),
  partnerProfileId: resourceIdSchema.optional(),
}).strict();

export const duplicatePartnerLeadSchema = z.object({ duplicateOfId: resourceIdSchema }).strict();
export const assignPartnerLeadSchema = z.object({
  assignedToUserId: resourceIdSchema,
  ownershipExpiresAt: z.coerce.date().optional(),
}).strict();
export const winPartnerLeadSchema = z.object({ wonOrderId: z.number().int().positive() }).strict();
export const partnerLeadReasonSchema = z.object({ reason: z.string().trim().min(3).max(1_000) }).strict();

export type CreatePartnerAssetInput = z.infer<typeof createPartnerAssetSchema>;
export type UpdatePartnerAssetInput = z.infer<typeof updatePartnerAssetSchema>;
export type CapturePartnerAttributionInput = z.infer<typeof capturePartnerAttributionSchema>;
export type CreatePartnerLeadInput = z.infer<typeof createPartnerLeadSchema>;
export type PartnerAssetListInput = z.infer<typeof partnerAssetListSchema>;
export type PartnerLeadListInput = z.infer<typeof partnerLeadListSchema>;
