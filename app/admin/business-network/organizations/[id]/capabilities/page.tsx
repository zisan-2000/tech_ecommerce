import { businessResources } from "@/components/admin/business-network/config";
import { BusinessResourceDetail } from "@/components/admin/business-network/ResourceDetail";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <BusinessResourceDetail config={businessResources.organizations} id={id} focus="capabilities" />; }
