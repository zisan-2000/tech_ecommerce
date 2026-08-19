import type { Metadata } from "next";
import Link from "next/link";
import {
  Box,
  CheckCircle2,
  Clock3,
  Headphones,
  MapPin,
  PackageCheck,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Shipping Policy",
  description:
    "How technology products are packed, dispatched, tracked and delivered across Bangladesh.",
  alternates: { canonical: "/ecommerce/shipping" },
};

const steps = [
  {
    icon: PackageCheck,
    title: "Order confirmation",
    description:
      "We verify the selected model, variant, stock, payment status and delivery address.",
  },
  {
    icon: Box,
    title: "Protective packing",
    description:
      "Technology products are packed according to their size and fragility, with serial and package checks where applicable.",
  },
  {
    icon: Truck,
    title: "Courier handover",
    description:
      "The order is assigned to an available delivery partner based on destination and product handling needs.",
  },
  {
    icon: MapPin,
    title: "Delivery and tracking",
    description:
      "Tracking details are shared when available. The recipient may be contacted to confirm delivery.",
  },
];

const guidance = [
  "Use a complete address, area, district and reachable phone number.",
  "Delivery charge and estimate are calculated during checkout from the order value and destination.",
  "Large, fragile or high-value items may require special handling or additional verification.",
  "Remote locations, holidays, weather and courier disruption can extend the estimate.",
  "Do not accept a visibly damaged or tampered package without documenting it and contacting support.",
  "Keep the invoice, packaging, serial label and accessories for warranty or return support.",
];

export default function ShippingPolicyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b border-border bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
        <div className="container mx-auto max-w-6xl px-4 py-16 text-center sm:py-20">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-foreground/15">
            <Truck className="h-7 w-7" aria-hidden />
          </div>
          <h1 className="mt-5 text-3xl font-bold sm:text-4xl">Shipping Policy</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-primary-foreground/85 sm:text-base">
            Clear packing, dispatch and delivery guidance for computers,
            components, accessories and other technology products.
          </p>
        </div>
      </section>

      <section className="container mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Clock3,
              title: "Delivery estimate",
              value: "Shown at checkout",
              note: "Based on destination and current serviceability",
            },
            {
              icon: ShieldCheck,
              title: "Product protection",
              value: "Secure packaging",
              note: "Handling selected for the product type",
            },
            {
              icon: Headphones,
              title: "Delivery support",
              value: "Order assistance",
              note: "Contact us with your order reference",
            },
          ].map((item) => (
            <article
              key={item.title}
              className="rounded-2xl border border-border bg-card p-6 shadow-sm"
            >
              <item.icon className="h-6 w-6 text-primary" aria-hidden />
              <p className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {item.title}
              </p>
              <h2 className="mt-1 text-lg font-bold">{item.value}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {item.note}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-14">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">
              Fulfilment process
            </p>
            <h2 className="mt-3 text-2xl font-bold sm:text-3xl">
              From confirmed order to your doorstep
            </h2>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <article
                key={step.title}
                className="relative rounded-2xl border border-border bg-card p-6"
              >
                <span className="absolute right-5 top-5 text-xs font-bold text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <step.icon className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="mt-5 font-bold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {step.description}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-14 grid gap-8 rounded-2xl border border-border bg-muted/35 p-6 sm:p-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">
              Before delivery
            </p>
            <h2 className="mt-3 text-2xl font-bold">Important guidelines</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Following these checks helps prevent delivery delays and makes any
              after-sales request easier to verify.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {guidance.map((item) => (
              <li
                key={item}
                className="flex gap-3 rounded-xl border border-border bg-card p-4 text-sm leading-6"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-5 rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-bold">Need help with a delivery?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Share your order number and the phone number used at checkout.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="sm">
              <Link href="/ecommerce/contact">Contact support</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/ecommerce/user/orders">View my orders</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
