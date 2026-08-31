import type { Metadata } from "next";
import InvitationAcceptanceClient from "@/components/business-invitations/InvitationAcceptanceClient";

export const metadata: Metadata = {
  title: "Business Invitation",
  description: "Review and accept a secure Birds Of Eden Business Network invitation.",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function BusinessInvitationPage({ params }: PageProps) {
  const { token } = await params;
  return <InvitationAcceptanceClient token={token} />;
}
