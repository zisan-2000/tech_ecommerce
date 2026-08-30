"use client";

import Link from "next/link";
import { isValidElement, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeDollarSign,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  FileCheck2,
  HandCoins,
  PackageCheck,
  ShieldCheck,
  ShoppingCart,
  Users,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBusinessPortal } from "./PortalContext";
import { EmptyState, formatCurrency, formatDate, PageHeader, StatusBadge, Surface } from "./PortalPrimitives";

type JsonRecord = Record<string, unknown>;

async function fetchJson(endpoint: string) {
  const response = await fetch(endpoint, { cache: "no-store" });
  const data = await response.json() as JsonRecord & { error?: string };
  if (!response.ok) throw new Error(data.error || "Business data is unavailable.");
  return data;
}

function Metric({ label, value, hint, icon: Icon, href }: { label: string; value: string; hint: string; icon: typeof ClipboardList; href: string }) {
  return <Link href={href} className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:hover:border-blue-800"><div className="flex items-start justify-between"><span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300"><Icon className="size-5" /></span><ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-blue-600" /></div><p className="mt-5 text-2xl font-bold tabular-nums">{value}</p><p className="mt-1 text-sm font-medium">{label}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></Link>;
}

export function PortalOverviewPage() {
  const context = useBusinessPortal();
  const { permissions, activeCapabilities, organization } = context.activeMembership;
  const corporate = activeCapabilities.includes("CORPORATE_BUYER");
  const partner = permissions.includes("partner.dashboard.read");
  const [data, setData] = useState<Record<string, JsonRecord | null>>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const requests: Array<[string, string]> = [];
    if (permissions.includes("rfq.read")) requests.push(["rfqs", "/api/business/rfqs?limit=5"]);
    if (permissions.includes("quotation.read")) requests.push(["quotations", "/api/business/quotations?limit=5"]);
    if (permissions.includes("order.read")) requests.push(["orders", "/api/business/orders?limit=5"]);
    if (permissions.includes("credit.read")) requests.push(["credit", "/api/business/credit"]);
    if (partner) requests.push(["partner", "/api/business/partner"]);
    let active = true;
    Promise.all(requests.map(async ([key, url]) => { try { return [key, await fetchJson(url)] as const; } catch { return [key, null] as const; } })).then((rows) => { if (active) { setData(Object.fromEntries(rows)); setLoading(false); } });
    return () => { active = false; };
  }, [partner, permissions]);
  const count = (key: string) => loading ? "…" : String((data[key]?.pagination as { total?: number } | undefined)?.total ?? 0);
  const credit = data.credit?.account as JsonRecord | null | undefined;
  const availableCredit = credit ? Number(credit.creditLimit ?? 0) - Number(credit.currentBalance ?? 0) : 0;
  return <><PageHeader eyebrow="Business portal" title={`Welcome to ${organization.displayName || organization.legalName}`} description="One secure workspace for corporate purchasing, finance, partnership and organization administration." /><div className="mb-6 flex flex-wrap gap-2"><StatusBadge status={organization.status} />{activeCapabilities.map((capability) => <StatusBadge key={capability} status={capability} />)}</div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{corporate && <Metric label="RFQs" value={count("rfqs")} hint="Draft and submitted requests" icon={ClipboardList} href="/business/rfqs" />}{corporate && <Metric label="Quotations" value={count("quotations")} hint="Offers awaiting review" icon={FileCheck2} href="/business/quotations" />}{corporate && <Metric label="Corporate orders" value={count("orders")} hint="Orders linked to this company" icon={PackageCheck} href="/business/orders" />}{permissions.includes("credit.read") && <Metric label="Available credit" value={loading ? "…" : formatCurrency(availableCredit, String(credit?.currency ?? organization.currency))} hint="Current approved facility" icon={WalletCards} href="/business/credit" />}{partner && <Metric label="Partner workspace" value={String((data.partner?.partnerProfile as JsonRecord | undefined)?.status ?? (loading ? "…" : "Active"))} hint="Referrals and commission" icon={HandCoins} href="/business/partner" />}</div><div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]"><Surface className="p-5 sm:p-6"><h2 className="text-lg font-semibold">Quick actions</h2><p className="mt-1 text-sm text-muted-foreground">Continue the most common business workflows.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{permissions.includes("rfq.create") && <Button asChild variant="outline" className="h-auto justify-start p-4"><Link href="/business/rfqs/new"><ClipboardList className="size-5 text-blue-600" /><span className="text-left"><span className="block font-semibold">Create an RFQ</span><span className="block text-xs font-normal text-muted-foreground">Request volume pricing</span></span></Link></Button>}{permissions.includes("customer_po.create") && <Button asChild variant="outline" className="h-auto justify-start p-4"><Link href="/business/purchase-orders/new"><ShoppingCart className="size-5 text-blue-600" /><span className="text-left"><span className="block font-semibold">Submit a PO</span><span className="block text-xs font-normal text-muted-foreground">Send an accepted customer PO</span></span></Link></Button>}{permissions.includes("partner.leads.create") && <Button asChild variant="outline" className="h-auto justify-start p-4"><Link href="/business/partner/leads/new"><BadgeDollarSign className="size-5 text-blue-600" /><span className="text-left"><span className="block font-semibold">Register a lead</span><span className="block text-xs font-normal text-muted-foreground">Protect a partner opportunity</span></span></Link></Button>}{permissions.includes("organization.members.invite") && <Button asChild variant="outline" className="h-auto justify-start p-4"><Link href="/business/organization/members/invite"><Users className="size-5 text-blue-600" /><span className="text-left"><span className="block font-semibold">Invite a teammate</span><span className="block text-xs font-normal text-muted-foreground">Assign a portal role</span></span></Link></Button>}</div></Surface><Surface className="p-5 sm:p-6"><h2 className="text-lg font-semibold">Account readiness</h2><div className="mt-5 space-y-4"><Readiness label="Organization access" ready={organization.status === "ACTIVE"} detail={organization.status.replaceAll("_", " ")} /><Readiness label="Corporate commerce" ready={corporate} detail={corporate ? "Enabled" : "Not enabled"} /><Readiness label="Partner program" ready={partner} detail={partner ? "Enabled" : "Not enabled"} /><Readiness label="Role-based access" ready={permissions.length > 0} detail={`${permissions.length} effective permissions`} /></div></Surface></div></>;
}

function Readiness({ label, ready, detail }: { label: string; ready: boolean; detail: string }) { return <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className={`grid size-8 place-items-center rounded-full ${ready ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300"}`}><CheckCircle2 className="size-4" /></span><span className="text-sm font-medium">{label}</span></div><span className="text-xs text-muted-foreground">{detail}</span></div>; }

export function CreditAccountPage() {
  const [account, setAccount] = useState<JsonRecord | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { let active = true; fetchJson("/api/business/credit").then((data) => { if (active) setAccount(data.account as JsonRecord); }).catch((caught) => { if (active) setError(caught.message); }); return () => { active = false; }; }, []);
  const limit = Number(account?.creditLimit ?? 0), balance = Number(account?.currentBalance ?? 0), available = Math.max(0, limit - balance), usedPercent = limit > 0 ? Math.min(100, (balance / limit) * 100) : 0;
  return <><PageHeader eyebrow="Finance" title="Credit account" description="A real-time view of your approved corporate credit facility." />{error && <Surface className="p-8 text-center text-destructive">{error}</Surface>}{!error && !account && <Surface className="h-72 animate-pulse" />}{account && <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]"><Surface className="overflow-hidden"><div className="bg-gradient-to-br from-blue-700 to-blue-500 p-6 text-white"><div className="flex items-center justify-between"><WalletCards className="size-7" /><StatusBadge status={account.isActive ? "ACTIVE" : "INACTIVE"} /></div><p className="mt-8 text-sm text-blue-100">Available credit</p><p className="mt-1 text-4xl font-bold tabular-nums">{formatCurrency(available, String(account.currency ?? "BDT"))}</p><div className="mt-6 h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-white" style={{ width: `${100 - usedPercent}%` }} /></div><div className="mt-3 flex justify-between text-xs text-blue-100"><span>{usedPercent.toFixed(0)}% utilized</span><span>Limit {formatCurrency(limit, String(account.currency ?? "BDT"))}</span></div></div></Surface><Surface className="p-6"><h2 className="font-semibold">Account terms</h2><dl className="mt-5 space-y-4 text-sm"><Row label="Current balance" value={formatCurrency(balance, String(account.currency ?? "BDT"))} /><Row label="Payment term" value={`${String(account.paymentTermDays ?? 0)} days`} /><Row label="Next review" value={formatDate(account.reviewDate)} /><Row label="Account status" value={String(account.isActive ? "Active" : "Inactive")} /></dl><Button asChild variant="outline" className="mt-6 w-full"><Link href="/business/credit/statement">View full statement<ArrowRight className="size-4" /></Link></Button></Surface></div>}</>;
}

function Row({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4 border-b border-border pb-3 last:border-0"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>; }

export function PartnerOverviewPage() {
  const [profile, setProfile] = useState<JsonRecord | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { let active = true; fetchJson("/api/business/partner").then((data) => { if (active) setProfile(data.partnerProfile as JsonRecord); }).catch((caught) => { if (active) setError(caught.message); }); return () => { active = false; }; }, []);
  return <><PageHeader eyebrow="Partnership" title="Partner overview" description="Your agreement, referral program and payout readiness in one place." />{error && <Surface className="p-8 text-center text-destructive">{error}</Surface>}{!error && !profile && <Surface className="h-72 animate-pulse" />}{profile && <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Partner code" value={String(profile.partnerCode ?? "—")} hint="Your unique program identity" icon={HandCoins} href="/business/partner/links" /><Metric label="Program status" value={String(profile.status ?? "—")} hint="Current partner standing" icon={ShieldCheck} href="/business/partner" /><Metric label="Leads" value="View" hint="Registered opportunities" icon={ClipboardList} href="/business/partner/leads" /><Metric label="Commission" value="Ledger" hint="Earnings and reversals" icon={CircleDollarSign} href="/business/partner/commissions" /></div><Surface className="mt-6 p-6"><h2 className="font-semibold">Partner profile</h2><div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3"><Info label="Partner code" value={profile.partnerCode} /><Info label="Status" value={<StatusBadge status={profile.status} />} /><Info label="Approved" value={formatDate(profile.approvedAt)} /><Info label="Created" value={formatDate(profile.createdAt)} /></div></Surface></>}</>;
}

function Info({ label, value }: { label: string; value: unknown }) { const content = isValidElement(value) ? value : String(value ?? "—"); return <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><div className="mt-1.5 text-sm font-medium">{content}</div></div>; }

export function OrganizationProfilePage() {
  const [organization, setOrganization] = useState<JsonRecord | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { let active = true; fetchJson("/api/business/organization/profile").then((data) => { if (active) setOrganization(data.organization as JsonRecord); }).catch((caught) => { if (active) setError(caught.message); }); return () => { active = false; }; }, []);
  const capabilities = useMemo(() => Array.isArray(organization?.capabilities) ? organization.capabilities as JsonRecord[] : [], [organization]);
  return <><PageHeader eyebrow="Organization" title="Company profile" description="Verified legal identity and commercial account configuration." />{error && <Surface className="p-8 text-center text-destructive">{error}</Surface>}{!error && !organization && <Surface className="h-80 animate-pulse" />}{organization && <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]"><Surface className="p-6"><div className="flex items-start gap-4"><span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300"><Building2 className="size-7" /></span><div><h2 className="text-xl font-semibold">{String(organization.displayName || organization.legalName)}</h2><p className="text-sm text-muted-foreground">{String(organization.legalName)}</p><div className="mt-3"><StatusBadge status={organization.status} /></div></div></div><div className="mt-7 grid gap-5 sm:grid-cols-2"><Info label="Organization code" value={String(organization.code)} /><Info label="Company type" value={String(organization.companyType).replaceAll("_", " ")} /><Info label="Email" value={String(organization.email ?? "—")} /><Info label="Phone" value={String(organization.phone ?? "—")} /><Info label="Trade license" value={String(organization.tradeLicenseNo ?? "—")} /><Info label="TIN / BIN" value={`${String(organization.tin ?? "—")} / ${String(organization.bin ?? "—")}`} /><Info label="Country" value={String(organization.country)} /><Info label="Currency" value={String(organization.currency)} /></div></Surface><Surface className="p-6"><h2 className="font-semibold">Capabilities</h2><div className="mt-5 space-y-3">{capabilities.map((capability) => <div key={String(capability.type)} className="flex items-center justify-between rounded-xl border border-border p-4"><span className="text-sm font-medium">{String(capability.type).replaceAll("_", " ")}</span><StatusBadge status={capability.status} /></div>)}{capabilities.length === 0 && <EmptyState description="No business capabilities are configured." />}</div></Surface></div>}</>;
}
