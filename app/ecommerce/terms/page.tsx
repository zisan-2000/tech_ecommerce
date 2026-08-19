import type { Metadata } from "next";
import Link from "next/link";
import {
  BadgeCheck,
  CreditCard,
  FileText,
  PackageCheck,
  Scale,
  ShieldCheck,
  ShoppingCart,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSiteSettingsForSeo } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description:
    "Terms governing accounts, technology product orders, pricing, payments, delivery, warranty and use of our online store.",
  alternates: { canonical: "/ecommerce/terms" },
};

const sections = [
  {
    icon: ShoppingCart,
    title: "Orders and availability",
    paragraphs: [
      "Submitting an order is a request to purchase. An order is accepted after stock, price, payment and delivery information have been verified.",
      "Products, variants and warehouse stock can change before confirmation. If an item becomes unavailable, we may offer an alternative, revise the order with your approval or cancel and refund the affected amount.",
    ],
  },
  {
    icon: CreditCard,
    title: "Pricing and payment",
    paragraphs: [
      "Prices are shown in the displayed currency and may change without notice. The confirmed order total includes applicable discounts, taxes and delivery charges shown during checkout.",
      "Payment methods are subject to provider approval. EMI information, where shown, is indicative until the issuing bank confirms eligibility, fees and tenure.",
    ],
  },
  {
    icon: PackageCheck,
    title: "Delivery and inspection",
    paragraphs: [
      "Delivery estimates are not guarantees and may be affected by stock location, courier coverage, weather, holidays or events outside our reasonable control.",
      "Inspect the package and product as soon as possible. Report missing, damaged or incorrect items through our support channel within the period stated in the return policy.",
    ],
  },
  {
    icon: Wrench,
    title: "Warranty and technical products",
    paragraphs: [
      "Warranty coverage depends on the product, brand and warranty provider shown on the product page or invoice. Manufacturer or distributor warranty conditions may apply.",
      "Compatibility information is guidance unless expressly confirmed for a complete build. Customers should verify model, connector, dimensions, power and platform requirements before purchase.",
    ],
  },
  {
    icon: BadgeCheck,
    title: "Software and digital items",
    paragraphs: [
      "Software, activation keys, subscriptions and digital products are governed by their publisher licence terms. Activated, revealed or delivered digital credentials may not be returnable except where required by law or proven defective.",
      "You must not resell, copy, bypass licensing controls or use a digital product outside its permitted licence.",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Accounts and acceptable use",
    paragraphs: [
      "Keep account and contact information accurate and protect your credentials. You are responsible for activity performed through your account unless promptly reported as unauthorized.",
      "Automated abuse, fraud, unlawful use, interference with the service, false claims and attempts to access restricted systems are prohibited.",
    ],
  },
  {
    icon: Scale,
    title: "Cancellations, returns and liability",
    paragraphs: [
      "Cancellation and return eligibility follows the status of the order and our published return policy. Refund timing can also depend on the payment provider.",
      "To the extent permitted by applicable law, liability is limited to direct loss connected to the affected order. Nothing in these terms removes rights that cannot legally be excluded.",
    ],
  },
];

export default async function TermsPage() {
  const settings = await getSiteSettingsForSeo();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="border-b border-border bg-muted/40">
        <div className="container mx-auto max-w-5xl px-4 py-14 sm:py-16">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileText className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="mt-5 text-3xl font-bold sm:text-4xl">
            Terms and Conditions
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
            These terms explain how accounts, product orders, payments,
            fulfilment and after-sales support work when you use {settings.siteTitle}.
          </p>
          <p className="mt-3 text-xs font-medium text-muted-foreground">
            Effective date: 19 August 2026
          </p>
        </div>
      </section>

      <section className="container mx-auto max-w-5xl px-4 py-12">
        <div className="rounded-2xl border border-border bg-card p-5 text-sm leading-7 text-muted-foreground sm:p-6">
          By accessing the store, creating an account or placing an order, you
          agree to these terms and the linked privacy, shipping and return
          policies. If you do not agree, do not submit an order.
        </div>

        <div className="mt-8 space-y-4">
          {sections.map((section, index) => (
            <article
              key={section.title}
              className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7"
            >
              <div className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <section.icon className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <h2 className="text-lg font-bold">
                    {index + 1}. {section.title}
                  </h2>
                  <div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground">
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-lg font-bold">Policy changes and contact</h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            We may update these terms to reflect operational, legal or service
            changes. The effective date above identifies the current version.
            Contact support before ordering if any condition is unclear.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild size="sm">
              <Link href="/ecommerce/contact">Contact support</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/ecommerce/returns">Read return policy</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
