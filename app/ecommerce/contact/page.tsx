import type { Metadata } from "next";
import ContactPageClient from "./ContactPageClient";
import { getSiteSettingsForSeo } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Contact our technology sales and support team about products, orders, delivery, corporate sales or service requests.",
  alternates: { canonical: "/ecommerce/contact" },
};

type ContactPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const subjectLabels: Record<string, string> = {
  "corporate-sales": "Corporate sales enquiry",
  "service-booking": "Service booking request",
};

export default async function ContactPage({ searchParams }: ContactPageProps) {
  const [settings, query] = await Promise.all([
    getSiteSettingsForSeo(),
    searchParams,
  ]);
  const rawSubject = Array.isArray(query.subject)
    ? query.subject[0]
    : query.subject;
  const normalizedSubject = String(rawSubject || "").trim().slice(0, 120);
  const initialSubject =
    subjectLabels[normalizedSubject.toLowerCase()] || normalizedSubject;

  return (
    <ContactPageClient
      siteTitle={settings.siteTitle}
      contactEmail={settings.contactEmail}
      contactNumber={settings.contactNumber}
      address={settings.address}
      initialSubject={initialSubject}
    />
  );
}
