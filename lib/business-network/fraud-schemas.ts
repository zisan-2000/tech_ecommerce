import { z } from "zod";

export const businessRiskDecisionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("START_REVIEW"),
    assignedToUserId: z.string().trim().min(1).max(64).optional(),
  }).strict(),
  z.object({
    action: z.enum(["CONFIRM", "FALSE_POSITIVE", "RESOLVE"]),
    note: z.string().trim().min(3).max(1000),
  }).strict(),
]);

