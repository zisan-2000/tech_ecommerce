import { z } from "zod";

const moneyValue = z.union([
  z.number().finite().positive().max(999_999_999_999.99),
  z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/),
]);

const nonNegativeMoneyValue = z.union([
  z.number().finite().min(0).max(999_999_999_999.99),
  z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/),
]);

export const creditListSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).default(""),
  active: z.enum(["true", "false"]).optional(),
}).strict();

export const creditLedgerListSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export const setCreditLimitSchema = z.object({
  creditLimit: nonNegativeMoneyValue,
  paymentTermDays: z.number().int().min(0).max(365).optional(),
  reviewDate: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
}).strict();

export const adjustCreditSchema = z.object({
  adjustment: z.enum(["DEBIT", "CREDIT"]),
  amount: moneyValue,
  description: z.string().trim().min(3).max(1_000),
  idempotencyKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/),
}).strict();

export const validateCreditSchema = z.object({
  amount: moneyValue,
  currency: z.string().trim().toUpperCase().length(3).regex(/^[A-Z]{3}$/).default("BDT"),
}).strict();
