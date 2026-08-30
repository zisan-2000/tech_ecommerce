import { z } from "zod";
import { BusinessNetworkError } from "./business-error";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format.")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00+06:00`)), "Date is invalid.");

export const businessReportQuerySchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    granularity: z.enum(["day", "week", "month"]).default("day"),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("BDT"),
  })
  .strict();

export const businessReportExportSectionSchema = z.enum([
  "overview",
  "organizations",
  "partners",
  "credit",
  "pipeline",
]);

export type BusinessReportGranularity = z.infer<typeof businessReportQuerySchema>["granularity"];
export type BusinessReportExportSection = z.infer<typeof businessReportExportSectionSchema>;

const DHAKA_TIME_ZONE = "Asia/Dhaka";
const DHAKA_OFFSET = "+06:00";
const DAY_MS = 86_400_000;

function dhakaDate(value: string) {
  return new Date(`${value}T00:00:00${DHAKA_OFFSET}`);
}

function dhakaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftIsoDate(value: string, days: number) {
  const shifted = new Date(dhakaDate(value).getTime() + days * DAY_MS);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}

export function parseBusinessReportQuery(url: URL) {
  const today = dhakaToday();
  const parsed = businessReportQuerySchema.parse({
    from: url.searchParams.get("from") || shiftIsoDate(today, -29),
    to: url.searchParams.get("to") || today,
    granularity: url.searchParams.get("granularity") || "day",
    currency: url.searchParams.get("currency") || "BDT",
  });
  const from = dhakaDate(parsed.from);
  const to = dhakaDate(parsed.to);
  const inclusiveDays = Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;

  if (inclusiveDays < 1) {
    throw new BusinessNetworkError(422, "REPORT_RANGE_INVALID", "The report start date must not be after the end date.");
  }
  if (inclusiveDays > 366) {
    throw new BusinessNetworkError(422, "REPORT_RANGE_TOO_LARGE", "A report range cannot exceed 366 days.");
  }
  if (parsed.granularity === "day" && inclusiveDays > 120) {
    throw new BusinessNetworkError(422, "REPORT_GRANULARITY_INVALID", "Use weekly or monthly granularity for ranges over 120 days.");
  }

  const toExclusive = new Date(to.getTime() + DAY_MS);
  const previousToExclusive = from;
  const previousFrom = new Date(from.getTime() - inclusiveDays * DAY_MS);

  return {
    ...parsed,
    fromDate: from,
    toExclusive,
    previousFrom,
    previousToExclusive,
    inclusiveDays,
    timezone: DHAKA_TIME_ZONE,
  };
}

export function parseBusinessReportExportSection(url: URL) {
  return businessReportExportSectionSchema.parse(url.searchParams.get("section") || "overview");
}
