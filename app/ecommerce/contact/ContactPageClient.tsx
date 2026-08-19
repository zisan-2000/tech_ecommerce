"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock3,
  Headphones,
  Loader2,
  Mail,
  MapPin,
  MessageSquareText,
  PackageSearch,
  Phone,
  Send,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type ContactPageClientProps = {
  siteTitle: string;
  contactEmail: string | null;
  contactNumber: string | null;
  address: string | null;
  initialSubject: string;
};

const enquiryTypes = [
  {
    icon: PackageSearch,
    title: "Product and order support",
    description: "Availability, order status, delivery, return and warranty guidance.",
  },
  {
    icon: Building2,
    title: "Corporate sales",
    description: "Bulk technology procurement, quotations and business requirements.",
  },
  {
    icon: Wrench,
    title: "Service request",
    description: "Product setup, troubleshooting and after-sales service enquiries.",
  },
];

export default function ContactPageClient({
  siteTitle,
  contactEmail,
  contactNumber,
  address,
  initialSubject,
}: ContactPageClientProps) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: initialSubject,
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setSubmitStatus("idle");
    setErrorMessage("");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(result.error || "We could not send your message. Please try again.");
      }

      setSubmitStatus("success");
      setFormData({ name: "", email: "", subject: "", message: "" });
    } catch (error) {
      setSubmitStatus("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "We could not send your message. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b border-border bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
        <div className="container mx-auto max-w-6xl px-4 py-16 text-center sm:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary-foreground/75">
            {siteTitle} support
          </p>
          <h1 className="mt-4 text-3xl font-bold sm:text-4xl">How can we help?</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-primary-foreground/85 sm:text-base">
            Contact our team about technology products, orders, delivery,
            corporate purchasing or after-sales support.
          </p>
        </div>
      </section>

      <section className="container mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <div className="grid gap-4 md:grid-cols-3">
          {enquiryTypes.map((type) => (
            <article key={type.title} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <type.icon className="h-5 w-5" aria-hidden />
              </div>
              <h2 className="mt-4 font-bold">{type.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{type.description}</p>
            </article>
          ))}
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[0.72fr_1.28fr]">
          <aside className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-lg font-bold">Contact information</h2>
              <div className="mt-5 space-y-4">
                {contactNumber && (
                  <a href={`tel:${contactNumber}`} className="flex gap-3 rounded-xl border border-border p-4 hover:border-primary/50">
                    <Phone className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                    <span>
                      <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phone</span>
                      <span className="mt-1 block text-sm font-semibold">{contactNumber}</span>
                    </span>
                  </a>
                )}
                {contactEmail && (
                  <a href={`mailto:${contactEmail}`} className="flex gap-3 rounded-xl border border-border p-4 hover:border-primary/50">
                    <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</span>
                      <span className="mt-1 block break-all text-sm font-semibold">{contactEmail}</span>
                    </span>
                  </a>
                )}
                {address && (
                  <div className="flex gap-3 rounded-xl border border-border p-4">
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                    <span>
                      <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Address</span>
                      <span className="mt-1 block whitespace-pre-line text-sm font-semibold">{address}</span>
                    </span>
                  </div>
                )}
                <div className="flex gap-3 rounded-xl border border-border p-4">
                  <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <span>
                    <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Online store</span>
                    <span className="mt-1 block text-sm font-semibold">Orders accepted 24/7</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
              <Headphones className="h-6 w-6 text-primary" aria-hidden />
              <h2 className="mt-4 font-bold">Include your order number</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                For an existing order, include the order number and checkout phone
                number so our team can investigate faster.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link href="/ecommerce/user/orders">View my orders</Link>
              </Button>
            </div>
          </aside>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-3">
              <MessageSquareText className="h-6 w-6 text-primary" aria-hidden />
              <h2 className="text-xl font-bold">Send a message</h2>
            </div>

            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-semibold">
                  <span>Name</span>
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                    name="name"
                    value={formData.name}
                    onChange={updateField}
                    className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
                <label className="space-y-2 text-sm font-semibold">
                  <span>Email</span>
                  <input
                    required
                    maxLength={254}
                    type="email"
                    autoComplete="email"
                    name="email"
                    value={formData.email}
                    onChange={updateField}
                    className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
                  />
                </label>
              </div>
              <label className="block space-y-2 text-sm font-semibold">
                <span>Subject</span>
                <input
                  required
                  minLength={3}
                  maxLength={120}
                  name="subject"
                  value={formData.subject}
                  onChange={updateField}
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <label className="block space-y-2 text-sm font-semibold">
                <span>Message</span>
                <textarea
                  required
                  minLength={10}
                  maxLength={3000}
                  rows={7}
                  name="message"
                  value={formData.message}
                  onChange={updateField}
                  className="w-full resize-y rounded-lg border border-input bg-background px-3 py-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
                />
              </label>

              {submitStatus === "success" && (
                <div role="status" className="flex gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
                  <span>Your message has been sent. Our team will respond as soon as possible.</span>
                </div>
              )}
              {submitStatus === "error" && (
                <div role="alert" className="flex gap-3 rounded-xl border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive">
                  <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
                  <span>{errorMessage}</span>
                </div>
              )}

              <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="mr-2 h-4 w-4" aria-hidden />
                )}
                {isSubmitting ? "Sending..." : "Send message"}
              </Button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
