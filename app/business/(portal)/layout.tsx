import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBusinessContext } from "@/lib/business-network/context";
import PortalShell from "@/components/business-portal/PortalShell";

export const metadata: Metadata = {
  title: "Business Portal",
  robots: { index: false, follow: false },
};

export default async function BusinessPortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/signin?returnUrl=/business");
  const context = await getBusinessContext();
  if (!context.activeMembership) redirect("/business/apply");
  return <PortalShell context={{ ...context, activeMembership: context.activeMembership }}>{children}</PortalShell>;
}

