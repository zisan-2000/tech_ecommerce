import { z } from "zod";

export const notificationPreferencesSchema = z.object({
  emailEnabled: z.boolean(),
  organizationEmail: z.boolean(),
  salesEmail: z.boolean(),
  financeEmail: z.boolean(),
  partnershipEmail: z.boolean(),
  securityEmail: z.boolean(),
}).strict();

