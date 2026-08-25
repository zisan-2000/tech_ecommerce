import { z } from "zod";
import {
  OrganizationMemberStatus,
  OrganizationPortalRole,
} from "@/generated/prisma";

export const resourceIdSchema = z.string().trim().min(1).max(64);

export const organizationSwitchSchema = z.object({
  organizationId: resourceIdSchema,
}).strict();

export const invitationTokenSchema = z
  .string()
  .trim()
  .min(32)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/, "Invitation token is malformed.");

export const createInvitationSchema = z.object({
  email: z.email().trim().max(254).transform((email) => email.toLowerCase()),
  role: z.enum(OrganizationPortalRole),
}).strict();

export const updateMemberRolesSchema = z.object({
  roles: z
    .array(z.enum(OrganizationPortalRole))
    .min(1)
    .max(Object.keys(OrganizationPortalRole).length)
    .superRefine((roles, context) => {
      if (new Set(roles).size !== roles.length) {
        context.addIssue({
          code: "custom",
          message: "Duplicate organization roles are not allowed.",
        });
      }
    }),
}).strict();

export const updateMemberStatusSchema = z.object({
  status: z.enum([
    OrganizationMemberStatus.ACTIVE,
    OrganizationMemberStatus.SUSPENDED,
    OrganizationMemberStatus.REMOVED,
  ]),
}).strict();
