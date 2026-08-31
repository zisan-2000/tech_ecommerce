"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  Loader2,
  LockKeyhole,
  LogIn,
  Mail,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { signOut, useSession } from "@/lib/auth-client";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
});

type InvitationDetails = {
  invitation: {
    id: string;
    email: string;
    role: string;
    expiresAt: string;
    acceptedAt: string | null;
    revokedAt: string | null;
    createdAt: string;
    state: string;
  };
  organization: {
    legalName: string;
    displayName: string | null;
  };
};

type ApiError = {
  error?: string;
  code?: string;
};

type AcceptResult = {
  accepted: boolean;
  idempotent: boolean;
  organizationId: string;
  memberId: string;
  role: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_FORMATTER.format(date);
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3.5">
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-background text-muted-foreground shadow-sm">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <div className="mt-1 break-words text-sm font-semibold text-foreground">{value}</div>
      </div>
    </div>
  );
}

export default function InvitationAcceptanceClient({ token }: { token: string }) {
  const { data: session, status: sessionStatus } = useSession();
  const [details, setDetails] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState<AcceptResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const invitationPath = useMemo(
    () => `/business/invitations/${encodeURIComponent(token)}`,
    [token],
  );
  const signInHref = `/signin?returnUrl=${encodeURIComponent(invitationPath)}`;
  const signUpHref = `/sign-up?returnUrl=${encodeURIComponent(invitationPath)}`;

  useEffect(() => {
    const controller = new AbortController();
    async function loadInvitation() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/business/invitations/${encodeURIComponent(token)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await response.json()) as InvitationDetails & ApiError;
        if (!response.ok) {
          setError({
            code: data.code || "INVITATION_UNAVAILABLE",
            error: data.error || "This invitation is not available.",
          });
          return;
        }
        setDetails(data);
      } catch (caught) {
        if ((caught as Error).name !== "AbortError") {
          setError({ error: "The invitation could not be loaded. Please try again." });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadInvitation();
    return () => controller.abort();
  }, [token]);

  async function acceptInvitation() {
    setAccepting(true);
    setError(null);
    try {
      const response = await fetch(`/api/business/invitations/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await response.json()) as AcceptResult & ApiError;
      if (!response.ok) {
        setError({
          code: data.code,
          error: data.error || "The invitation could not be accepted.",
        });
        return;
      }
      setAccepted(data);
    } catch {
      setError({ error: "The invitation could not be accepted. Please try again." });
    } finally {
      setAccepting(false);
    }
  }

  async function useDifferentAccount() {
    await signOut({ redirect: false });
    window.location.assign(signInHref);
  }

  const organizationName = details?.organization.displayName || details?.organization.legalName || "this organization";
  const signedInEmail = session?.user?.email || null;
  const emailMismatch = error?.code === "INVITATION_EMAIL_MISMATCH";

  return (
    <main className="min-h-svh bg-gradient-to-b from-background via-background to-muted/40 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-7 flex items-center justify-center gap-3 text-center">
          <span className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Building2 className="size-5" />
          </span>
          <div className="text-left">
            <p className="text-sm font-bold tracking-tight text-foreground">Birds Of Eden Business Network</p>
            <p className="text-xs text-muted-foreground">Secure organization invitation</p>
          </div>
        </div>

        <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-xl shadow-black/5">
          <div className="border-b border-border bg-muted/20 px-6 py-7 sm:px-9 sm:py-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="size-4" />
                  Verified invitation link
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Join {organizationName}
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Review the invitation details below, then sign in with the invited email address to accept your organization role.
                </p>
              </div>
              {details && <Badge variant="outline" className="w-fit px-3 py-1.5">{details.invitation.state}</Badge>}
            </div>
          </div>

          <div className="px-6 py-7 sm:px-9 sm:py-8">
            {loading ? (
              <div className="grid min-h-72 place-items-center text-center">
                <div>
                  <Loader2 className="mx-auto size-7 animate-spin text-primary" />
                  <p className="mt-4 font-medium text-foreground">Loading invitation…</p>
                  <p className="mt-1 text-sm text-muted-foreground">Checking the secure invitation token.</p>
                </div>
              </div>
            ) : !details ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center">
                <AlertTriangle className="mx-auto size-8 text-destructive" />
                <h2 className="mt-3 text-lg font-semibold text-foreground">Invitation unavailable</h2>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                  {error?.error || "This invitation may be invalid, expired, revoked, or already accepted."}
                </p>
                <Button asChild variant="outline" className="mt-5">
                  <Link href="/">Return to storefront</Link>
                </Button>
              </div>
            ) : accepted ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900 dark:bg-emerald-950/40 sm:p-8">
                <CheckCircle2 className="mx-auto size-12 text-emerald-600 dark:text-emerald-400" />
                <h2 className="mt-4 text-2xl font-bold tracking-tight text-foreground">Invitation accepted</h2>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                  You are now an active member of <strong className="text-foreground">{organizationName}</strong> with the <strong className="text-foreground">{accepted.role.replaceAll("_", " ")}</strong> role.
                </p>
                <Button asChild size="lg" className="mt-6">
                  <Link href="/business">Open business portal <ArrowRight className="size-4" /></Link>
                </Button>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailRow icon={<Building2 className="size-4" />} label="Organization" value={organizationName} />
                  <DetailRow icon={<UserRoundCheck className="size-4" />} label="Assigned role" value={details.invitation.role.replaceAll("_", " ")} />
                  <DetailRow icon={<Mail className="size-4" />} label="Invited email" value={details.invitation.email} />
                  <DetailRow icon={<Clock3 className="size-4" />} label="Expires" value={formatDate(details.invitation.expiresAt)} />
                </div>

                <div className="mt-6 rounded-2xl border border-border bg-muted/25 p-5">
                  <div className="flex items-start gap-3">
                    <LockKeyhole className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">Email ownership is enforced</h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Only the account matching the invited email can accept this invitation. The server validates the email again when you accept.
                      </p>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="mt-5 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3.5 text-sm text-destructive">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <div>
                        <p className="font-semibold">{emailMismatch ? "Different account detected" : "Could not accept invitation"}</p>
                        <p className="mt-1 leading-5">{error.error}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-7 border-t border-border pt-6">
                  {sessionStatus === "loading" ? (
                    <Button disabled size="lg" className="w-full"><Loader2 className="size-4 animate-spin" />Checking account…</Button>
                  ) : sessionStatus !== "authenticated" ? (
                    <div>
                      <Button asChild size="lg" className="w-full">
                        <Link href={signInHref}><LogIn className="size-4" />Sign in to accept invitation</Link>
                      </Button>
                      <div className="mt-3 flex flex-col gap-2 text-center text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-center">
                        <span>Don&apos;t have an account?</span>
                        <Link className="font-semibold text-foreground hover:underline" href={signUpHref}>Create one with the invited email</Link>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-4 flex flex-col gap-2 rounded-xl border border-border bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">Signed in as</p>
                          <p className="mt-1 truncate text-sm font-semibold text-foreground">{signedInEmail || "Authenticated user"}</p>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={useDifferentAccount}>Use different account</Button>
                      </div>
                      <Button type="button" size="lg" className="w-full" disabled={accepting} onClick={acceptInvitation}>
                        {accepting ? <><Loader2 className="size-4 animate-spin" />Accepting invitation…</> : <><UserRoundCheck className="size-4" />Accept invitation</>}
                      </Button>
                      <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
                        By accepting, you will join {organizationName} with the {details.invitation.role.replaceAll("_", " ")} portal role.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
          Never forward invitation links. Each link contains a private token and expires automatically.
        </p>
      </div>
    </main>
  );
}
