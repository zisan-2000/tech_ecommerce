import Link from "next/link";
import { ArrowLeft, Inbox, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  backHref,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  backHref?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {backHref && (
          <Link href={backHref} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />Back
          </Link>
        )}
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base">{description}</p>}
      </div>
      {action && (
        <Button asChild className="shrink-0"><Link href={action.href}><Plus className="size-4" />{action.label}</Link></Button>
      )}
    </div>
  );
}

export function Surface({ className, children, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("rounded-2xl border border-border bg-card shadow-sm", className)} {...props}>{children}</section>;
}

const statusClasses: Record<string, string> = {
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  PAID: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  ACCEPTED: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  VERIFIED: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  PENDING: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  PENDING_VERIFICATION: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  SUBMITTED: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300",
  SENT: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300",
  VIEWED: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300",
  REJECTED: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  CANCELLED: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export function StatusBadge({ status }: { status: unknown }) {
  const value = String(status ?? "UNKNOWN").toUpperCase();
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap font-medium", statusClasses[value])}>
      {value.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}
    </Badge>
  );
}

export function EmptyState({ title = "Nothing here yet", description, action }: { title?: string; description?: string; action?: { label: string; href: string } }) {
  return (
    <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground"><Inbox className="size-6" /></span>
        <h2 className="mt-4 text-base font-semibold">{title}</h2>
        {description && <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>}
        {action && <Button asChild size="sm" className="mt-5"><Link href={action.href}><Plus className="size-4" />{action.label}</Link></Button>}
      </div>
    </div>
  );
}

export function formatCurrency(value: unknown, currency = "BDT") {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-BD", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

export function formatDate(value: unknown, includeTime = false) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
  }).format(date);
}
