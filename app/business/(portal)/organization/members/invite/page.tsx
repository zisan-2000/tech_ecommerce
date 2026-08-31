import { redirect } from "next/navigation";
import { getBusinessContext } from "@/lib/business-network/context";
import { MemberInviteForm } from "@/components/business-portal/PortalForms";

export default async function Page() {
  const context = await getBusinessContext();
  const membership = context.activeMembership;

  if (!membership) {
    redirect("/business/apply");
  }

  if (!membership.permissions.includes("organization.members.invite")) {
    redirect("/business");
  }

  return <MemberInviteForm />;
}
