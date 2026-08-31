import { redirect } from "next/navigation";
import { getBusinessContext } from "@/lib/business-network/context";

export default async function OrganizationMembersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getBusinessContext();
  const membership = context.activeMembership;

  if (!membership) {
    redirect("/business/apply");
  }

  if (!membership.permissions.includes("organization.members.read")) {
    redirect("/business");
  }

  return children;
}
