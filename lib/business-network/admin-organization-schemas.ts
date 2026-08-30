import { z } from "zod";
import {
  OrganizationCapabilityStatus,
  OrganizationCapabilityType,
  OrganizationCompanyType,
  OrganizationStatus,
} from "@/generated/prisma";
import { resourceIdSchema } from "./schemas";

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional().transform((value) =>
    value === undefined ? undefined : value || null,
  );

export const adminOrganizationListSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(160).default(""),
  status: z.enum(OrganizationStatus).optional(),
}).strict();

export const createAdminOrganizationSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/).optional(),
  legalName: z.string().trim().min(2).max(240),
  displayName: optionalText(160),
  companyType: z.enum(OrganizationCompanyType),
  status: z.enum([OrganizationStatus.DRAFT, OrganizationStatus.PENDING_VERIFICATION]).default(OrganizationStatus.DRAFT),
  email: z.email().trim().toLowerCase().max(254).nullable().optional(),
  phone: optionalText(32),
  website: z.url().max(500).nullable().optional(),
  tradeLicenseNo: optionalText(120),
  tin: optionalText(120),
  bin: optionalText(120),
  registrationNo: optionalText(120),
  country: z.string().trim().toUpperCase().length(2).default("BD"),
  currency: z.string().trim().toUpperCase().length(3).default("BDT"),
  ownerUserId: resourceIdSchema.nullable().optional(),
  capabilities: z.array(z.enum(OrganizationCapabilityType)).max(6).default([]),
}).strict();

export const updateAdminOrganizationSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/).optional(),
  legalName: z.string().trim().min(2).max(240).optional(),
  displayName: optionalText(160),
  companyType: z.enum(OrganizationCompanyType).optional(),
  email: z.email().trim().toLowerCase().max(254).nullable().optional(),
  phone: optionalText(32),
  website: z.url().max(500).nullable().optional(),
  tradeLicenseNo: optionalText(120),
  tin: optionalText(120),
  bin: optionalText(120),
  registrationNo: optionalText(120),
  country: z.string().trim().toUpperCase().length(2).optional(),
  currency: z.string().trim().toUpperCase().length(3).optional(),
}).strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");

export const organizationReasonSchema = z.object({
  reason: z.string().trim().min(3).max(1_000),
}).strict();

export const createOrganizationCapabilitySchema = z.object({
  type: z.enum(OrganizationCapabilityType),
  status: z.enum(OrganizationCapabilityStatus).default(OrganizationCapabilityStatus.PENDING),
  reason: optionalText(1_000),
}).strict();

export const updateOrganizationCapabilitySchema = z.object({
  status: z.enum(OrganizationCapabilityStatus),
  reason: optionalText(1_000),
}).strict();

export const organizationDocumentDecisionSchema = z.object({
  reason: z.string().trim().min(3).max(1_000).optional(),
}).strict();
