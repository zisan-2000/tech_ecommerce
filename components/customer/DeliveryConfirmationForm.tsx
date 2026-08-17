"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import {
  CheckCircle2,
  ImagePlus,
  Loader2,
  ShieldCheck,
  Truck,
} from "lucide-react";

type ProofResponse = {
  shipment: {
    id: number;
    orderId: number;
    courier?: string | null;
    trackingNumber?: string | null;
    status: string;
    expectedDate?: string | null;
    deliveredAt?: string | null;
    confirmationReady: boolean;
  };
  order: {
    id: number;
    name: string;
    status: string;
    paymentStatus: string;
    createdAt: string;
  };
  proof?: {
    id: number;
    tickReceived: boolean;
    tickCorrectItems: boolean;
    tickGoodCondition: boolean;
    photoUrl?: string | null;
    note?: string | null;
    confirmedAt: string;
  } | null;
};

const CHECKS = [
  { key: "tickReceived", label: "I have received this package." },
  { key: "tickCorrectItems", label: "The delivered items match my order." },
  {
    key: "tickGoodCondition",
    label: "The package arrived in acceptable condition.",
  },
] as const;

function formatDate(value?: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-muted/80 ${className}`}
      aria-hidden="true"
    />
  );
}

export function DeliveryConfirmationForm({ token }: { token: string }) {
  const [data, setData] = useState<ProofResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [note, setNote] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checks, setChecks] = useState({
    tickReceived: false,
    tickCorrectItems: false,
    tickGoodCondition: false,
  });

  useEffect(() => {
    if (!token) {
      setError("Invalid confirmation link.");
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/delivery-proofs/confirm/${token}`, {
          cache: "no-store",
        });
        const payload = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(payload?.error || "Failed to load confirmation data");
        }

        setData(payload);
        if (payload?.proof) {
          setChecks({
            tickReceived: payload.proof.tickReceived,
            tickCorrectItems: payload.proof.tickCorrectItems,
            tickGoodCondition: payload.proof.tickGoodCondition,
          });
          setNote(payload.proof.note || "");
          setPhotoUrl(payload.proof.photoUrl || "");
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load confirmation data",
        );
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [token]);

  const handlePhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("confirmationToken", token);

      const res = await fetch("/api/upload/delivery-proofs", {
        method: "POST",
        body: formData,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.url) {
        throw new Error(
          payload?.message || payload?.error || "Photo upload failed",
        );
      }

      setPhotoUrl(payload.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;

    try {
      setSubmitting(true);
      setError(null);

      const res = await fetch(`/api/delivery-proofs/confirm/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          note,
          photoUrl: photoUrl || null,
          ...checks,
        }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.error || "Failed to submit delivery proof");
      }

      setData((current) =>
        current
          ? {
              ...current,
              shipment: {
                ...current.shipment,
                status: payload?.shipment?.status || current.shipment.status,
                deliveredAt:
                  payload?.shipment?.deliveredAt ||
                  current.shipment.deliveredAt,
              },
              proof: payload.proof,
            }
          : current,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit delivery proof",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-destructive">
        {error || "Confirmation data unavailable."}
      </div>
    );
  }

  const alreadyConfirmed = Boolean(data.proof);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Delivery Proof
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">
              Customer confirmation
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Order #{data.order.id}{" "}
              {data.shipment.courier ? `via ${data.shipment.courier}` : ""}
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-right text-card-foreground shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Shipment Status
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {data.shipment.status}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Customer
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {data.order.name}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <Truck className="h-5 w-5 text-primary" />
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Tracking
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {data.shipment.trackingNumber || "Not assigned"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Delivery Time
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {formatDate(data.shipment.deliveredAt || data.shipment.expectedDate)}
          </p>
        </div>
      </div>

      {alreadyConfirmed ? (
        <div className="rounded-[28px] border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary p-3 text-primary-foreground">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Delivery already confirmed
              </h2>
              <p className="text-sm text-muted-foreground">
                Submitted on {formatDate(data.proof?.confirmedAt)}
              </p>
            </div>
          </div>

          {data.proof?.note ? (
            <p className="mt-4 rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm text-foreground">
              {data.proof.note}
            </p>
          ) : null}

          {data.proof?.photoUrl ? (
            <a
              href={data.proof.photoUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex text-sm font-medium text-primary underline"
            >
              View uploaded proof photo
            </a>
          ) : null}
        </div>
      ) : (
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-[28px] border border-border bg-card p-6 shadow-sm">
            <p className="text-sm font-medium text-foreground">
              Enter the delivery PIN shared by the delivery team, then confirm
              all three checks.
            </p>

            <div className="mt-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Delivery PIN
              </label>
              <input
                value={pin}
                onChange={(event) =>
                  setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                maxLength={6}
                className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-base tracking-[0.32em] text-foreground outline-none ring-0 transition focus:border-primary"
                placeholder="000000"
              />
            </div>

            <div className="mt-5 space-y-3">
              {CHECKS.map((item) => (
                <label
                  key={item.key}
                  className="flex items-start gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground"
                >
                  <input
                    type="checkbox"
                    checked={checks[item.key]}
                    onChange={(event) =>
                      setChecks((current) => ({
                        ...current,
                        [item.key]: event.target.checked,
                      }))
                    }
                    className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[28px] border border-border bg-card p-6 shadow-sm">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Optional note
              </label>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={5}
                className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary"
                placeholder="Add any issue, exception, or comment about this delivery."
              />
            </div>

            <div className="rounded-[28px] border border-border bg-card p-6 shadow-sm">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Optional photo
              </label>
              <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
                <ImagePlus className="h-7 w-7 text-muted-foreground" />
                <span className="mt-3 text-sm font-medium text-foreground">
                  Upload package or handover proof
                </span>
                <span className="mt-1 text-xs text-muted-foreground">
                  Courier face photo is optional, not required.
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
              </label>

              {uploading ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Uploading photo...
                </p>
              ) : null}

              {photoUrl ? (
                <a
                  href={photoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex text-sm font-medium text-primary underline"
                >
                  View uploaded photo
                </a>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting || uploading}
            className="inline-flex w-full items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Submit delivery proof
          </button>
        </form>
      )}
    </div>
  );
}
